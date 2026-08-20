import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Payload } from "payload";
import {
  mondayQuery,
  haalScholenPagina,
  haalUpdatesVoorItem,
  leesKolomWaarden,
  wijzigKolomWaarde,
  wijzigKolomWaardeJson,
  haalItemMetKolomWaarden,
} from "@/lib/sales/monday-client";
import { werkTrainingBij } from "./writeback";
import { UITVOERING_BOARD_ID } from "./monday-links";
import type { AuthTrainer } from "./auth";

// Traineromgeving V1, Ronde 2 (2026-08-19) — dekt lib/trainers/writeback.ts.
// Zelfde mockpatroon als monday-links.test.ts/security.test.ts (bewust hier
// gedupliceerd, niet geïmporteerd — elk testbestand in dit project is
// zelfstandig leesbaar). mondayQuery/haalScholenPagina/haalUpdatesVoorItem
// worden gemockt omdat werkTrainingBij() altijd EERST haalTrainingVoorMutatie
// (monday-links.ts) aanroept om eigendom server-side te herverifiëren — dat
// pad hergebruikt exact dezelfde resolutieladder als het leespad.
vi.mock("@/lib/sales/monday-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sales/monday-client")>();
  return {
    ...echt,
    mondayQuery: vi.fn(),
    haalScholenPagina: vi.fn(),
    haalUpdatesVoorItem: vi.fn(),
    leesKolomWaarden: vi.fn(),
    wijzigKolomWaarde: vi.fn(),
    wijzigKolomWaardeJson: vi.fn(),
    haalItemMetKolomWaarden: vi.fn(),
  };
});

const mockQuery = vi.mocked(mondayQuery);
const mockScholenPagina = vi.mocked(haalScholenPagina);
const mockUpdatesVoorItem = vi.mocked(haalUpdatesVoorItem);
const mockLeesKolomWaarden = vi.mocked(leesKolomWaarden);
const mockWijzigKolomWaarde = vi.mocked(wijzigKolomWaarde);
const mockWijzigKolomWaardeJson = vi.mocked(wijzigKolomWaardeJson);
const mockHaalItemMetKolomWaarden = vi.mocked(haalItemMetKolomWaarden);
const mockCreate = vi.fn();

function maakPayload(): Payload {
  return { create: mockCreate } as unknown as Payload;
}

// Bewezen echte keten (architectuurrapport, ook al gebruikt in monday-
// links.test.ts): trainerboard-item 12717612402 -> Master ID 12713002919 ->
// centrale training 12713002919 -> School "500" (Montessori Gorinchem).
const TRAINER: AuthTrainer = {
  id: 1,
  name: "Wessel",
  email: "wessel@mijnleerlijn.nl",
  mondayTrainerboardId: "18424768045",
  mondayUitvoerderItemId: "999001",
  actief: true,
};
const TRAINER_B: AuthTrainer = {
  id: 2,
  name: "Andere Trainer",
  email: "andere@mijnleerlijn.nl",
  mondayTrainerboardId: "18424768099",
  mondayUitvoerderItemId: "999002",
  actief: true,
};
const CENTRALE_TRAINING_ID = "12713002919";
const TRAINERBOARD_ITEM_ID = "12717612402";
const SCHOOL_ID = "500";

function linkedPulseIdsValue(ids: (string | number)[]): string {
  return JSON.stringify({ linkedPulseIds: ids.map((linkedPulseId) => ({ linkedPulseId })) });
}

function masterDataItem(opts: { id: string; naam: string; trainerLinkedIds?: (string | number)[] }) {
  return {
    id: opts.id,
    name: opts.naam,
    updated_at: "2026-08-19T00:00:00.000Z",
    column_values: [
      { id: "board_relation_mm5r2jy1", text: null, value: opts.trainerLinkedIds ? linkedPulseIdsValue(opts.trainerLinkedIds) : null },
      { id: "board_relation_mm4v8fpm", text: null, value: null },
      { id: "dropdown_mm4v9rvg", text: null, value: null },
      { id: "text_mm5r9kn2", text: null, value: null },
      { id: "color_mm5q790a", text: null, value: null },
    ],
  };
}

function uitvoeringItem(opts: { id: string; naam: string; schoolIds?: (string | number)[]; statusTekst?: string | null; datum?: string | null }) {
  return {
    id: opts.id,
    name: opts.naam,
    updated_at: "2026-08-19T00:00:00.000Z",
    column_values: [
      { id: "board_relation_mm5tyc40", text: null, value: opts.schoolIds ? linkedPulseIdsValue(opts.schoolIds) : null },
      { id: "color_mm5tz3wk", text: opts.statusTekst ?? null, value: null },
      { id: "date_mm5tnfvx", text: opts.datum ?? null, value: null },
      { id: "boolean_mm5tvfc5", text: null, value: null },
    ],
  };
}

