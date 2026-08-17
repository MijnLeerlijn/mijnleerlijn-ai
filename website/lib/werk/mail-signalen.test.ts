import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bepaalNieuweKandidaten,
  bepaalNieuwSignaalData,
  michelIsAanZet,
  bepaalOfKandidatenScanNodigIs,
  laatsteKandidaatPerThread,
  haalMailSignalen,
  dempSignaal,
  maakMailTaak,
  markeerBeantwoord,
  haalSignaalVoorAntwoord,
} from "./mail-signalen";
import { haalKandidaatBerichten, haalThreadBerichtenSamenvatting } from "@/lib/google-gmail/api";
import { classificeerKandidaatBerichten } from "./mail-classificatie";
import type { GmailKandidaatBericht, ThreadBerichtSamenvatting } from "@/lib/google-gmail/api";
import type { SchoolOptie } from "./school-matching";

vi.mock("@/lib/google-gmail/api", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/google-gmail/api")>();
  return { ...echt, haalKandidaatBerichten: vi.fn(), haalThreadBerichtenSamenvatting: vi.fn() };
});
vi.mock("./mail-classificatie", () => ({ classificeerKandidaatBerichten: vi.fn() }));

const mockKandidaten = vi.mocked(haalKandidaatBerichten);
const mockThreadSamenvatting = vi.mocked(haalThreadBerichtenSamenvatting);
const mockClassificeer = vi.mocked(classificeerKandidaatBerichten);

function kandidaat(overrides: Partial<GmailKandidaatBericht> & { gmailMessageId: string }): GmailKandidaatBericht {
  return { gmailThreadId: "thread-1", van: "iemand@school.nl", onderwerp: "Onderwerp", ontvangenOp: "2026-08-17T09:00:00.000Z", snippet: "Fragment", ...overrides };
}

