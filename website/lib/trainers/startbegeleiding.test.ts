import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Payload } from "payload";
import { haalScholenPagina, haalUpdatesVoorItem, wijzigKolomWaardeJson, haalItemMetKolomWaarden, type MondayItemsPage, type MondayColumnValue } from "@/lib/sales/monday-client";
import { generateChatText } from "@/services/ai-client";
import { SCHOLEN_KOLOM } from "@/lib/sales/monday-columns";
import { MASTER_DATA_BOARD_ID, MD_TRAINER_KOLOM, MD_TYPE_SCHOOL_KOLOM, MD_LOCATION_KOLOM } from "./monday-links";
import {
  haalStartbegeleidingScholen,
  haalStartbegeleidingSchool,
  genereerStartbegeleidingSamenvatting,
  koppelTrainerAanSchool,
  maakStartactie,
  haalOpenStartactiesVoorTrainer,
  wijzigStartactieStatus,
  codeerStartactieId,
  decodeerStartactieId,
  isStartactieId,
  haalStartactieVoorMutatie,
  haalStartactiesAlsSamenvattingen,
  markeerStartactieAfgerondNaVerslag,
} from "./startbegeleiding";
import type { AuthTrainer } from "./auth";

// Startbegeleiding-ronde (2026-09-02, spec §D/§E/§F) — dekt lib/trainers/
// startbegeleiding.ts. Zelfde mockpatroon voor @/lib/sales/monday-client als
// writeback.test.ts (dat bestand is het letterlijke precedent waar
// startbegeleiding.ts se eigen moduletoelichting naar verwijst voor het
// cross-domain-hergebruik). generateChatText (services/ai-client.ts) wordt
// gemockt (echte AI-aanroep) — scrubPotentialPii NIET (een pure, deterministische
// regex-functie, geen reden om die hier los te mocken).
vi.mock("@/lib/sales/monday-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sales/monday-client")>();
  return { ...echt, haalScholenPagina: vi.fn(), haalUpdatesVoorItem: vi.fn(), wijzigKolomWaardeJson: vi.fn(), haalItemMetKolomWaarden: vi.fn() };
});
vi.mock("@/services/ai-client", () => ({ generateChatText: vi.fn() }));

const mockScholenPagina = vi.mocked(haalScholenPagina);
const mockUpdatesVoorItem = vi.mocked(haalUpdatesVoorItem);
const mockWijzigKolomWaardeJson = vi.mocked(wijzigKolomWaardeJson);
const mockHaalItemMetKolomWaarden = vi.mocked(haalItemMetKolomWaarden);
const mockGenerateChatText = vi.mocked(generateChatText);