function trainerboardBoardsResponse(items: { id: string; name: string; groupTitle?: string | null; masterId?: string | null }[]) {
  return {
    boards: [
      {
        items_page: {
          items: items.map((i) => ({
            id: i.id,
            name: i.name,
            group: i.groupTitle !== undefined ? { title: i.groupTitle } : null,
            column_values: [{ id: "numeric_mm5vceeq", text: i.masterId ?? null, value: null }],
          })),
        },
      },
    ],
  };
}

/** Zet de resolutieladder zo op dat TRAINER se training CENTRALE_TRAINING_ID geldig is (tier 1, harde School-koppeling) mét een trainerboard-spiegelitem. statusTekst/datum bepalen de LIVE status die werkTrainingBij bij binnenkomst ziet (voor de auto-statusregel bij datumwijzigingen) — standaard "open" (geen datum, geen statustekst), zelfde als voorheen. */
function seedGeldigeTraining(
  trainer: AuthTrainer = TRAINER,
  opts: { metTrainerboardItem?: boolean; statusTekst?: string | null; datum?: string | null } = {}
) {
  const metTbItem = opts.metTrainerboardItem ?? true;
  mockScholenPagina
    .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: SCHOOL_ID, naam: "Montessori Gorinchem", trainerLinkedIds: [Number(trainer.mondayUitvoerderItemId)] })] })
    .mockResolvedValueOnce({
      cursor: null,
      items: [uitvoeringItem({ id: CENTRALE_TRAINING_ID, naam: "Training", schoolIds: [SCHOOL_ID], statusTekst: opts.statusTekst, datum: opts.datum })],
    });
  mockQuery.mockResolvedValue(
    trainerboardBoardsResponse(metTbItem ? [{ id: TRAINERBOARD_ITEM_ID, name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: CENTRALE_TRAINING_ID }] : [])
  );
}

type KolomWaarde = { id: string; text: string | null; value: string | null };

/** leesKolomWaarden geeft per itemId een eigen kolomset terug — zo kunnen trainerboard- en centraal-record onafhankelijk gemockt worden. */
function mockLezenPerItem(perItem: Record<string, KolomWaarde[]>) {
  mockLeesKolomWaarden.mockImplementation(async (itemId: string, columnIds: string[]) => {
    const alles = perItem[itemId] ?? [];
    return columnIds.map((id) => alles.find((kv) => kv.id === id) ?? { id, text: null, value: null });
  });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockScholenPagina.mockReset();
  mockUpdatesVoorItem.mockReset();
  mockLeesKolomWaarden.mockReset();
  mockWijzigKolomWaarde.mockReset().mockResolvedValue(undefined);
  mockWijzigKolomWaardeJson.mockReset().mockResolvedValue(undefined);
  mockHaalItemMetKolomWaarden.mockReset();
  mockCreate.mockReset().mockResolvedValue({ id: 1 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("werkTrainingBij — eigendomsverificatie (security)", () => {
  it("training-ID dat niet bij deze trainer hoort -> niet_gevonden, geen enkele Monday-schrijfpoging", async () => {
    seedGeldigeTraining();
    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, "onbestaande-training", { status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } });
    expect(uitkomst.soort).toBe("niet_gevonden");
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalled();
  });

  it("cross-trainer: trainer B kan trainer A se training-ID niet bewerken, ook al bestaat die echt (bij trainer A)", async () => {
    // Trainer B se EIGEN, volledig losstaande context (andere school, andere
    // training-ID) — bevat CENTRALE_TRAINING_ID nergens, zodat een poging om
    // die (van trainer A) te bewerken écht op trainer B se eigen, vers
    // opgehaalde resolutieladder getoetst wordt, niet op een toevallig
    // gedeelde fixture.
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "600", naam: "CBS de Wereld", trainerLinkedIds: [999002] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "888", naam: "Training van B", schoolIds: ["600"] })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "889", name: "TB-item van B", groupTitle: "CBS de Wereld", masterId: "888" }]));

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER_B, CENTRALE_TRAINING_ID, { status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } });
    expect(uitkomst.soort).toBe("niet_gevonden");
  });

  it("training zonder trainerboardItemId (geen eigen trainerboard-spiegelitem) -> niet_bewerkbaar, geen Monday-aanroep", async () => {
    seedGeldigeTraining(TRAINER, { metTrainerboardItem: false });
    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, { status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } });
    expect(uitkomst.soort).toBe("niet_bewerkbaar");
    expect(mockLeesKolomWaarden).not.toHaveBeenCalled();
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalled();
  });
});

