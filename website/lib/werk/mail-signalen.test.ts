import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bepaalNieuweKandidaten,
  bepaalNieuwSignaalData,
  haalMailSignalen,
  dempSignaal,
  maakMailTaak,
  markeerBeantwoord,
  haalSignaalVoorAntwoord,
} from "./mail-signalen";
import { haalKandidaatBerichten } from "@/lib/google-gmail/api";
import { classificeerKandidaatBerichten } from "./mail-classificatie";
import type { GmailKandidaatBericht } from "@/lib/google-gmail/api";
import type { SchoolOptie } from "./school-matching";

vi.mock("@/lib/google-gmail/api", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/google-gmail/api")>();
  return { ...echt, haalKandidaatBerichten: vi.fn() };
});
vi.mock("./mail-classificatie", () => ({ classificeerKandidaatBerichten: vi.fn() }));

const mockKandidaten = vi.mocked(haalKandidaatBerichten);
const mockClassificeer = vi.mocked(classificeerKandidaatBerichten);

function kandidaat(overrides: Partial<GmailKandidaatBericht> & { gmailMessageId: string }): GmailKandidaatBericht {
  return { gmailThreadId: "thread-1", van: "iemand@school.nl", onderwerp: "Onderwerp", ontvangenOp: "2026-08-17T09:00:00.000Z", snippet: "Fragment", ...overrides };
}

const SCHOLEN: SchoolOptie[] = [{ id: 1, schoolName: "Springplank" }];

describe("bepaalNieuweKandidaten — puur", () => {
  it("filtert kandidaten met een bestaande mail-signalen-rij eruit", () => {
    const kandidaten = [kandidaat({ gmailMessageId: "a" }), kandidaat({ gmailMessageId: "b" })];
    expect(bepaalNieuweKandidaten(kandidaten, new Set(["a"]))).toEqual([kandidaten[1]]);
  });

  it("geeft alles terug wanneer niets al bestaat", () => {
    const kandidaten = [kandidaat({ gmailMessageId: "a" })];
    expect(bepaalNieuweKandidaten(kandidaten, new Set())).toEqual(kandidaten);
  });
});

describe("bepaalNieuwSignaalData — puur (uitsluitend aangeroepen met een ECHTE classificatie, zie haalMailSignalen)", () => {
  it("status 'niet_relevant' zonder schoolmatch-poging wanneer actieNodig false is", () => {
    const data = bepaalNieuwSignaalData(kandidaat({ gmailMessageId: "a", onderwerp: "Nieuwsbrief" }), { gmailMessageId: "a", actieNodig: false, reden: "Nieuwsbrief." }, SCHOLEN);
    expect(data).toEqual({ status: "niet_relevant", reden: "Nieuwsbrief.", categorie: null, schoolId: null });
  });

  it("status 'gesignaleerd' + betrouwbare schoolmatch wanneer actieNodig true is", () => {
    const data = bepaalNieuwSignaalData(
      kandidaat({ gmailMessageId: "a", van: "Springplank <info@springplank.nl>", onderwerp: "Vraag over Springplank" }),
      { gmailMessageId: "a", actieNodig: true, reden: "Stelt een vraag." },
      SCHOLEN
    );
    expect(data.status).toBe("gesignaleerd");
    expect(data.schoolId).toBe(1);
  });
});