function threadBericht(overrides: Partial<ThreadBerichtSamenvatting> & { gmailMessageId: string }): ThreadBerichtSamenvatting {
  return { van: "iemand@school.nl", onderwerp: "Onderwerp", snippet: "Fragment", vanEigenAccount: false, ontvangenOp: "2026-08-17T09:00:00.000Z", ...overrides };
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

describe("michelIsAanZet — puur (productiecorrectie 2026-08-19, punt 1: centrale regel)", () => {
  it("true (Michel is aan zet) wanneer de thread leeg/onbekend is — fail-safe, nooit onterecht sluiten bij twijfel", () => {
    expect(michelIsAanZet([])).toBe(true);
  });

  it("true wanneer het laatste bericht NIET van de eigen (gekoppelde) account komt", () => {
    expect(michelIsAanZet([threadBericht({ gmailMessageId: "a", vanEigenAccount: false })])).toBe(true);
  });

  it("false wanneer het laatste bericht WEL van de eigen account komt — Michel heeft zelf al geantwoord", () => {
    expect(michelIsAanZet([threadBericht({ gmailMessageId: "a", vanEigenAccount: true })])).toBe(false);
  });

  it("kijkt naar het chronologisch LAATSTE bericht, niet naar het eerste in de array (punt 2: een thread is niet permanent beantwoord)", () => {
    const berichten = [
      threadBericht({ gmailMessageId: "eerder-van-michel", vanEigenAccount: true, ontvangenOp: "2026-08-19T10:00:00.000Z" }),
      threadBericht({ gmailMessageId: "later-van-de-ander", vanEigenAccount: false, ontvangenOp: "2026-08-19T15:00:00.000Z" }),
    ];
    // Michel antwoordde eerst, maar de ander schreef daarna weer terug — Michel is opnieuw aan zet.
    expect(michelIsAanZet(berichten)).toBe(true);
  });
});

describe("bepaalOfKandidatenScanNodigIs — puur (punt 6: begrensde periodieke sync)", () => {
  it("true wanneer nog nooit gescand is", () => {
    expect(bepaalOfKandidatenScanNodigIs(null)).toBe(true);
  });

  it("false wanneer de vorige scan minder dan 15 minuten geleden is", () => {
    const nu = new Date("2026-08-19T12:00:00.000Z");
    expect(bepaalOfKandidatenScanNodigIs("2026-08-19T11:50:00.000Z", nu)).toBe(false);
  });

  it("true wanneer de vorige scan 15 minuten of langer geleden is", () => {
    const nu = new Date("2026-08-19T12:00:00.000Z");
    expect(bepaalOfKandidatenScanNodigIs("2026-08-19T11:45:00.000Z", nu)).toBe(true);
  });
});

describe("laatsteKandidaatPerThread — puur (punt 2: voorkomt dubbele signalen)", () => {
  it("houdt per thread alleen het chronologisch laatste bericht over", () => {
    const kandidaten = [
      kandidaat({ gmailMessageId: "vroeg", gmailThreadId: "thread-A", ontvangenOp: "2026-08-19T09:00:00.000Z" }),
      kandidaat({ gmailMessageId: "laat", gmailThreadId: "thread-A", ontvangenOp: "2026-08-19T15:00:00.000Z" }),
    ];
    const resultaat = laatsteKandidaatPerThread(kandidaten);
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0]!.gmailMessageId).toBe("laat");
  });

  it("laat afzonderlijke threads onaangeroerd", () => {
    const kandidaten = [kandidaat({ gmailMessageId: "a", gmailThreadId: "thread-A" }), kandidaat({ gmailMessageId: "b", gmailThreadId: "thread-B" })];
    expect(laatsteKandidaatPerThread(kandidaten)).toHaveLength(2);
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
      const statusClause = w?.and?.find((c) => "status" in c)?.status;
      const gefilterd = alle.filter((d) => {
        if (eigenaarClause?.equals !== undefined && d.eigenaar !== eigenaarClause.equals) return false;
        if (idClause?.equals !== undefined && d.id !== idClause.equals) return false;
        if (msgIdClause?.in !== undefined && !msgIdClause.in.includes(d.gmailMessageId)) return false;
        if (statusClause?.equals !== undefined && d.status !== statusClause.equals) return false;
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
  // Sensible default voor bestaande tests die niet zelf over threadstatus
  // gaan: "de ander schreef het laatste bericht" — Michel is nog aan zet,
  // dus fase 1 laat een actief signaal met rust (geen sluiting, geen crash).
  mockThreadSamenvatting.mockResolvedValue([threadBericht({ gmailMessageId: "extern-vervolg", vanEigenAccount: false })]);
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

  it("classificeert een al-gesignaleerd bericht NOOIT opnieuw (fase 1, niet AI, bepaalt of het nog actueel is)", async () => {
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

describe("haalMailSignalen — threadstatus-sync (productiecorrectie 2026-08-19: 'beantwoorde mail blijft op het dashboard staan')", () => {
  it("Michel antwoordt rechtstreeks in Gmail (SENT-label in de thread) → na een refresh verdwijnt de kaart, status wordt 'beantwoord', nooit hard verwijderd", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1", gmailThreadId: "thread-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Stelt een vraag." }]);
    const payload = maakFakePayload();
    const eerste = await haalMailSignalen(payload as never, 1, "token", []);
    expect(eerste.signalen).toHaveLength(1);
    const signaalId = eerste.signalen[0]!.signaalId;

    // Michel reageerde intussen rechtstreeks in Gmail — de thread heeft nu een tweede bericht, van de eigen account.
    mockThreadSamenvatting.mockResolvedValue([
      threadBericht({ gmailMessageId: "msg-1", vanEigenAccount: false, ontvangenOp: "2026-08-19T09:00:00.000Z" }),
      threadBericht({ gmailMessageId: "msg-2-eigen-antwoord", vanEigenAccount: true, ontvangenOp: "2026-08-19T10:00:00.000Z" }),
    ]);

    const tweede = await haalMailSignalen(payload as never, 1, "token", [], { scanNieuweKandidaten: false });

    expect(tweede.signalen).toHaveLength(0);
    expect(tweede.automatischBeantwoord).toBe(1);
    expect(payload.mailDocs[signaalId]!.status).toBe("beantwoord");
    expect(payload.mailDocs[signaalId]!.beantwoordOp).toBe("2026-08-19T10:00:00.000Z");
    expect(payload.mailDocs[signaalId]).toBeDefined(); // nooit hard verwijderd — audit/history blijft staan
  });

  it("Michel antwoordt via MijnLeerlijn (markeerBeantwoord) → exact hetzelfde effect als rechtstreeks in Gmail: kaart weg, rij blijft bestaan", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1", gmailThreadId: "thread-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Stelt een vraag." }]);
    const payload = maakFakePayload();
    const eerste = await haalMailSignalen(payload as never, 1, "token", []);
    const signaalId = eerste.signalen[0]!.signaalId;

    await markeerBeantwoord(payload as never, 1, signaalId);
    mockThreadSamenvatting.mockClear();

    const tweede = await haalMailSignalen(payload as never, 1, "token", [], { scanNieuweKandidaten: false });

    expect(tweede.signalen).toHaveLength(0);
    expect(payload.mailDocs[signaalId]!.status).toBe("beantwoord");
    // Al beantwoord vóórdat fase 1 draaide — geen onnodige Gmail-aanroep voor dit signaal.
    expect(mockThreadSamenvatting).not.toHaveBeenCalled();
  });

  it("de andere partij reageert daarna opnieuw (heropende thread) → de kaart komt terug, opnieuw beoordeeld", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1", gmailThreadId: "thread-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Stelt een vraag." }]);
    const payload = maakFakePayload();
    await haalMailSignalen(payload as never, 1, "token", []);

    // Michel antwoordde rechtstreeks in Gmail — het signaal sluit bij de volgende lezing.
    mockThreadSamenvatting.mockResolvedValue([
      threadBericht({ gmailMessageId: "msg-1", vanEigenAccount: false }),
      threadBericht({ gmailMessageId: "msg-2-eigen-antwoord", vanEigenAccount: true, ontvangenOp: "2026-08-19T10:00:00.000Z" }),
    ]);
    const tweede = await haalMailSignalen(payload as never, 1, "token", [], { scanNieuweKandidaten: false });
    expect(tweede.signalen).toHaveLength(0);

    // De ander schrijft opnieuw — een nieuw Gmail-bericht in dezelfde thread.
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-3-nieuwe-vraag", gmailThreadId: "thread-1", ontvangenOp: "2026-08-19T12:00:00.000Z" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-3-nieuwe-vraag", actieNodig: true, reden: "Stelt opnieuw een vraag." }]);

    const derde = await haalMailSignalen(payload as never, 1, "token", []);
    expect(derde.signalen).toHaveLength(1);
    expect(derde.signalen[0]!.gmailMessageId).toBe("msg-3-nieuwe-vraag");
  });

  it("meerdere berichten van de ander vóór Michels eerste antwoord: geen dubbel signaal, blijft één kaart voor de thread", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1", gmailThreadId: "thread-1", ontvangenOp: "2026-08-19T09:00:00.000Z" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Stelt een vraag." }]);
    const payload = maakFakePayload();
    await haalMailSignalen(payload as never, 1, "token", []);

    // Michel heeft nog NIET geantwoord; de ander schrijft nogmaals (msg-2). Beide berichten komen nu als kandidaat terug.
    mockThreadSamenvatting.mockResolvedValue([threadBericht({ gmailMessageId: "msg-1", vanEigenAccount: false })]);
    mockKandidaten.mockResolvedValue([
      kandidaat({ gmailMessageId: "msg-1", gmailThreadId: "thread-1", ontvangenOp: "2026-08-19T09:00:00.000Z" }),
      kandidaat({ gmailMessageId: "msg-2", gmailThreadId: "thread-1", ontvangenOp: "2026-08-19T11:00:00.000Z" }),
    ]);
    mockClassificeer.mockClear();

    const resultaat = await haalMailSignalen(payload as never, 1, "token", []);

    expect(resultaat.signalen).toHaveLength(1); // nooit twee kaarten voor dezelfde openstaande thread
    expect(mockClassificeer).not.toHaveBeenCalled(); // geen nieuwe AI-aanroep nodig — de thread was al open
    expect(Object.values(payload.mailDocs).filter((d) => d.gmailThreadId === "thread-1")).toHaveLength(1); // geen tweede rij aangemaakt
  });

  it("meerdere berichten van de ander vóórdat er ooit een signaal bestond: slechts één signaal, voor het chronologisch laatste bericht", async () => {
    mockKandidaten.mockResolvedValue([
      kandidaat({ gmailMessageId: "msg-oud", gmailThreadId: "thread-nieuw", ontvangenOp: "2026-08-19T09:00:00.000Z", onderwerp: "Eerste vraag" }),
      kandidaat({ gmailMessageId: "msg-nieuw", gmailThreadId: "thread-nieuw", ontvangenOp: "2026-08-19T11:00:00.000Z", onderwerp: "Tweede, dringendere vraag" }),
    ]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-nieuw", actieNodig: true, reden: "Stelt een dringende vraag." }]);

    const payload = maakFakePayload();
    const resultaat = await haalMailSignalen(payload as never, 1, "token", []);

    expect(resultaat.signalen).toHaveLength(1);
    expect(resultaat.signalen[0]!.gmailMessageId).toBe("msg-nieuw");
    expect(mockClassificeer).toHaveBeenCalledWith([expect.objectContaining({ gmailMessageId: "msg-nieuw" })]);
  });

  it("Gmail (tijdelijk) onbereikbaar tijdens de threadstatus-check → het bestaande signaal blijft ongewijzigd actief, NOOIT ten onrechte als beantwoord gemarkeerd", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1", gmailThreadId: "thread-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Stelt een vraag." }]);
    const payload = maakFakePayload();
    const eerste = await haalMailSignalen(payload as never, 1, "token", []);
    const signaalId = eerste.signalen[0]!.signaalId;

    mockThreadSamenvatting.mockRejectedValue(new Error("Gmail tijdelijk onbereikbaar"));

    await haalMailSignalen(payload as never, 1, "token", [], { scanNieuweKandidaten: false });

    expect(payload.mailDocs[signaalId]!.status).toBe("gesignaleerd"); // ongewijzigd, niet "beantwoord"
  });

  it("een verzonden bericht in een ANDERE thread mag een signaal in déze thread niet sluiten (threadfetch is per threadId, geen kruisbesmetting)", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-a", gmailThreadId: "thread-A" }), kandidaat({ gmailMessageId: "msg-b", gmailThreadId: "thread-B" })]);
    mockClassificeer.mockResolvedValue([
      { gmailMessageId: "msg-a", actieNodig: true, reden: "Vraag A." },
      { gmailMessageId: "msg-b", actieNodig: true, reden: "Vraag B." },
    ]);
    const payload = maakFakePayload();
    const eerste = await haalMailSignalen(payload as never, 1, "token", []);
    expect(eerste.signalen).toHaveLength(2);

    // Michel beantwoordde uitsluitend thread B — thread A moet openblijven.
    mockThreadSamenvatting.mockImplementation(async (_token: string, threadId: string) =>
      threadId === "thread-B"
        ? [threadBericht({ gmailMessageId: "msg-b", vanEigenAccount: false }), threadBericht({ gmailMessageId: "eigen-antwoord-b", vanEigenAccount: true, ontvangenOp: "2026-08-19T10:00:00.000Z" })]
        : [threadBericht({ gmailMessageId: "msg-a", vanEigenAccount: false })]
    );

    const tweede = await haalMailSignalen(payload as never, 1, "token", [], { scanNieuweKandidaten: false });

    expect(tweede.signalen).toHaveLength(1);
    expect(tweede.signalen[0]!.gmailThreadId).toBe("thread-A");
  });

  it("passief pad met scanNieuweKandidaten: false doet GEEN Gmail-lijstquery en GEEN AI-aanroep, uitsluitend de threadstatus-sync", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1", gmailThreadId: "thread-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Stelt een vraag." }]);
    const payload = maakFakePayload();
    await haalMailSignalen(payload as never, 1, "token", []);
    mockKandidaten.mockClear();
    mockClassificeer.mockClear();
    // De echte Gmail-thread bevat altijd ook het bericht dat het signaal
    // veroorzaakte (het is per definitie onderdeel van diezelfde thread) —
    // zonder dit expliciet te zetten levert de generieke beforeEach-default
    // geen weergavemetadata op voor déze rij (nooit mailinhoud bewaard, dus
    // zonder match op het eigen gmailMessageId is er niets te tonen).
    mockThreadSamenvatting.mockResolvedValue([threadBericht({ gmailMessageId: "msg-1", vanEigenAccount: false })]);

    const resultaat = await haalMailSignalen(payload as never, 1, "token", [], { scanNieuweKandidaten: false });

    expect(mockKandidaten).not.toHaveBeenCalled();
    expect(mockClassificeer).not.toHaveBeenCalled();
    expect(resultaat.bekeken).toBe(0);
    expect(resultaat.signalen).toHaveLength(1); // het bestaande signaal blijft gewoon zichtbaar
  });
});