describe("werkTrainingBij — datum, happy path + gate", () => {
  it("PRODUCTIEGATE uit (standaard): beide records lezen/vergelijken echt, maar de mutatie zelf blijft inert", async () => {
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "date4", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: null },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.algeheleStatus).toBe("niet_geactiveerd");
    expect(mockLeesKolomWaarden).toHaveBeenCalled(); // echt gelezen/vergeleken
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalled(); // maar nooit gemuteerd
  });

  it("PRODUCTIEGATE aan: datum zetten slaagt op beide records onafhankelijk (en zet, Ronde 2 vervolg, automatisch ook de status op Gepland)", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining(); // status "open" — datum zetten triggert dus de automatische "-> Gepland"-regel, zie het aparte describe-blok verderop voor de volledige dekking daarvan
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [
        { id: "date4", text: null, value: null },
        { id: "status", text: null, value: null },
      ],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: null, value: null },
        { id: "color_mm5tz3wk", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: null },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.algeheleStatus).toBe("volledig_geslaagd");
    expect(uitkomst.resultaat.kolomResultaten.filter((k) => k.veld === "datum")).toHaveLength(2);
    expect(mockWijzigKolomWaarde).toHaveBeenCalledWith(TRAINERBOARD_ITEM_ID, TRAINER.mondayTrainerboardId, "date4", "2026-09-01");
    expect(mockWijzigKolomWaarde).toHaveBeenCalledWith(CENTRALE_TRAINING_ID, "18420120466", "date_mm5tnfvx", "2026-09-01");
  });

  it("alleen status wijzigen raakt de datum-kolommen op geen van beide records aan", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "status", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "color_mm5tz3wk", text: "Aangemaakt", value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: "Aangemaakt" },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.kolomResultaten.every((k) => k.veld === "status")).toBe(true);
    expect(mockWijzigKolomWaarde).toHaveBeenCalledWith(CENTRALE_TRAINING_ID, "18420120466", "color_mm5tz3wk", "Gedaan");
  });
});

describe("werkTrainingBij — conflictdetectie (centraal, echte baseline)", () => {
  it("weigert de centrale datumschrijving bij een afwijkende live waarde — trainerboard blijft onafhankelijk geslaagd", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "date4", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: "2026-08-20", value: null }, // iemand anders zette al een andere datum
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: null }, // trainer zag nog "geen datum"
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    const centraal = uitkomst.resultaat.kolomResultaten.find((k) => k.record === "centraal")!;
    expect(centraal.status).toBe("conflict");
    expect(centraal.conflict).toEqual({ laatstGezienDoorTrainer: null, huidigOpMonday: "2026-08-20", gebruikerWildeZetten: "2026-09-01" });
    const trainerboard = uitkomst.resultaat.kolomResultaten.find((k) => k.record === "trainerboard")!;
    expect(trainerboard.status).toBe("geschreven"); // onafhankelijk, geen conflict-baseline voor het spiegel-record
    expect(uitkomst.resultaat.algeheleStatus).toBe("deels_geslaagd");
    expect(uitkomst.resultaat.opnieuwProberen).toEqual({ trainerboard: false, centraal: true });
  });

  it("KRITIEKE CORRECTHEIDSFIX: statusconflict vergelijkt tegen de RUWE tekst, nooit tegen een uit TrainingStatus terug-gecodeerd label", async () => {
    // "Aangemaakt" matcht geen enkele bepaalTrainingStatus-substring, dus de
    // trainer zag dit intern als status "open"/"gepland" (afhankelijk van
    // datum) — als de conflictcontrole ten onrechte STATUS_NAAR_MONDAY_LABEL
    // van dat interne label ("Nieuw") als baseline zou gebruiken i.p.v. de
    // echte ruweStatusTekst ("Aangemaakt"), zou dit hieronder ALTIJD een
    // vals-positief conflict opleveren, ook al is er niets veranderd.
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "status", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "color_mm5tz3wk", text: "Aangemaakt", value: null }, // ongewijzigd t.o.v. wat de trainer zag
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: "Aangemaakt" },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    const centraal = uitkomst.resultaat.kolomResultaten.find((k) => k.record === "centraal" && k.veld === "status")!;
    expect(centraal.status).not.toBe("conflict");
    expect(centraal.status).toBe("geschreven");
  });
});

describe("werkTrainingBij — deelmislukking + scoped retry (alleenRecord)", () => {
  it("trainerboard-schrijving mislukt terwijl centraal slaagt -> deels_geslaagd, opnieuwProberen wijst alleen trainerboard aan", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "date4", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });
    mockWijzigKolomWaarde.mockImplementation(async (itemId) => {
      if (itemId === TRAINERBOARD_ITEM_ID) throw new Error("Monday tijdelijk onbereikbaar");
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: null },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.algeheleStatus).toBe("deels_geslaagd");
    expect(uitkomst.resultaat.opnieuwProberen).toEqual({ trainerboard: true, centraal: false });
    expect(uitkomst.resultaat.kolomResultaten.find((k) => k.record === "trainerboard")!.status).toBe("mislukt");
    expect(uitkomst.resultaat.kolomResultaten.find((k) => k.record === "centraal")!.status).toBe("geschreven");
  });

  it("alleenRecord: 'centraal' raakt het trainerboard-record helemaal niet aan (geen lees-, geen schrijfpoging)", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: null },
      alleenRecord: "centraal",
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.kolomResultaten.every((k) => k.record === "centraal")).toBe(true);
    expect(mockLeesKolomWaarden).not.toHaveBeenCalledWith(TRAINERBOARD_ITEM_ID, expect.anything());
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalledWith(TRAINERBOARD_ITEM_ID, expect.anything(), expect.anything(), expect.anything());
  });
});