function maakFakePayload() {
  const mailDocs: Record<number, Record<string, unknown>> = {};
  const taakDocs: Record<number, Record<string, unknown>> = {};
  let volgendeId = 100;
  return {
    mailDocs,
    taakDocs,
    find: vi.fn(async ({ collection, where }: { collection: string; where?: unknown }) => {
      if (collection !== "mail-signalen") return { docs: [] };
      const alle = Object.values(mailDocs);
      const w = where as { and?: Array<Record<string, { equals?: unknown; in?: unknown[] }>> } | undefined;
      const eigenaarClause = w?.and?.find((c) => "eigenaar" in c)?.eigenaar;
      const idClause = w?.and?.find((c) => "id" in c)?.id;
      const msgIdClause = w?.and?.find((c) => "gmailMessageId" in c)?.gmailMessageId;
      const gefilterd = alle.filter((d) => {
        if (eigenaarClause?.equals !== undefined && d.eigenaar !== eigenaarClause.equals) return false;
        if (idClause?.equals !== undefined && d.id !== idClause.equals) return false;
        if (msgIdClause?.in !== undefined && !msgIdClause.in.includes(d.gmailMessageId)) return false;
        return true;
      });
      return { docs: gefilterd };
    }),
    create: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      const id = volgendeId++;
      const doc = { id, ...data };
      if (collection === "mail-signalen") mailDocs[id] = doc;
      if (collection === "personal-tasks") taakDocs[id] = doc;
      return doc;
    }),
    update: vi.fn(async ({ collection, id, data }: { collection: string; id: number; data: Record<string, unknown> }) => {
      if (collection === "mail-signalen" && mailDocs[id]) Object.assign(mailDocs[id]!, data);
      return { id, ...data };
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("haalMailSignalen — Payload-aware orchestratie", () => {
  it("classificeert een nieuw bericht en toont het uitsluitend wanneer actieNodig true is", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Stelt een vraag." }]);

    const payload = maakFakePayload();
    const resultaat = await haalMailSignalen(payload as never, 1, "token", []);

    expect(resultaat.signalen).toHaveLength(1);
    expect(resultaat.signalen[0]!.reden).toBe("Stelt een vraag.");
    expect(resultaat.bekeken).toBe(1);
    expect(resultaat.actieNodig).toBe(1);
    expect(resultaat.genegeerd).toBe(0);
    expect(payload.create).toHaveBeenCalledWith(expect.objectContaining({ collection: "mail-signalen", data: expect.objectContaining({ status: "gesignaleerd" }) }));
  });

  it("geeft de categorie van de classificatie door voor de statusbadge", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Vraagt om een afspraak.", categorie: "afspraak" }]);

    const payload = maakFakePayload();
    const resultaat = await haalMailSignalen(payload as never, 1, "token", []);

    expect(resultaat.signalen[0]!.categorie).toBe("afspraak");
  });

  it("valt terug op categorie 'antwoord_nodig' wanneer het model geen categorie meestuurt", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Stelt een vraag." }]);

    const payload = maakFakePayload();
    const resultaat = await haalMailSignalen(payload as never, 1, "token", []);

    expect(resultaat.signalen[0]!.categorie).toBe("antwoord_nodig");
  });

  it("toont een niet-actionabel bericht NIET, maar slaat de classificatie-uitkomst wel op (voorkomt herclassificatie)", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: false, reden: "Nieuwsbrief." }]);

    const payload = maakFakePayload();
    const resultaat = await haalMailSignalen(payload as never, 1, "token", []);

    expect(resultaat.signalen).toHaveLength(0);
    expect(resultaat.genegeerd).toBe(1);
    expect(Object.values(payload.mailDocs)).toHaveLength(1);
  });

  it("classificeert een al-bekend bericht NIET opnieuw (geen tweede AI-aanroep, standaard passief pad)", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Stelt een vraag." }]);

    const payload = maakFakePayload();
    await haalMailSignalen(payload as never, 1, "token", []);
    mockClassificeer.mockClear();

    await haalMailSignalen(payload as never, 1, "token", []);
    expect(mockClassificeer).not.toHaveBeenCalled();
  });

  it("een gedempt signaal blijft weg bij een volgende lezing (verdwijnt niet vanzelf terug)", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Stelt een vraag." }]);

    const payload = maakFakePayload();
    const eersteResultaat = await haalMailSignalen(payload as never, 1, "token", []);
    await dempSignaal(payload as never, 1, eersteResultaat.signalen[0]!.signaalId);

    const tweedeResultaat = await haalMailSignalen(payload as never, 1, "token", []);
    expect(tweedeResultaat.signalen).toHaveLength(0);
  });

  it("isoleert per eigenaar — gebruiker B ziet gebruiker A's classificatie niet als 'al bekend' (aparte AI-aanroep per gebruiker)", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Stelt een vraag." }]);

    const payload = maakFakePayload();
    await haalMailSignalen(payload as never, 1, "token", []);
    mockClassificeer.mockClear();

    await haalMailSignalen(payload as never, 2, "token", []);
    expect(mockClassificeer).toHaveBeenCalled();
  });

  it("productiecorrectie: een mislukte classificatie-aanroep laat een NIEUWE kandidaat volledig ongeclassificeerd (geen rij, dus geen permanente 'niet_relevant') — geen crash", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockRejectedValue(new Error("providerfout"));

    const payload = maakFakePayload();
    const resultaat = await haalMailSignalen(payload as never, 1, "token", []);

    expect(resultaat.signalen).toHaveLength(0);
    expect(Object.values(payload.mailDocs)).toHaveLength(0);
  });

  it("productiecorrectie: na een mislukte poging telt de kandidaat bij de VOLGENDE lezing weer als nieuw (wordt opnieuw geprobeerd, niet permanent geblokkeerd)", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockRejectedValueOnce(new Error("tijdelijke storing"));

    const payload = maakFakePayload();
    await haalMailSignalen(payload as never, 1, "token", []);
    expect(Object.values(payload.mailDocs)).toHaveLength(0);

    mockClassificeer.mockResolvedValueOnce([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Stelt een vraag." }]);
    const tweedeResultaat = await haalMailSignalen(payload as never, 1, "token", []);

    expect(tweedeResultaat.signalen).toHaveLength(1);
    expect(mockClassificeer).toHaveBeenCalledTimes(2);
  });

  it("forceerHerclassificatie: beoordeelt een eerder 'niet_relevant' bericht opnieuw (fout-negatief herstellen)", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: false, reden: "Leek een nieuwsbrief." }]);

    const payload = maakFakePayload();
    const eerste = await haalMailSignalen(payload as never, 1, "token", []);
    expect(eerste.signalen).toHaveLength(0);

    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Bleek toch een vraag te bevatten." }]);
    const herclassificatie = await haalMailSignalen(payload as never, 1, "token", [], { forceerHerclassificatie: true });

    expect(herclassificatie.signalen).toHaveLength(1);
    expect(herclassificatie.signalen[0]!.reden).toBe("Bleek toch een vraag te bevatten.");
    expect(herclassificatie.bekeken).toBe(1);
    expect(herclassificatie.actieNodig).toBe(1);
  });

  it("forceerHerclassificatie: laat AL-VERWERKTE statussen (gedempt/taak_aangemaakt/beantwoord) met rust", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Vraag." }]);

    const payload = maakFakePayload();
    const eerste = await haalMailSignalen(payload as never, 1, "token", []);
    await dempSignaal(payload as never, 1, eerste.signalen[0]!.signaalId);
    mockClassificeer.mockClear();

    const herclassificatie = await haalMailSignalen(payload as never, 1, "token", [], { forceerHerclassificatie: true });

    expect(mockClassificeer).not.toHaveBeenCalled();
    expect(herclassificatie.algVerwerkt).toBe(1);
    expect(herclassificatie.signalen).toHaveLength(0);
    expect(payload.mailDocs[eerste.signalen[0]!.signaalId]!.status).toBe("gedempt");
  });

  it("zonder forceerHerclassificatie beoordeelt een 'niet_relevant' bericht NOOIT vanzelf opnieuw", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: false, reden: "Nieuwsbrief." }]);

    const payload = maakFakePayload();
    await haalMailSignalen(payload as never, 1, "token", []);
    mockClassificeer.mockClear();

    await haalMailSignalen(payload as never, 1, "token", []);
    expect(mockClassificeer).not.toHaveBeenCalled();
  });
});