beforeEach(() => {
  mockScholenPagina.mockReset();
  mockUpdatesVoorItem.mockReset();
  mockWijzigKolomWaardeJson.mockReset();
  mockHaalItemMetKolomWaarden.mockReset();
  mockGenerateChatText.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function kolomWaarden(overrides: Partial<Record<string, string | null>> = {}): MondayColumnValue[] {
  const basis: Record<string, string | null> = {
    [SCHOLEN_KOLOM.relatiestatus]: "Wacht op handtekening",
    [MD_TYPE_SCHOOL_KOLOM]: "Basisschool",
    [MD_LOCATION_KOLOM]: "Utrecht",
    [MD_TRAINER_KOLOM]: null,
  };
  // Root-cause-fix (2026-09-03) — parseLinkedPulseIds leest voor
  // MD_TRAINER_KOLOM (board_relation) voortaan uitsluitend linked_item_ids,
  // nooit meer .value (zie lib/sales/monday-client.ts). linked_item_ids
  // wordt hier afgeleid uit dezelfde linkedPulseIds-JSON die de bestaande
  // call sites al als override meegeven, zodat die zelf ongewijzigd blijven.
  return Object.entries({ ...basis, ...overrides }).map(([id, waarde]) => {
    if (id !== MD_TRAINER_KOLOM) return { id, text: waarde ?? null, value: null };
    const linkedItemIds = waarde ? (JSON.parse(waarde) as { linkedPulseIds: { linkedPulseId: number }[] }).linkedPulseIds.map((l) => String(l.linkedPulseId)) : [];
    return { id, text: null, value: waarde ?? null, linked_item_ids: linkedItemIds };
  });
}

function pagina(items: MondayItemsPage["items"], cursor: string | null = null): MondayItemsPage {
  return { items, cursor };
}

const TRAINER: AuthTrainer = {
  id: 1,
  name: "Wessel",
  email: "wessel@mijnleerlijn.nl",
  mondayTrainerboardId: "board-1",
  mondayUitvoerderItemId: "999001",
  actief: true,
};

describe("haalStartbegeleidingScholen", () => {
  it("houdt uitsluitend 'Wacht op handtekening'/'Klant' over, sluit andere relatiestatussen (en lege) uit", async () => {
    mockScholenPagina.mockResolvedValue(
      pagina([
        { id: "1", name: "School Wacht", updated_at: "2026-09-01T00:00:00.000Z", column_values: kolomWaarden({ [SCHOLEN_KOLOM.relatiestatus]: "Wacht op handtekening" }) },
        { id: "2", name: "School Klant", updated_at: "2026-09-01T00:00:00.000Z", column_values: kolomWaarden({ [SCHOLEN_KOLOM.relatiestatus]: "Klant" }) },
        { id: "3", name: "School Prospect", updated_at: "2026-09-01T00:00:00.000Z", column_values: kolomWaarden({ [SCHOLEN_KOLOM.relatiestatus]: "Prospect" }) },
        { id: "4", name: "School Leeg", updated_at: "2026-09-01T00:00:00.000Z", column_values: kolomWaarden({ [SCHOLEN_KOLOM.relatiestatus]: null }) },
      ])
    );
    const scholen = await haalStartbegeleidingScholen();
    expect(scholen.map((s) => s.id).sort()).toEqual(["1", "2"]);
  });

  it("sorteert alfabetisch op naam (nl-collatie)", async () => {
    mockScholenPagina.mockResolvedValue(
      pagina([
        { id: "1", name: "Zeeschool", updated_at: "2026-09-01T00:00:00.000Z", column_values: kolomWaarden() },
        { id: "2", name: "Alfaschool", updated_at: "2026-09-01T00:00:00.000Z", column_values: kolomWaarden() },
      ])
    );
    const scholen = await haalStartbegeleidingScholen();
    expect(scholen.map((s) => s.naam)).toEqual(["Alfaschool", "Zeeschool"]);
  });

  it("leidt gekoppeldeTrainerMondayIds af via parseLinkedPulseIds op MD_TRAINER_KOLOM", async () => {
    mockScholenPagina.mockResolvedValue(
      pagina([
        {
          id: "1",
          name: "School A",
          updated_at: "2026-09-01T00:00:00.000Z",
          column_values: kolomWaarden({ [MD_TRAINER_KOLOM]: JSON.stringify({ linkedPulseIds: [{ linkedPulseId: 111 }, { linkedPulseId: 222 }] }) }),
        },
      ])
    );
    const [school] = await haalStartbegeleidingScholen();
    expect(school?.gekoppeldeTrainerMondayIds).toEqual(["111", "222"]);
  });

  it("volgt de cursor over meerdere pagina's tot cursor null is", async () => {
    mockScholenPagina
      .mockResolvedValueOnce(pagina([{ id: "1", name: "School A", updated_at: "2026-09-01T00:00:00.000Z", column_values: kolomWaarden() }], "cursor-2"))
      .mockResolvedValueOnce(pagina([{ id: "2", name: "School B", updated_at: "2026-09-01T00:00:00.000Z", column_values: kolomWaarden() }], null));
    const scholen = await haalStartbegeleidingScholen();
    expect(scholen.map((s) => s.id).sort()).toEqual(["1", "2"]);
    expect(mockScholenPagina).toHaveBeenCalledTimes(2);
    expect(mockScholenPagina.mock.calls[0]?.[0]).toMatchObject({ boardId: MASTER_DATA_BOARD_ID, cursor: null });
    expect(mockScholenPagina.mock.calls[1]?.[0]).toMatchObject({ cursor: "cursor-2" });
  });
});

describe("haalStartbegeleidingSchool", () => {
  it("geeft de school terug wanneer het ID voorkomt in de live Startbegeleiding-lijst", async () => {
    mockScholenPagina.mockResolvedValue(pagina([{ id: "42", name: "School X", updated_at: "2026-09-01T00:00:00.000Z", column_values: kolomWaarden() }]));
    const school = await haalStartbegeleidingSchool("42");
    expect(school?.naam).toBe("School X");
  });

  it("geeft null terug wanneer het ID niet (meer) onder Startbegeleiding valt", async () => {
    mockScholenPagina.mockResolvedValue(pagina([]));
    const school = await haalStartbegeleidingSchool("onbekend");
    expect(school).toBeNull();
  });
});

describe("genereerStartbegeleidingSamenvatting", () => {
  it("laat gemigreerde updates weg uit het prompt-blok dat naar de AI gaat", async () => {
    mockUpdatesVoorItem.mockResolvedValue([
      { id: "u1", item_id: "42", text_body: "📜 Gemigreerde CRM-gegevens: oude sales-notitie", created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z", creator: null },
      { id: "u2", item_id: "42", text_body: "Schoolleider wil in september starten", created_at: "2026-08-20T00:00:00.000Z", updated_at: "2026-08-20T00:00:00.000Z", creator: null },
    ]);
    mockGenerateChatText.mockResolvedValue("Samenvatting.");
    await genereerStartbegeleidingSamenvatting("42");
    const gebruikersBericht = mockGenerateChatText.mock.calls[0]?.[0].messages[0]?.content as string;
    expect(gebruikersBericht).toContain("Schoolleider wil in september starten");
    expect(gebruikersBericht).not.toContain("Gemigreerde CRM-gegevens");
  });

  it("geeft een nette fallback door aan de AI wanneer er geen updates zijn", async () => {
    mockUpdatesVoorItem.mockResolvedValue([]);
    mockGenerateChatText.mockResolvedValue("Geen informatie beschikbaar.");
    await genereerStartbegeleidingSamenvatting("42");
    const gebruikersBericht = mockGenerateChatText.mock.calls[0]?.[0].messages[0]?.content as string;
    expect(gebruikersBericht).toContain("Geen Monday-updates gevonden.");
  });

  it("scrubt PII uit het AI-antwoord voordat het teruggegeven wordt", async () => {
    mockUpdatesVoorItem.mockResolvedValue([]);
    mockGenerateChatText.mockResolvedValue("Bel de directeur op test@school.nl voor meer info.");
    const samenvatting = await genereerStartbegeleidingSamenvatting("42");
    expect(samenvatting).not.toContain("test@school.nl");
    expect(samenvatting).toContain("[e-mailadres verwijderd]");
  });
});

describe("koppelTrainerAanSchool", () => {
  it("weigert met 'niet_geactiveerd' zolang TRAINER_MONDAY_KOPPELING_ENABLED niet 'true' is", async () => {
    const uitkomst = await koppelTrainerAanSchool("s1", "t1");
    expect(uitkomst.soort).toBe("niet_geactiveerd");
    expect(mockHaalItemMetKolomWaarden).not.toHaveBeenCalled();
    expect(mockWijzigKolomWaardeJson).not.toHaveBeenCalled();
  });

  it("geeft 'al_gekoppeld' terug zonder te schrijven wanneer de trainer al in de kolom staat", async () => {
    vi.stubEnv("TRAINER_MONDAY_KOPPELING_ENABLED", "true");
    mockHaalItemMetKolomWaarden.mockResolvedValue({
      id: "s1",
      name: "School",
      column_values: [{ id: MD_TRAINER_KOLOM, text: null, value: JSON.stringify({ linkedPulseIds: [{ linkedPulseId: 999001 }] }), linked_item_ids: ["999001"] }],
    });
    const uitkomst = await koppelTrainerAanSchool("s1", "999001");
    expect(uitkomst.soort).toBe("al_gekoppeld");
    expect(mockWijzigKolomWaardeJson).not.toHaveBeenCalled();
  });

  it("schrijft de UNIE van bestaande + nieuwe trainer-ID's (nooit de kolom overschrijven) en herleest ter bevestiging", async () => {
    vi.stubEnv("TRAINER_MONDAY_KOPPELING_ENABLED", "true");
    mockHaalItemMetKolomWaarden
      .mockResolvedValueOnce({
        id: "s1",
        name: "School",
        column_values: [{ id: MD_TRAINER_KOLOM, text: null, value: JSON.stringify({ linkedPulseIds: [{ linkedPulseId: 111 }] }), linked_item_ids: ["111"] }],
      })
      .mockResolvedValueOnce({
        id: "s1",
        name: "School",
        column_values: [{ id: MD_TRAINER_KOLOM, text: null, value: JSON.stringify({ linkedPulseIds: [{ linkedPulseId: 111 }, { linkedPulseId: 999001 }] }), linked_item_ids: ["111", "999001"] }],
      });
    mockWijzigKolomWaardeJson.mockResolvedValue(undefined);

    const uitkomst = await koppelTrainerAanSchool("s1", "999001");

    expect(uitkomst.soort).toBe("gekoppeld");
    expect(mockWijzigKolomWaardeJson).toHaveBeenCalledWith("s1", MASTER_DATA_BOARD_ID, MD_TRAINER_KOLOM, JSON.stringify({ item_ids: [111, 999001] }));
    expect(mockHaalItemMetKolomWaarden).toHaveBeenCalledTimes(2);
  });

  it("geeft 'mislukt' terug wanneer het eerste (lees)-verzoek al faalt", async () => {
    vi.stubEnv("TRAINER_MONDAY_KOPPELING_ENABLED", "true");
    mockHaalItemMetKolomWaarden.mockRejectedValue(new Error("Monday-timeout"));
    const uitkomst = await koppelTrainerAanSchool("s1", "999001");
    expect(uitkomst.soort).toBe("mislukt");
    expect(mockWijzigKolomWaardeJson).not.toHaveBeenCalled();
  });

  it("geeft 'mislukt' terug wanneer de schrijfactie zelf faalt", async () => {
    vi.stubEnv("TRAINER_MONDAY_KOPPELING_ENABLED", "true");
    mockHaalItemMetKolomWaarden.mockResolvedValue({ id: "s1", name: "School", column_values: [{ id: MD_TRAINER_KOLOM, text: null, value: null }] });
    mockWijzigKolomWaardeJson.mockRejectedValue(new Error("Monday weigert de schrijving"));
    const uitkomst = await koppelTrainerAanSchool("s1", "999001");
    expect(uitkomst.soort).toBe("mislukt");
  });

  it("geeft 'mislukt' terug wanneer Monday de schrijving accepteert maar herlezen de koppeling niet bevestigt", async () => {
    vi.stubEnv("TRAINER_MONDAY_KOPPELING_ENABLED", "true");
    mockHaalItemMetKolomWaarden
      .mockResolvedValueOnce({ id: "s1", name: "School", column_values: [{ id: MD_TRAINER_KOLOM, text: null, value: null }] })
      .mockResolvedValueOnce({ id: "s1", name: "School", column_values: [{ id: MD_TRAINER_KOLOM, text: null, value: null }] }); // herlezen toont GEEN koppeling
    mockWijzigKolomWaardeJson.mockResolvedValue(undefined);
    const uitkomst = await koppelTrainerAanSchool("s1", "999001");
    expect(uitkomst.soort).toBe("mislukt");
  });
});

describe("codeerStartactieId / decodeerStartactieId / isStartactieId", () => {
  it("codeert en decodeert een ID rondtrip-correct", () => {
    expect(decodeerStartactieId(codeerStartactieId(42))).toBe(42);
  });

  it("decodeerStartactieId geeft null voor een string zonder het startactie-voorvoegsel", () => {
    expect(decodeerStartactieId("mnd-12345")).toBeNull();
  });

  it("decodeerStartactieId geeft null voor een niet-numeriek of niet-positief achtervoegsel", () => {
    expect(decodeerStartactieId("startactie:abc")).toBeNull();
    expect(decodeerStartactieId("startactie:0")).toBeNull();
    expect(decodeerStartactieId("startactie:-3")).toBeNull();
  });

  it("isStartactieId onderscheidt correct van een gewone (Monday-)trainingId", () => {
    expect(isStartactieId("startactie:1")).toBe(true);
    expect(isStartactieId("mnd-12345")).toBe(false);
    expect(isStartactieId("aanvullend:1")).toBe(false);
  });
});

describe("maakStartactie / haalOpenStartactiesVoorTrainer / wijzigStartactieStatus (Payload-CRUD)", () => {
  function maakFakePayload() {
    const rijen = new Map<number, Record<string, unknown>>();
    let volgendId = 1;
    const payload = {
      findByID: vi.fn(async ({ collection, id }: { collection: string; id: number }) => {
        if (collection === "trainer-accounts") return { id: TRAINER.id, name: TRAINER.name };
        const rij = rijen.get(id);
        if (!rij) throw new Error("niet gevonden");
        return rij;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = volgendId++;
        const rij = { id, createdAt: "2026-09-01T00:00:00.000Z", ...data };
        rijen.set(id, rij);
        return rij;
      }),
      update: vi.fn(async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
        const rij = rijen.get(id);
        if (!rij) throw new Error("niet gevonden");
        Object.assign(rij, data);
        return rij;
      }),
      find: vi.fn(async ({ where }: { where?: { and?: { trainer?: { equals?: number }; status?: { equals?: string } }[] } }) => {
        let docs = Array.from(rijen.values());
        const and = where?.and ?? [];
        for (const clausule of and) {
          if (clausule.trainer?.equals !== undefined) docs = docs.filter((d) => d.trainer === clausule.trainer!.equals);
          if (clausule.status?.equals !== undefined) docs = docs.filter((d) => d.status === clausule.status!.equals);
        }
        docs = [...docs].sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
        return { docs };
      }),
    };
    return { payload: payload as unknown as Payload, rijen };
  }

  it("maakStartactie maakt een record met status='open' en resolvet de trainernaam server-side", async () => {
    const { payload } = maakFakePayload();
    const actie = await maakStartactie(payload, { mondaySchoolId: "s1", schoolNaam: "School A", trainerId: TRAINER.id, actieType: "intake", instructie: "Bel", deadline: "2026-09-10", gespreksDatum: null });
    expect(actie).toMatchObject({ mondaySchoolId: "s1", schoolNaam: "School A", trainerId: TRAINER.id, trainerNaam: "Wessel", actieType: "intake", status: "open" });
  });

  it("haalOpenStartactiesVoorTrainer geeft alleen open acties van déze trainer terug, gesorteerd op deadline", async () => {
    const { payload } = maakFakePayload();
    await maakStartactie(payload, { mondaySchoolId: "s1", schoolNaam: "School A", trainerId: TRAINER.id, actieType: "intake", instructie: null, deadline: "2026-09-15", gespreksDatum: null });
    await maakStartactie(payload, { mondaySchoolId: "s2", schoolNaam: "School B", trainerId: TRAINER.id, actieType: "anders", instructie: null, deadline: "2026-09-05", gespreksDatum: null });
    const acties = await haalOpenStartactiesVoorTrainer(payload, TRAINER);
    expect(acties.map((a) => a.mondaySchoolId)).toEqual(["s2", "s1"]);
  });

  it("wijzigStartactieStatus zet 'afgerond' + afgerondOp, en geeft 'niet_gevonden' voor een onbekend ID", async () => {
    const { payload } = maakFakePayload();
    const actie = await maakStartactie(payload, { mondaySchoolId: "s1", schoolNaam: "School A", trainerId: TRAINER.id, actieType: "intake", instructie: null, deadline: "2026-09-10", gespreksDatum: null });
    const uitkomst = await wijzigStartactieStatus(payload, actie.id, "afgerond");
    expect(uitkomst).toBe("gewijzigd");
    const nietGevonden = await wijzigStartactieStatus(payload, 999999, "afgerond");
    expect(nietGevonden).toBe("niet_gevonden");
  });
});

describe("haalStartactieVoorMutatie", () => {
  function maakFakePayload(rij: Record<string, unknown> | null) {
    return {
      findByID: vi.fn(async () => {
        if (!rij) throw new Error("niet gevonden");
        return rij;
      }),
    } as unknown as Payload;
  }

  it("geeft null terug voor een trainingId die niet decodeert als startactie", async () => {
    const payload = maakFakePayload(null);
    const resultaat = await haalStartactieVoorMutatie(payload, TRAINER, "mnd-12345");
    expect(resultaat).toBeNull();
  });

  it("geeft null terug wanneer de startactie van een ANDERE trainer is (ownership)", async () => {
    const payload = maakFakePayload({ id: 1, trainer: 999, mondaySchoolId: "s1", schoolNaam: "S", actieType: "intake", gespreksDatum: "2026-09-10T00:00:00.000Z" });
    const resultaat = await haalStartactieVoorMutatie(payload, TRAINER, codeerStartactieId(1));
    expect(resultaat).toBeNull();
  });

  it("geeft null terug zolang er geen gespreksDatum gezet is", async () => {
    const payload = maakFakePayload({ id: 1, trainer: TRAINER.id, mondaySchoolId: "s1", schoolNaam: "S", actieType: "intake", gespreksDatum: null });
    const resultaat = await haalStartactieVoorMutatie(payload, TRAINER, codeerStartactieId(1));
    expect(resultaat).toBeNull();
  });

  it("geeft een geldige TrainingSamenvatting terug wanneer eigendom + gespreksDatum kloppen", async () => {
    const payload = maakFakePayload({ id: 1, trainer: TRAINER.id, mondaySchoolId: "s1", schoolNaam: "School A", actieType: "intake", gespreksDatum: "2026-09-10T00:00:00.000Z" });
    const resultaat = await haalStartactieVoorMutatie(payload, TRAINER, codeerStartactieId(1));
    expect(resultaat).toMatchObject({ schoolId: "s1", schoolNaam: "School A", startactieId: 1, training: { bron: "startactie", datum: "2026-09-10", trainerboardItemId: null } });
  });
});

describe("haalStartactiesAlsSamenvattingen", () => {
  function maakFakePayload(docs: Record<string, unknown>[]) {
    return { find: vi.fn(async () => ({ docs })) } as unknown as Payload;
  }

  it("neemt alleen rijen met een gespreksDatum mee", async () => {
    const payload = maakFakePayload([
      { id: 1, trainer: TRAINER.id, mondaySchoolId: "s1", schoolNaam: "School A", actieType: "intake", gespreksDatum: "2026-09-10T00:00:00.000Z" },
      { id: 2, trainer: TRAINER.id, mondaySchoolId: "s2", schoolNaam: "School B", actieType: "anders", gespreksDatum: null },
    ]);
    const resultaat = await haalStartactiesAlsSamenvattingen(payload, TRAINER);
    expect(resultaat.map((r) => r.schoolId)).toEqual(["s1"]);
  });

  it("filtert op maxDagenGeleden wanneer opgegeven", async () => {
    const vandaag = new Date().toISOString().slice(0, 10);
    const teOud = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const payload = maakFakePayload([
      { id: 1, trainer: TRAINER.id, mondaySchoolId: "s1", schoolNaam: "School A", actieType: "intake", gespreksDatum: `${vandaag}T00:00:00.000Z` },
      { id: 2, trainer: TRAINER.id, mondaySchoolId: "s2", schoolNaam: "School B", actieType: "anders", gespreksDatum: teOud },
    ]);
    const resultaat = await haalStartactiesAlsSamenvattingen(payload, TRAINER, { maxDagenGeleden: 7 });
    expect(resultaat.map((r) => r.schoolId)).toEqual(["s1"]);
  });
});

describe("markeerStartactieAfgerondNaVerslag", () => {
  it("doet niets voor een trainingId die geen startactie is (geen crash, geen aanroep)", async () => {
    const update = vi.fn();
    const payload = { update } as unknown as Payload;
    await expect(markeerStartactieAfgerondNaVerslag(payload, "mnd-12345")).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it("zet status='afgerond' + afgerondOp voor een geldige startactie-trainingId", async () => {
    const update = vi.fn().mockResolvedValue({});
    const payload = { update } as unknown as Payload;
    await markeerStartactieAfgerondNaVerslag(payload, codeerStartactieId(7));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ collection: "start-acties", id: 7, data: expect.objectContaining({ status: "afgerond" }) }));
  });

  it("faalt nooit hard (best-effort) wanneer de update-aanroep zelf een fout gooit", async () => {
    const payload = { update: vi.fn().mockRejectedValue(new Error("db-fout")) } as unknown as Payload;
    await expect(markeerStartactieAfgerondNaVerslag(payload, codeerStartactieId(7))).resolves.toBeUndefined();
  });
});