describe("werkTrainingBij — datum verwijderen (Beslissing 2, fail-safe herlees-bevestiging)", () => {
  it("verwijdert de datum op beide records en bevestigt via herlezen dat de kolom daadwerkelijk leeg is geworden", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "date4", text: "2026-09-01", value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: "2026-09-01", value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });
    mockHaalItemMetKolomWaarden.mockResolvedValue({ id: "x", name: "x", column_values: [{ id: "date4", text: null, value: null }] });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: null, verwachteHuidigeWaarde: "2026-09-01" },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.algeheleStatus).toBe("volledig_geslaagd");
    expect(mockWijzigKolomWaarde).toHaveBeenCalledWith(TRAINERBOARD_ITEM_ID, TRAINER.mondayTrainerboardId, "date4", "");
    expect(mockHaalItemMetKolomWaarden).toHaveBeenCalled(); // de extra fail-safe-stap werd echt uitgevoerd
  });

  it("FAIL-SAFE: Monday accepteert de mutatie-aanroep, maar herlezen bevestigt geen lege kolom -> mislukt, nooit een niet-bevestigd succes voorwenden", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "date4", text: "2026-09-01", value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: "2026-09-01", value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });
    // Herlezing toont nog altijd de oude datum — de mutatie deed dus niet
    // wat verwacht, ook al gooide wijzigKolomWaarde zelf geen fout.
    mockHaalItemMetKolomWaarden.mockResolvedValue({ id: "x", name: "x", column_values: [{ id: "date4", text: "2026-09-01", value: null }] });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: null, verwachteHuidigeWaarde: "2026-09-01" },
      alleenRecord: "trainerboard",
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.kolomResultaten[0]!.status).toBe("mislukt");
    expect(uitkomst.resultaat.kolomResultaten[0]!.boodschap).toMatch(/herlezen/i);
  });

  it("een gewone datum-ZET krijgt geen herlees-bevestiging (alleen verwijderen doet dat)", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "date4", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: null },
    });

    expect(mockHaalItemMetKolomWaarden).not.toHaveBeenCalled();
  });
});

describe("werkTrainingBij — numeric_mm5vkjzz (Beslissing 3: uitsluitend signaleren, nooit repareren)", () => {
  it("leeg -> stil, geen datakwaliteitssignaal", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "status", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "color_mm5tz3wk", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, { status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } });
    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.dataKwaliteitSignaal).toBeUndefined();
  });

  it("gelijk aan het opgezochte trainerboard-item-ID -> stil", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "status", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "color_mm5tz3wk", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: TRAINERBOARD_ITEM_ID, value: null },
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, { status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } });
    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.dataKwaliteitSignaal).toBeUndefined();
  });

  it("afwijkend -> gelogd als signaal, maar blokkeert de eigenlijke status-schrijving van de trainer op geen enkele manier", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "status", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "color_mm5tz3wk", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: "99999999999", value: null }, // afwijkend van TRAINERBOARD_ITEM_ID
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, { status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null } });
    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.dataKwaliteitSignaal).toMatchObject({ veld: "trainerboardMirrorSignaal" });
    // Nooit geschreven — uitsluitend gesignaleerd:
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "numeric_mm5vkjzz", expect.anything());
    // De eigenlijke, door de trainer gevraagde statuswijziging slaagt gewoon:
    const centraal = uitkomst.resultaat.kolomResultaten.find((k) => k.record === "centraal" && k.veld === "status")!;
    expect(centraal.status).toBe("geschreven");
    expect(uitkomst.resultaat.algeheleStatus).toBe("volledig_geslaagd");
    // Gelogd (voor Michel zichtbaar in trainer-log-events):
    expect(mockCreate.mock.calls.some((call) => call[0].data.veld === "trainerboardMirrorSignaal")).toBe(true);
  });
});

describe("werkTrainingBij — auditlogging", () => {
  it("logt elke kolompoging naar trainer-log-events, server-side met overrideAccess, nooit via de publieke API", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "date4", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, { datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: null } });

    expect(mockCreate).toHaveBeenCalled();
    for (const call of mockCreate.mock.calls) {
      expect(call[0].collection).toBe("trainer-log-events");
      expect(call[0].overrideAccess).toBe(true);
      expect(call[0].data.trainer).toBe(TRAINER.id);
      expect(call[0].data.mondayCentraleTrainingId).toBe(CENTRALE_TRAINING_ID);
    }
  });
});