describe("dempSignaal / maakMailTaak / markeerBeantwoord — eigenaar-gescoped acties", () => {
  it("dempSignaal weigert (false) voor andermans signaalId — geen crash, geen mutatie", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Vraag." }]);
    const payload = maakFakePayload();
    const { signalen: [signaal] } = await haalMailSignalen(payload as never, 1, "token", []);

    const ok = await dempSignaal(payload as never, 2, signaal!.signaalId);
    expect(ok).toBe(false);
    expect(payload.mailDocs[signaal!.signaalId]!.status).toBe("gesignaleerd");
  });

  it("maakMailTaak maakt een personal-task aan en koppelt het signaal (status taak_aangemaakt)", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Vraag." }]);
    const payload = maakFakePayload();
    const { signalen: [signaal] } = await haalMailSignalen(payload as never, 1, "token", []);

    const resultaat = await maakMailTaak(payload as never, 1, signaal!.signaalId, { titel: "Beantwoorden: Vraag", datum: "2026-08-17" });

    expect(resultaat?.taakId).toBeGreaterThan(0);
    expect(payload.taakDocs[resultaat!.taakId]).toEqual(expect.objectContaining({ titel: "Beantwoorden: Vraag", eigenaar: 1, status: "open" }));
    expect(payload.mailDocs[signaal!.signaalId]!.status).toBe("taak_aangemaakt");
  });

  it("maakMailTaak geeft null terug voor andermans signaalId (geen taak aangemaakt)", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Vraag." }]);
    const payload = maakFakePayload();
    const { signalen: [signaal] } = await haalMailSignalen(payload as never, 1, "token", []);

    const resultaat = await maakMailTaak(payload as never, 2, signaal!.signaalId, { titel: "x", datum: "2026-08-17" });
    expect(resultaat).toBeNull();
    expect(Object.keys(payload.taakDocs)).toHaveLength(0);
  });

  it("markeerBeantwoord zet status + beantwoordOp, nooit de mailtekst zelf", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Vraag." }]);
    const payload = maakFakePayload();
    const { signalen: [signaal] } = await haalMailSignalen(payload as never, 1, "token", []);

    const ok = await markeerBeantwoord(payload as never, 1, signaal!.signaalId);
    expect(ok).toBe(true);
    expect(payload.mailDocs[signaal!.signaalId]!.status).toBe("beantwoord");
    expect(payload.mailDocs[signaal!.signaalId]!.beantwoordOp).toBeTruthy();
    expect(Object.keys(payload.mailDocs[signaal!.signaalId]!)).not.toContain("bodyText");
  });

  it("haalSignaalVoorAntwoord geeft uitsluitend de pointer + schoolId terug, null voor andermans signaal", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1", gmailThreadId: "thread-9" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Vraag." }]);
    const payload = maakFakePayload();
    const { signalen: [signaal] } = await haalMailSignalen(payload as never, 1, "token", []);

    const eigen = await haalSignaalVoorAntwoord(payload as never, 1, signaal!.signaalId);
    expect(eigen).toEqual({ gmailMessageId: "msg-1", gmailThreadId: "thread-9", schoolId: null });

    const andermans = await haalSignaalVoorAntwoord(payload as never, 2, signaal!.signaalId);
    expect(andermans).toBeNull();
  });
});