describe("dempSignaal / maakMailTaak / markeerBeantwoord — eigenaar-gescoped acties", () => {
  it("dempSignaal weigert (false) voor andermans signaalId — geen crash, geen mutatie", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Vraag." }]);
    const payload = maakFakePayload();
    const {
      signalen: [signaal],
    } = await haalMailSignalen(payload as never, 1, "token", []);

    const ok = await dempSignaal(payload as never, 2, signaal!.signaalId);
    expect(ok).toBe(false);
    expect(payload.mailDocs[signaal!.signaalId]!.status).toBe("gesignaleerd");
  });

  it("maakMailTaak maakt een personal-task aan en koppelt het signaal (status taak_aangemaakt)", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Vraag." }]);
    const payload = maakFakePayload();
    const {
      signalen: [signaal],
    } = await haalMailSignalen(payload as never, 1, "token", []);

    const resultaat = await maakMailTaak(payload as never, 1, signaal!.signaalId, { titel: "Beantwoorden: Vraag", datum: "2026-08-17" });

    expect(resultaat?.taakId).toBeGreaterThan(0);
    expect(payload.taakDocs[resultaat!.taakId]).toEqual(expect.objectContaining({ titel: "Beantwoorden: Vraag", eigenaar: 1, status: "open" }));
    expect(payload.mailDocs[signaal!.signaalId]!.status).toBe("taak_aangemaakt");
  });

  it("maakMailTaak geeft null terug voor andermans signaalId (geen taak aangemaakt)", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Vraag." }]);
    const payload = maakFakePayload();
    const {
      signalen: [signaal],
    } = await haalMailSignalen(payload as never, 1, "token", []);

    const resultaat = await maakMailTaak(payload as never, 2, signaal!.signaalId, { titel: "x", datum: "2026-08-17" });
    expect(resultaat).toBeNull();
    expect(Object.keys(payload.taakDocs)).toHaveLength(0);
  });

  it("markeerBeantwoord zet status + beantwoordOp, nooit de mailtekst zelf", async () => {
    mockKandidaten.mockResolvedValue([kandidaat({ gmailMessageId: "msg-1" })]);
    mockClassificeer.mockResolvedValue([{ gmailMessageId: "msg-1", actieNodig: true, reden: "Vraag." }]);
    const payload = maakFakePayload();
    const {
      signalen: [signaal],
    } = await haalMailSignalen(payload as never, 1, "token", []);

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
    const {
      signalen: [signaal],
    } = await haalMailSignalen(payload as never, 1, "token", []);

    const eigen = await haalSignaalVoorAntwoord(payload as never, 1, signaal!.signaalId);
    expect(eigen).toEqual({ gmailMessageId: "msg-1", gmailThreadId: "thread-9", schoolId: null });

    const andermans = await haalSignaalVoorAntwoord(payload as never, 2, signaal!.signaalId);
    expect(andermans).toBeNull();
  });
});