describe("werkTrainingBij — automatische status bij datumwijziging (Ronde 2 vervolg)", () => {
  it("datum zetten op een 'open' training zonder expliciete status -> automatisch status 'gepland' op beide records", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining(); // standaard: status "open", geen datum
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [
        { id: "date4", text: null, value: null },
        { id: "status", text: null, value: null },
      ],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: null, value: null },
        { id: "color_mm5tz3wk", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: null },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.algeheleStatus).toBe("volledig_geslaagd");
    expect(uitkomst.resultaat.kolomResultaten).toHaveLength(4); // 2 records x (datum + status)
    expect(mockWijzigKolomWaarde).toHaveBeenCalledWith(TRAINERBOARD_ITEM_ID, TRAINER.mondayTrainerboardId, "status", "Gepland");
    expect(mockWijzigKolomWaarde).toHaveBeenCalledWith(CENTRALE_TRAINING_ID, "18420120466", "color_mm5tz3wk", "Gepland");
  });

  it("datum verwijderen op een 'gepland' training zonder expliciete status -> automatisch status 'open' (Nieuw)", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining(TRAINER, { statusTekst: "Gepland", datum: "2026-08-10" });
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [
        { id: "date4", text: "2026-08-10", value: null },
        { id: "status", text: "Gepland", value: null },
      ],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: "2026-08-10", value: null },
        { id: "color_mm5tz3wk", text: "Gepland", value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });
    mockHaalItemMetKolomWaarden.mockResolvedValue({ id: "x", name: "x", column_values: [{ id: "date4", text: null, value: null }] });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: null, verwachteHuidigeWaarde: "2026-08-10" },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.algeheleStatus).toBe("volledig_geslaagd");
    expect(mockWijzigKolomWaarde).toHaveBeenCalledWith(TRAINERBOARD_ITEM_ID, TRAINER.mondayTrainerboardId, "status", "Nieuw");
    expect(mockWijzigKolomWaarde).toHaveBeenCalledWith(CENTRALE_TRAINING_ID, "18420120466", "color_mm5tz3wk", "Nieuw");
  });

  it("datum wijzigen op een training die al 'gepland' is (blijft gepland) -> geen extra statusschrijving", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining(TRAINER, { statusTekst: "Gepland", datum: "2026-08-01" });
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "date4", text: "2026-08-01", value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: "2026-08-01", value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: "2026-08-01" },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.kolomResultaten.every((k) => k.veld === "datum")).toBe(true);
    expect(uitkomst.resultaat.kolomResultaten).toHaveLength(2);
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "status", expect.anything());
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "color_mm5tz3wk", expect.anything());
  });

  it("datum wijzigen op een 'geannuleerd' training -> automatische statusregel grijpt niet in, status blijft ongewijzigd", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining(TRAINER, { statusTekst: "Geannuleerd", datum: "2026-08-01" });
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "date4", text: "2026-08-01", value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: "2026-08-01", value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: "2026-08-01" },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.kolomResultaten.every((k) => k.veld === "datum")).toBe(true);
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "status", expect.anything());
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "color_mm5tz3wk", expect.anything());
  });

  it("datum wijzigen op een 'gedaan' training -> automatische statusregel grijpt niet in", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining(TRAINER, { statusTekst: "Gedaan", datum: "2026-08-01" });
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "date4", text: "2026-08-01", value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: "2026-08-01", value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: "2026-08-01" },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.kolomResultaten.every((k) => k.veld === "datum")).toBe(true);
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "status", expect.anything());
  });

  it("trainer stuurt zelf expliciet status mee samen met datum -> automatische afleiding overschrijft dit nooit", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining(); // status "open"
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [
        { id: "date4", text: null, value: null },
        { id: "status", text: null, value: null },
      ],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: null, value: null },
        { id: "color_mm5tz3wk", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    // Trainer annuleert de training EN wijzigt tegelijk de datum — een
    // bewuste, expliciete combinatie. De automatische "datum -> Gepland"-
    // regel zou hier zonder deze bescherming de expliciete annulering
    // ongedaan maken.
    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: null },
      status: { nieuweWaarde: "geannuleerd", verwachteHuidigeRuweTekst: null },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(mockWijzigKolomWaarde).toHaveBeenCalledWith(TRAINERBOARD_ITEM_ID, TRAINER.mondayTrainerboardId, "status", "Geannuleerd");
    expect(mockWijzigKolomWaarde).toHaveBeenCalledWith(CENTRALE_TRAINING_ID, "18420120466", "color_mm5tz3wk", "Geannuleerd");
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "Gepland");
  });
});

describe("werkTrainingBij — kolomniveau-onafhankelijkheid BINNEN één record (datum vs. de automatisch meegeschreven status)", () => {
  it("datumkolom faalt, de automatisch meegeschreven statuskolom op datzelfde record slaagt gewoon onafhankelijk", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining(); // status "open"
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [
        { id: "date4", text: null, value: null },
        { id: "status", text: null, value: null },
      ],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: null, value: null },
        { id: "color_mm5tz3wk", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });
    mockWijzigKolomWaarde.mockImplementation(async (_itemId, _boardId, columnId) => {
      if (columnId === "date_mm5tnfvx") throw new Error("Monday tijdelijk onbereikbaar");
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: null },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    const centraalDatum = uitkomst.resultaat.kolomResultaten.find((k) => k.record === "centraal" && k.veld === "datum")!;
    const centraalStatus = uitkomst.resultaat.kolomResultaten.find((k) => k.record === "centraal" && k.veld === "status")!;
    expect(centraalDatum.status).toBe("mislukt");
    expect(centraalStatus.status).toBe("geschreven"); // onafhankelijk geslaagd, ondanks dat de datumkolom op HETZELFDE record faalde
    expect(uitkomst.resultaat.algeheleStatus).toBe("deels_geslaagd");
  });

  it("de automatisch meegeschreven statuskolom faalt, de datumkolom op datzelfde record slaagt gewoon onafhankelijk", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [
        { id: "date4", text: null, value: null },
        { id: "status", text: null, value: null },
      ],
      [CENTRALE_TRAINING_ID]: [
        { id: "date_mm5tnfvx", text: null, value: null },
        { id: "color_mm5tz3wk", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });
    mockWijzigKolomWaarde.mockImplementation(async (_itemId, _boardId, columnId) => {
      if (columnId === "color_mm5tz3wk") throw new Error("Monday tijdelijk onbereikbaar");
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      datum: { nieuweWaarde: "2026-09-01", verwachteHuidigeWaarde: null },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    const centraalDatum = uitkomst.resultaat.kolomResultaten.find((k) => k.record === "centraal" && k.veld === "datum")!;
    const centraalStatus = uitkomst.resultaat.kolomResultaten.find((k) => k.record === "centraal" && k.veld === "status")!;
    expect(centraalDatum.status).toBe("geschreven");
    expect(centraalStatus.status).toBe("mislukt");
    expect(uitkomst.resultaat.algeheleStatus).toBe("deels_geslaagd");
  });
});

describe("werkTrainingBij — dubbele indiening (geen ongecontroleerde dubbele writes)", () => {
  it("twee gelijktijdige, identieke verzoeken worden allebei als normale, onafhankelijke lees-vergelijk-schrijf-pogingen verwerkt (geen impliciete deduplicatie/lock nodig: de tweede vergelijkt gewoon tegen de dan al bijgewerkte live waarde)", async () => {
    // Ronde 2 vervolg — expliciete opdrachtseis "dubbele submit geen
    // ongecontroleerde dubbele writes". Dit project se stateloze
    // lees-vergelijk-schrijf-architectuur (writeback.ts se eigen module-
    // toelichting) maakt een aparte lock/dedup-laag overbodig: server-side
    // is er sowieso geen enkel gedeeld, muteerbaar tussenstation — elke
    // aanroep van werkTrainingBij is zijn eigen, volledig onafhankelijke
    // live lees-vergelijk-schrijf-cyclus. De UI-kant voorkomt dubbele KLIKKEN
    // apart (StatusPopover/DatumPopover zetten hun keuzeknoppen op
    // disabled zodra bezig=true) — dit test de servergarantie die daaronder
    // ligt: zelfs als er toch twee verzoeken na elkaar binnenkomen, ontstaat
    // er nooit een ongecontroleerde dubbele schrijving of corrupte staat.
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    // Bewust mockResolvedValue (persistent, niet -Once) i.p.v.
    // seedGeldigeTraining(): twee GELIJKTIJDIGE werkTrainingBij-aanroepen
    // doorlopen elk hun eigen, volledige verzamelTrainerContext-cyclus (2x
    // haalScholenPagina), dus in totaal 4 aanroepen — een one-shot-keten van
    // 2 zou hier voor de tweede poging een undefined-response opleveren.
    mockScholenPagina.mockImplementation(async (opties: { boardId: string }) =>
      opties.boardId === UITVOERING_BOARD_ID
        ? { cursor: null, items: [uitvoeringItem({ id: CENTRALE_TRAINING_ID, naam: "Training", schoolIds: [SCHOOL_ID] })] }
        : { cursor: null, items: [masterDataItem({ id: SCHOOL_ID, naam: "Montessori Gorinchem", trainerLinkedIds: [Number(TRAINER.mondayUitvoerderItemId)] })] }
    );
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([{ id: TRAINERBOARD_ITEM_ID, name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: CENTRALE_TRAINING_ID }])
    );
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "status", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "color_mm5tz3wk", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });

    const verzoek = { status: { nieuweWaarde: "gedaan" as const, verwachteHuidigeRuweTekst: null } };
    const [eersteUitkomst, tweedeUitkomst] = await Promise.all([
      werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, verzoek),
      werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, verzoek),
    ]);

    expect(eersteUitkomst.soort).toBe("resultaat");
    expect(tweedeUitkomst.soort).toBe("resultaat");
    if (eersteUitkomst.soort !== "resultaat" || tweedeUitkomst.soort !== "resultaat") return;
    // Beide zien dezelfde (gemockte) live "niets veranderd"-waarde als
    // baseline, dus beide slagen onafhankelijk — geen corrupte staat, geen
    // exceptie, geen crash. Monday zelf zou bij een échte dubbele mutatie
    // op hetzelfde item eenvoudigweg twee keer dezelfde waarde zetten
    // (idempotent), nooit een fout resultaat.
    expect(eersteUitkomst.resultaat.algeheleStatus).toBe("volledig_geslaagd");
    expect(tweedeUitkomst.resultaat.algeheleStatus).toBe("volledig_geslaagd");
    expect(mockWijzigKolomWaarde).toHaveBeenCalledTimes(4); // 2 records x 2 identieke verzoeken
  });
});

describe("werkTrainingBij — logboek-veld (Ronde 3, afronding na trainingsverslag)", () => {
  it("logboek-only verzoek slaagt onafhankelijk op beide records via checkboxNaarMondayWaarde, geschreven via change_column_value (JSON) en pas na herlees-bevestiging gerapporteerd", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "boolean_mm5v9vxd", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "boolean_mm5tvfc5", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });
    // Root-cause-fix (2026-08-20): Monday blijft bron van waarheid — een
    // "geschreven"-rapportage vereist dat de herlezing (haalItemMetKolomWaarden)
    // de checkbox ook daadwerkelijk aangevinkt bevestigt.
    mockHaalItemMetKolomWaarden.mockImplementation(async (itemId: string, columnIds: string[]) => ({
      id: itemId,
      name: "x",
      column_values: [{ id: columnIds[0]!, text: "v", value: JSON.stringify({ checked: "true" }) }],
    }));

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      logboek: { nieuweWaarde: true },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.algeheleStatus).toBe("volledig_geslaagd");
    expect(uitkomst.resultaat.kolomResultaten).toHaveLength(2); // trainerboard + centraal
    expect(uitkomst.resultaat.kolomResultaten.every((k) => k.veld === "logboek" && k.status === "geschreven")).toBe(true);
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalled(); // checkbox gaat NOOIT via change_simple_column_value
    expect(mockWijzigKolomWaardeJson).toHaveBeenCalledWith(TRAINERBOARD_ITEM_ID, TRAINER.mondayTrainerboardId, "boolean_mm5v9vxd", JSON.stringify({ checked: "true" }));
    expect(mockWijzigKolomWaardeJson).toHaveBeenCalledWith(CENTRALE_TRAINING_ID, "18420120466", "boolean_mm5tvfc5", JSON.stringify({ checked: "true" }));
    expect(mockHaalItemMetKolomWaarden).toHaveBeenCalledWith(TRAINERBOARD_ITEM_ID, ["boolean_mm5v9vxd"]);
    expect(mockHaalItemMetKolomWaarden).toHaveBeenCalledWith(CENTRALE_TRAINING_ID, ["boolean_mm5tvfc5"]);
  });

  it("logboek nieuweWaarde false -> checkboxNaarMondayWaarde schrijft een leeg JSON-object, geen 'false'-tekst", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "boolean_mm5v9vxd", text: "true", value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "boolean_mm5tvfc5", text: "true", value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });
    mockHaalItemMetKolomWaarden.mockImplementation(async (itemId: string, columnIds: string[]) => ({
      id: itemId,
      name: "x",
      column_values: [{ id: columnIds[0]!, text: null, value: null }], // uitgevinkt: leeg/null, zelfde als parseCheckboxIngevuld elders verwacht
    }));

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, { logboek: { nieuweWaarde: false } });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.kolomResultaten.every((k) => k.veld === "logboek" && k.status === "geschreven")).toBe(true);
    expect(mockWijzigKolomWaardeJson).toHaveBeenCalledWith(TRAINERBOARD_ITEM_ID, TRAINER.mondayTrainerboardId, "boolean_mm5v9vxd", JSON.stringify({}));
    expect(mockWijzigKolomWaardeJson).toHaveBeenCalledWith(CENTRALE_TRAINING_ID, "18420120466", "boolean_mm5tvfc5", JSON.stringify({}));
  });

  it("logboek-checkboxwrite: mutatie slaagt maar herlezing bevestigt NIET aangevinkt -> mislukt, nooit stilzwijgend 'geschreven' (opdrachtseis: Monday blijft bron van waarheid)", async () => {
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [{ id: "boolean_mm5v9vxd", text: null, value: null }],
      [CENTRALE_TRAINING_ID]: [
        { id: "boolean_mm5tvfc5", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });
    // mockHaalItemMetKolomWaarden blijft op zijn beforeEach-default (geen
    // implementatie -> undefined -> parseCheckboxIngevuld(undefined) = false)
    // -> herlezing bevestigt NOOIT "aangevinkt", ook al gooide de mutatie zelf niets.

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, { logboek: { nieuweWaarde: true } });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    expect(uitkomst.resultaat.kolomResultaten.every((k) => k.veld === "logboek" && k.status === "mislukt")).toBe(true);
    expect(mockWijzigKolomWaardeJson).toHaveBeenCalled(); // de mutatie werd wél geprobeerd
  });

  it("KRITIEKE CORRECTHEIDSFIX: settled.map()-fallback labelt een afgewezen logboek-taak correct als 'logboek', nooit als 'status' — exacte verzoekvorm van bevestigVerslag se afronding ({status, logboek}, geen datum)", async () => {
    // De enige plek in verwerkKolomSchrijving waar een taak ECHT afwijst
    // (Promise.allSettled "rejected"), i.p.v. slechts een
    // {status:"mislukt"}-waarde teruggeeft: de afsluitende
    // logTrainerWriteBackPoging-aanroep bij een geslaagde schrijving staat
    // buiten de try/catch rond wijzigKolomWaarde. Laat die auditlogregel
    // specifiek voor de geslaagde logboek-schrijving mislukken (bv. een
    // tijdelijk databaseprobleem) om een echte afwijzing te forceren. Vóór de
    // fix labelde settled.map()'s ternary (i === 0 && verzoek.datum ?
    // "datum" : "status") elke afwijzing als "status" zodra verzoek.datum
    // ontbrak — precies de vorm van dit verzoek — waardoor een UI die op
    // kolomResultaten[i].veld een scoped retry bouwt, een {status:...}-retry
    // zou samenstellen voor een taak die in werkelijkheid het logboek-veld
    // raakte: de training zou dan nooit meer met succes af te ronden zijn.
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    seedGeldigeTraining();
    mockLezenPerItem({
      [TRAINERBOARD_ITEM_ID]: [
        { id: "status", text: null, value: null },
        { id: "boolean_mm5v9vxd", text: null, value: null },
      ],
      [CENTRALE_TRAINING_ID]: [
        { id: "color_mm5tz3wk", text: null, value: null },
        { id: "boolean_mm5tvfc5", text: null, value: null },
        { id: "numeric_mm5vkjzz", text: null, value: null },
      ],
    });
    // De checkbox-herlees-bevestiging (root-cause-fix 2026-08-20) moet hier
    // slagen, anders wordt de logboek-taak al vóór de "geschreven"-logregel
    // afgewezen en test dit scenario niet meer de bedoelde Promise.allSettled
    // "rejected"-tak (zie toelichting hierboven).
    mockHaalItemMetKolomWaarden.mockImplementation(async (itemId: string, columnIds: string[]) => ({
      id: itemId,
      name: "x",
      column_values: [{ id: columnIds[0]!, text: "v", value: JSON.stringify({ checked: "true" }) }],
    }));
    mockCreate.mockReset().mockImplementation(async (args: { data: { veld: string; status: string } }) => {
      if (args.data.veld === "logboek" && args.data.status === "geschreven") {
        throw new Error("Audit-log tijdelijk onbereikbaar");
      }
      return { id: 1 };
    });

    const uitkomst = await werkTrainingBij(maakPayload(), TRAINER, CENTRALE_TRAINING_ID, {
      status: { nieuweWaarde: "gedaan", verwachteHuidigeRuweTekst: null },
      logboek: { nieuweWaarde: true },
    });

    expect(uitkomst.soort).toBe("resultaat");
    if (uitkomst.soort !== "resultaat") return;
    const statusResultaten = uitkomst.resultaat.kolomResultaten.filter((k) => k.veld === "status");
    const logboekResultaten = uitkomst.resultaat.kolomResultaten.filter((k) => k.veld === "logboek");
    expect(statusResultaten).toHaveLength(2); // trainerboard + centraal, beide geslaagd (audit-log daarvoor bleef werken)
    expect(statusResultaten.every((k) => k.status === "geschreven")).toBe(true);
    expect(logboekResultaten).toHaveLength(2); // trainerboard + centraal, beide afgewezen via de audit-log-fout
    expect(logboekResultaten.every((k) => k.status === "mislukt")).toBe(true);
    // De kern van de regressietest: een afgewezen taak wordt nooit fout
    // gelabeld als "status" — vóór de fix gebeurde precies dat hier.
    expect(uitkomst.resultaat.kolomResultaten.filter((k) => k.veld === "status" && k.status === "mislukt")).toHaveLength(0);
    expect(uitkomst.resultaat.algeheleStatus).toBe("deels_geslaagd");
    expect(uitkomst.resultaat.opnieuwProberen).toEqual({ trainerboard: true, centraal: true });
  });
});
