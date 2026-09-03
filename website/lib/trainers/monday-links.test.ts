import { describe, it, expect, vi, beforeEach } from "vitest";
import { mondayQuery, haalScholenPagina, haalUpdatesVoorItem, wijzigKolomWaarde, haalItemMetKolomWaarden, haalItemsMetKolomWaarden, type MondaySchoolItem } from "@/lib/sales/monday-client";
import {
  parseLinkedPulseIds,
  parseCheckboxIngevuld,
  parseMondayDatum,
  parseNumeriekeKolomAlsId,
  normaliseerSchoolnaamVoorMatch,
  bepaalTrainingStatus,
  bepaalScholenVoorTrainer,
  haalDashboardData,
  haalSchoolDetail,
  haalRecenteTrainingenVoorTelefonie,
  haalAlleTrainingenVoorTrainer,
  haalTrainingenEnScholenVoorAlleTrainers,
} from "./monday-links";
import type { AuthTrainer } from "./auth";

// Root-cause-fix (2026-09-03) — dit bestand is herbouwd nadat live bewijs
// (Michel de Hond: portal toonde 13 scholen, board 5 toonde 37) aantoonde dat
// de oude resolutieladder (tier 1 Master Data.Trainer-scan / tier 2 legacy-
// groepsnaammatch / tier 3) op TWEE punten stuk was: (1) board_relation-
// kolommen gaven altijd value:null/text:null terug onder de gepinde
// API-Version — parseLinkedPulseIds gaf dus voor ELKE board_relation-kolom
// altijd [] terug, ongeacht de werkelijke koppeling (zie lib/sales/
// monday-client.ts), en (2) Master Data.Trainer (board 1) is functioneel niet
// leidend — dat is voortaan uitsluitend UO_SCHOLEN_KOLOM op het EIGEN item
// van de trainer op board 5 ("5: Uitvoerder training"). Zie monday-links.ts
// se moduletoelichting voor de volledige analyse.
//
// Alle fixtures hieronder geven `linked_item_ids` mee voor board_relation-
// kolommen (nooit meer een JSON-geëncodeerde `.value`) — dat is nu voor dat
// kolomtype de ENIGE bron die de productiecode leest.

vi.mock("@/lib/sales/monday-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sales/monday-client")>();
  // wijzigKolomWaarde wordt hier NIET door monday-links.ts zelf gebruikt (het
  // leespad importeert het niet eens) — uitsluitend gemockt zodat de test
  // hieronder ("geen verborgen Monday-write tijdens een pageview") kan
  // bewijzen dat het nooit aangeroepen wordt, i.p.v. dat alleen op de
  // afwezigheid van de import te vertrouwen. haalItemMetKolomWaarden/
  // haalItemsMetKolomWaarden zijn sinds de root-cause-fix wél echte, legitieme
  // leesaanroepen van verzamelTrainerContext zelf (zie hieronder).
  return {
    ...echt,
    mondayQuery: vi.fn(),
    haalScholenPagina: vi.fn(),
    haalUpdatesVoorItem: vi.fn(),
    wijzigKolomWaarde: vi.fn(),
    haalItemMetKolomWaarden: vi.fn(),
    haalItemsMetKolomWaarden: vi.fn(),
  };
});

const mockQuery = vi.mocked(mondayQuery);
const mockScholenPagina = vi.mocked(haalScholenPagina);
const mockUpdatesVoorItem = vi.mocked(haalUpdatesVoorItem);
const mockWijzigKolomWaarde = vi.mocked(wijzigKolomWaarde);
const mockHaalItemMetKolomWaarden = vi.mocked(haalItemMetKolomWaarden);
const mockHaalItemsMetKolomWaarden = vi.mocked(haalItemsMetKolomWaarden);

const TRAINER: AuthTrainer = {
  id: 1,
  name: "Wessel",
  email: "wessel@mijnleerlijn.nl",
  mondayTrainerboardId: "18424768045",
  mondayUitvoerderItemId: "999001",
  actief: true,
};

// Kolom-ID's — zelfde live-geverifieerde ID's als monday-links.ts (zie daar
// voor de herkomst). Bewust als losse letterlijke strings, niet geïmporteerd:
// zelfde stijl als dit bestand al vóór de herbouw hanteerde, en een aantal
// (UV_SCHOOL_KOLOM/MD_HOOFDCONTACTPERSOON_KOLOM/MD_IMPLEMENTATIEFASE_KOLOM)
// zijn in monday-links.ts bewust NIET geëxporteerd.
const UO_SCHOLEN_KOLOM_ID = "board_relation_mm4v62g5"; // UO_SCHOLEN_KOLOM — de daadwerkelijk gebruikte "Scholen"-kolom op board 5
const UO_SCHOLEN_KOLOM_ONGEBRUIKT_ID = "board_relation_mm4v3wjn"; // de tweede, live bevestigd ongebruikte "Scholen"-kolom op board 5
const MD_TRAINER_KOLOM_ID = "board_relation_mm5r2jy1";
const MD_HOOFDCONTACTPERSOON_KOLOM_ID = "board_relation_mm4v8fpm";
const UV_SCHOOL_KOLOM_ID = "board_relation_mm5tyc40";

function checkboxValue(checked: boolean): string {
  return JSON.stringify({ checked: checked ? "true" : "" });
}

function masterDataItem(opts: {
  id: string;
  naam: string;
  /** Uitsluitend nog relevant voor haalTrainingenEnScholenVoorAlleTrainers (admin-breed) — verzamelTrainerContext leest MD_TRAINER_KOLOM sinds de root-cause-fix niet meer. */
  trainerLinkedIds?: (string | number)[];
  hoofdcontactpersoon?: string | null;
  /** Als gezet, krijgt de contactpersoon-kolom ook een echte linked_item_ids-relatie (contactpersoonBetrouwbaar = true); zonder is die leeg, net als voorheen (contactpersoonBetrouwbaar = false). */
  hoofdcontactpersoonLinkedId?: string | number;
  onderwijstype?: string | null;
  locatie?: string | null;
  implementatiefase?: string | null;
}): MondaySchoolItem {
  return {
    id: opts.id,
    name: opts.naam,
    updated_at: "2026-08-19T00:00:00.000Z",
    column_values: [
      { id: MD_TRAINER_KOLOM_ID, text: null, value: null, linked_item_ids: opts.trainerLinkedIds ? opts.trainerLinkedIds.map(String) : [] },
      {
        id: MD_HOOFDCONTACTPERSOON_KOLOM_ID,
        text: opts.hoofdcontactpersoon ?? null,
        value: null,
        linked_item_ids: opts.hoofdcontactpersoonLinkedId !== undefined ? [String(opts.hoofdcontactpersoonLinkedId)] : [],
      },
      { id: "dropdown_mm4v9rvg", text: opts.onderwijstype ?? null, value: null },
      { id: "text_mm5r9kn2", text: opts.locatie ?? null, value: null },
      { id: "color_mm5q790a", text: opts.implementatiefase ?? null, value: null },
    ],
  };
}

function uitvoeringItem(opts: { id: string; naam: string; schoolIds?: (string | number)[]; status?: string | null; datum?: string | null; logboekIngevuld?: boolean }): MondaySchoolItem {
  return {
    id: opts.id,
    name: opts.naam,
    updated_at: "2026-08-19T00:00:00.000Z",
    column_values: [
      { id: UV_SCHOOL_KOLOM_ID, text: null, value: null, linked_item_ids: opts.schoolIds ? opts.schoolIds.map(String) : [] },
      { id: "color_mm5tz3wk", text: opts.status ?? null, value: null },
      { id: "date_mm5tnfvx", text: opts.datum ?? null, value: null },
      { id: "boolean_mm5tvfc5", text: null, value: checkboxValue(opts.logboekIngevuld ?? false) },
    ],
  };
}

function trainerboardBoardsResponse(
  items: { id: string; name: string; groupTitle?: string | null; masterId?: string | null; masterIdValue?: string | null }[]
) {
  return {
    boards: [
      {
        items_page: {
          items: items.map((i) => ({
            id: i.id,
            name: i.name,
            group: i.groupTitle !== undefined ? { title: i.groupTitle } : null,
            // masterIdValue simuleert de RUWE .value van de numeric_mm5vceeq-
            // kolom (JSON-geëncodeerd getal) — los instelbaar van .text, want
            // dat is precies waar de duizendtal-scheidingsteken-bug zit (zie
            // parseNumeriekeKolomAlsId in monday-links.ts). Standaard null,
            // zodat tests die alleen .text zetten via de .text-fallback blijven werken.
            column_values: [{ id: "numeric_mm5vceeq", text: i.masterId ?? null, value: i.masterIdValue ?? null }],
          })),
        },
      },
    ],
  };
}

/**
 * Zet de mocks op die verzamelTrainerContext() per aanroep nodig heeft: het
 * eigen Board-5-item van de trainer (Scholen-relatie — de nieuwe basisset),
 * de bijbehorende Master Data-schoolitems (gericht opgehaald op exact die
 * ID's, via haalItemsMetKolomWaarden), het Uitvoering-board (trainingen) en
 * het eigen trainerboard (fallback-groepsnamen). `schoolIds: null` simuleert
 * een trainer-item dat niet gevonden werd; `schoolIds: undefined` (default)
 * betekent "geen enkele school gekoppeld" (lege lijst), niet "niet gevonden".
 */
function mockTrainerContext(opts: {
  schoolIds?: (string | number)[] | null;
  masterData?: MondaySchoolItem[];
  uitvoering?: MondaySchoolItem[];
  trainerboard?: Parameters<typeof trainerboardBoardsResponse>[0];
}) {
  mockHaalItemMetKolomWaarden.mockResolvedValueOnce(
    opts.schoolIds === null
      ? null
      : {
          id: TRAINER.mondayUitvoerderItemId,
          name: TRAINER.name,
          column_values: [{ id: UO_SCHOLEN_KOLOM_ID, text: null, value: null, linked_item_ids: (opts.schoolIds ?? []).map(String) }],
        }
  );
  mockHaalItemsMetKolomWaarden.mockResolvedValueOnce(opts.masterData ?? []);
  mockScholenPagina.mockResolvedValueOnce({ cursor: null, items: opts.uitvoering ?? [] });
  mockQuery.mockResolvedValue(trainerboardBoardsResponse(opts.trainerboard ?? []));
}

beforeEach(() => {
  mockQuery.mockReset();
  mockScholenPagina.mockReset();
  mockUpdatesVoorItem.mockReset();
  mockWijzigKolomWaarde.mockReset();
  mockHaalItemMetKolomWaarden.mockReset();
  mockHaalItemsMetKolomWaarden.mockReset();
});

describe("parseLinkedPulseIds", () => {
  it("leest linked_item_ids van een board_relation-kolom (BoardRelationValue-inline-fragment)", () => {
    expect(parseLinkedPulseIds({ id: "x", text: null, value: null, linked_item_ids: ["18420555", "18420556"] })).toEqual(["18420555", "18420556"]);
  });
  it("root-cause-fix: werkt ook wanneer .value EN .text allebei null zijn — voor board_relation is dat onder de gepinde API-Version altijd het geval", () => {
    expect(parseLinkedPulseIds({ id: "x", text: null, value: null, linked_item_ids: ["1"] })).toEqual(["1"]);
  });
  it("negeert verouderde JSON in .value/.text volledig — leest UITSLUITEND linked_item_ids, nooit meer een tweede interpretatie", () => {
    expect(
      parseLinkedPulseIds({ id: "x", text: "iets", value: '{"linkedPulseIds":[{"linkedPulseId":1}]}', linked_item_ids: undefined })
    ).toEqual([]);
  });
  it("geeft een lege lijst terug voor null/undefined of een kolom zonder gekoppelde items — geen fout", () => {
    expect(parseLinkedPulseIds(null)).toEqual([]);
    expect(parseLinkedPulseIds(undefined)).toEqual([]);
    expect(parseLinkedPulseIds({ id: "x", text: null, value: null, linked_item_ids: [] })).toEqual([]);
    expect(parseLinkedPulseIds({ id: "x", text: null, value: null, linked_item_ids: null })).toEqual([]);
  });
});

describe("parseCheckboxIngevuld", () => {
  it("herkent aangevinkt", () => {
    expect(parseCheckboxIngevuld(checkboxValue(true))).toBe(true);
  });
  it("herkent niet-aangevinkt", () => {
    expect(parseCheckboxIngevuld(checkboxValue(false))).toBe(false);
  });
  it("valt terug op false bij null/kapotte JSON — nooit ten onrechte 'ingevuld'", () => {
    expect(parseCheckboxIngevuld(null)).toBe(false);
    expect(parseCheckboxIngevuld("kapot{")).toBe(false);
  });
});

describe("parseMondayDatum", () => {
  it("herkent een YYYY-MM-DD-datum", () => {
    expect(parseMondayDatum("2026-08-20")).toBe("2026-08-20");
  });
  it("herkent een datum met tijdssuffix door alleen het datumdeel te nemen", () => {
    expect(parseMondayDatum("2026-08-20 14:00:00")).toBe("2026-08-20");
  });
  it("geeft null terug voor null/leeg/onverwachte vorm — nooit gokken", () => {
    expect(parseMondayDatum(null)).toBeNull();
    expect(parseMondayDatum("")).toBeNull();
    expect(parseMondayDatum("twintig augustus")).toBeNull();
  });
});

describe("parseNumeriekeKolomAlsId — Master ID-kolom (numeric_mm5vceeq)", () => {
  it("geeft voorrang aan .value boven .text — de kern van de fix (Wessel se 12 scholen)", () => {
    expect(parseNumeriekeKolomAlsId({ text: "12.713.002.919", value: "12713002919" })).toBe("12713002919");
    expect(parseNumeriekeKolomAlsId({ text: "12,713,002,919", value: "12713002919" })).toBe("12713002919");
  });
  it("valt terug op .text wanneer .value ontbreekt (bestaande tests/oudere datavarianten)", () => {
    expect(parseNumeriekeKolomAlsId({ text: "12713002919", value: null })).toBe("12713002919");
  });
  it("strip een overbodige '.0'-decimaalstaart uit .value (spreadsheet-plakartefact)", () => {
    expect(parseNumeriekeKolomAlsId({ text: null, value: "12713002919.0" })).toBe("12713002919");
  });
  it("valt terug op .text bij onparseerbare/lege .value — nooit crashen", () => {
    expect(parseNumeriekeKolomAlsId({ text: "12713002919", value: "" })).toBe("12713002919");
    expect(parseNumeriekeKolomAlsId({ text: "12713002919", value: "niet-geldige-json{" })).toBe("12713002919");
  });
  it("geeft null terug wanneer zowel .value als .text ontbreken", () => {
    expect(parseNumeriekeKolomAlsId({ text: null, value: null })).toBeNull();
    expect(parseNumeriekeKolomAlsId(null)).toBeNull();
    expect(parseNumeriekeKolomAlsId(undefined)).toBeNull();
  });
});

describe("normaliseerSchoolnaamVoorMatch — legacy-groepsnaammatch", () => {
  it("trimt en verlaagt hoofdletters", () => {
    expect(normaliseerSchoolnaamVoorMatch("  Montessori Gorinchem  ")).toBe("montessori gorinchem");
  });
  it("vouwt meervoudige interne witruimte samen tot één spatie", () => {
    expect(normaliseerSchoolnaamVoorMatch("Montessori   Gorinchem")).toBe("montessori gorinchem");
    expect(normaliseerSchoolnaamVoorMatch("Montessori\tGorinchem")).toBe("montessori gorinchem");
  });
  it("is géén fuzzy match — verschillende namen normaliseren naar verschillende strings", () => {
    expect(normaliseerSchoolnaamVoorMatch("Montessori Gorinchem")).not.toBe(normaliseerSchoolnaamVoorMatch("Montessori Gorinchem School"));
    expect(normaliseerSchoolnaamVoorMatch("Montessori Gorinchem")).not.toBe(normaliseerSchoolnaamVoorMatch("Montessori Gorkum"));
  });
});

describe("bepaalTrainingStatus", () => {
  it("geannuleerd heeft voorrang, ook met een datum", () => {
    expect(bepaalTrainingStatus("Geannuleerd", "2026-08-20")).toBe("geannuleerd");
  });
  it("herkent 'gedaan'/'afgerond' hoofdletterongevoelig", () => {
    expect(bepaalTrainingStatus("Gedaan", null)).toBe("gedaan");
    expect(bepaalTrainingStatus("AFGEROND", null)).toBe("gedaan");
  });
  it("valt terug op 'gepland' zodra er een datum is en de status niet gedaan/geannuleerd is", () => {
    expect(bepaalTrainingStatus("Nieuw", "2026-08-20")).toBe("gepland");
    expect(bepaalTrainingStatus(null, "2026-08-20")).toBe("gepland");
  });
  it("valt terug op 'open' zonder datum en zonder herkende status", () => {
    expect(bepaalTrainingStatus("Nieuw", null)).toBe("open");
    expect(bepaalTrainingStatus(null, null)).toBe("open");
  });
});

describe("bepaalScholenVoorTrainer — basisset uit Board 5 'Scholen'-relatie (root-cause-fix 2026-09-03)", () => {
  it("Michel-achtig scenario: 37 gekoppelde school-ID's in de Board-5-relatie -> 37 scholen terug, ook als 24 daarvan 0 trainingen hebben", async () => {
    const ALLE_SCHOOL_IDS = Array.from({ length: 37 }, (_, i) => `school-${i + 1}`);
    const MET_TRAINING_IDS = ALLE_SCHOOL_IDS.slice(0, 13); // 13 = precies het voorheen getoonde (te lage) aantal — nu slechts een deelverzameling

    mockTrainerContext({
      schoolIds: ALLE_SCHOOL_IDS,
      masterData: ALLE_SCHOOL_IDS.map((id) => masterDataItem({ id, naam: `School ${id}` })),
      uitvoering: MET_TRAINING_IDS.map((schoolId, i) => uitvoeringItem({ id: `training-${i + 1}`, naam: `Training ${i + 1}`, schoolIds: [schoolId] })),
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(37);
    expect(new Set(resultaat.bevestigd.map((s) => s.id)).size).toBe(37); // geen duplicaten
    expect(resultaat.bevestigd.map((s) => s.id).sort()).toEqual([...ALLE_SCHOOL_IDS].sort()); // geen weggevallen ID's

    const zonderTraining = resultaat.bevestigd.filter((s) => s.aantalOpen === 0 && s.aantalGepland === 0 && s.aantalGedaan === 0);
    expect(zonderTraining).toHaveLength(24);
    zonderTraining.forEach((s) => expect(s.eerstvolgendeTraining).toBeNull());
  });

  it("linked_item_ids is de enige bron voor de basisset — werkt ook wanneer de Scholen-kolom zelf .value en .text allebei null heeft", async () => {
    // Expliciet met de hand opgezet (i.p.v. via mockTrainerContext) om zichtbaar
    // te maken dat text/value hier bewust null zijn — root-cause: dat is voor
    // board_relation-kolommen onder de gepinde API-Version altijd het geval.
    mockHaalItemMetKolomWaarden.mockResolvedValueOnce({
      id: TRAINER.mondayUitvoerderItemId,
      name: TRAINER.name,
      column_values: [{ id: UO_SCHOLEN_KOLOM_ID, text: null, value: null, linked_item_ids: ["500", "501"] }],
    });
    mockHaalItemsMetKolomWaarden.mockResolvedValueOnce([masterDataItem({ id: "500", naam: "School A" }), masterDataItem({ id: "501", naam: "School B" })]);
    mockScholenPagina.mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd.map((s) => s.id).sort()).toEqual(["500", "501"]);
  });

  it("een lege Board-5-relatie (geen gekoppelde scholen) geeft een lege lijst, geen fout", async () => {
    mockTrainerContext({ schoolIds: [] });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toEqual([]);
    expect(resultaat.mogelijkGekoppeld).toEqual([]);
    expect(mockHaalItemsMetKolomWaarden).toHaveBeenCalledWith([], expect.any(Array));
  });

  it("het eigen Board-5-item van de trainer wordt niet gevonden (null) -> lege lijst, geen crash", async () => {
    mockTrainerContext({ schoolIds: null });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toEqual([]);
  });

  it("de ongebruikte tweede 'Scholen'-kolom (board_relation_mm4v3wjn) wordt nergens opgevraagd — UO_SCHOLEN_KOLOM is de enige bron", async () => {
    mockTrainerContext({ schoolIds: ["500"], masterData: [masterDataItem({ id: "500", naam: "School" })] });

    await bepaalScholenVoorTrainer(TRAINER);

    expect(mockHaalItemMetKolomWaarden).toHaveBeenCalledWith(TRAINER.mondayUitvoerderItemId, [UO_SCHOLEN_KOLOM_ID]);
    expect(mockHaalItemMetKolomWaarden.mock.calls[0]![1]).not.toContain(UO_SCHOLEN_KOLOM_ONGEBRUIKT_ID);
  });

  it("onderwijstype/locatie/implementatiefase/contactpersoonNaam komen uit de gerichte Master Data-batchfetch, niet uit een boardbrede scan", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [
        masterDataItem({ id: "500", naam: "School", onderwijstype: "Montessori", locatie: "Gorinchem", implementatiefase: "Fase 2", hoofdcontactpersoon: "Jeroen Bakker" }),
      ],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd[0]).toMatchObject({
      id: "500",
      onderwijstype: "Montessori",
      locatie: "Gorinchem",
      implementatiefase: "Fase 2",
      contactpersoonNaam: "Jeroen Bakker",
      bron: "trainer-relatie",
    });
    expect(mockHaalItemsMetKolomWaarden).toHaveBeenCalledWith(["500"], expect.arrayContaining(["dropdown_mm4v9rvg", "text_mm5r9kn2"]));
  });

  it("een Board-4-training gekoppeld aan een school BUITEN de Board-5-relatie is nergens zichtbaar — trainingen voegen nooit een nieuwe school toe", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Bevestigde school" })],
      uitvoering: [uitvoeringItem({ id: "1", naam: "Training bij niet-gekoppelde school", schoolIds: ["999-niet-gekoppeld"] })],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]!.aantalOpen).toBe(0);
    expect(resultaat.bevestigd.some((s) => s.id === "999-niet-gekoppeld")).toBe(false);
  });

  it("cross-trainer: geen enkele school lekt tussen twee opeenvolgende bepaalScholenVoorTrainer-aanroepen", async () => {
    const TRAINER_B: AuthTrainer = { id: 2, name: "Andere Trainer", email: "andere@mijnleerlijn.nl", mondayTrainerboardId: "18424768099", mondayUitvoerderItemId: "999002", actief: true };

    mockTrainerContext({ schoolIds: ["500"], masterData: [masterDataItem({ id: "500", naam: "School van Wessel" })] });
    const resultaatA = await bepaalScholenVoorTrainer(TRAINER);
    expect(resultaatA.bevestigd.map((s) => s.id)).toEqual(["500"]);

    mockTrainerContext({ schoolIds: ["600"], masterData: [masterDataItem({ id: "600", naam: "School van Andere Trainer" })] });
    const resultaatB = await bepaalScholenVoorTrainer(TRAINER_B);
    expect(resultaatB.bevestigd.map((s) => s.id)).toEqual(["600"]);

    expect(resultaatA.bevestigd.some((s) => s.id === "600")).toBe(false);
    expect(resultaatB.bevestigd.some((s) => s.id === "500")).toBe(false);
  });
});

describe("bepaalScholenVoorTrainer — Board-4-trainingen als aanvulling op een bevestigde school", () => {
  it("een Board-4-training met een eigen School-relatie (UV_SCHOOL_KOLOM/linked_item_ids) wordt gekoppeld aan de bevestigde school", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [uitvoeringItem({ id: "700", naam: "Training", schoolIds: ["500"] })],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]!.aantalOpen).toBe(1);
  });

  it("telt Open/Gepland/Gedaan correct en bepaalt de eerstvolgende geplande training", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [
        uitvoeringItem({ id: "1", naam: "Training open", schoolIds: ["500"] }),
        uitvoeringItem({ id: "2", naam: "Training later gepland", schoolIds: ["500"], datum: "2026-09-10" }),
        uitvoeringItem({ id: "3", naam: "Training eerder gepland", schoolIds: ["500"], datum: "2026-08-25" }),
        uitvoeringItem({ id: "4", naam: "Training gedaan", schoolIds: ["500"], status: "Gedaan" }),
      ],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    const school = resultaat.bevestigd[0]!;
    expect(school.aantalOpen).toBe(1);
    expect(school.aantalGepland).toBe(2);
    expect(school.aantalGedaan).toBe(1);
    expect(school.eerstvolgendeTraining).toEqual({ datum: "2026-08-25", naam: "Training eerder gepland" });
  });
});

describe("bepaalScholenVoorTrainer — trainerboard-groepsnaam-fallback (mag nooit meer de primaire reden zijn)", () => {
  it("de bestaande 13 trainerboard-groepen beperken de scholenlijst niet meer: een trainer met 37 Board-5-scholen maar slechts 2 trainerboard-groepen ziet nog steeds alle 37", async () => {
    // Vóór de fix was het EIGEN trainerboard (groepsnaam-matching) de facto
    // de enige werkende bron — precies het live-gerapporteerde symptoom (13
    // scholen i.p.v. 37). Nu blijft de basisset uitsluitend Board 5 se
    // Scholen-relatie, ongeacht hoeveel (of weinig) trainerboard-groepen er zijn.
    const ALLE_SCHOOL_IDS = Array.from({ length: 37 }, (_, i) => `school-${i + 1}`);
    mockTrainerContext({
      schoolIds: ALLE_SCHOOL_IDS,
      masterData: ALLE_SCHOOL_IDS.map((id) => masterDataItem({ id, naam: `School ${id}` })),
      uitvoering: [],
      trainerboard: [
        { id: "801", name: "item", groupTitle: "School school-1", masterId: "900" },
        { id: "802", name: "item", groupTitle: "School school-2", masterId: "901" },
      ],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(37);
  });

  it("wijst een training zonder eigen School-relatie via de trainerboard-groepsnaam toe aan een AL BEVESTIGDE school (bewezen echte Monday-ID-keten)", async () => {
    mockTrainerContext({
      schoolIds: ["18420120365-montessori-gorinchem"],
      masterData: [masterDataItem({ id: "18420120365-montessori-gorinchem", naam: "Montessori Gorinchem" })],
      uitvoering: [uitvoeringItem({ id: "12713002919", naam: "Training zonder schoolkoppeling" })], // schoolIds leeg — precies Wessels live staat
      trainerboard: [{ id: "12717612402", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "12713002919", masterIdValue: "12713002919" }],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]).toMatchObject({ id: "18420120365-montessori-gorinchem", naam: "Montessori Gorinchem", bron: "trainer-relatie" });
    expect(resultaat.bevestigd[0]!.aantalOpen).toBe(1);
  });

  it("REGRESSIETEST (Wessel se 12 scholen): Master ID.text heeft een duizendtal-scheidingsteken, .value niet — de fallback-koppeling moet dit via .value alsnog correct resolven", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })],
      uitvoering: [uitvoeringItem({ id: "12713002919", naam: "Training" })], // schoolIds leeg
      trainerboard: [{ id: "800", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "12.713.002.919", masterIdValue: "12713002919" }],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]!.aantalOpen).toBe(1);
  });

  it("een trainerboard-groepsnaam die niet overeenkomt met een AL BEVESTIGDE school voegt nooit een nieuwe school toe, ook niet als er een geldige training bij hoort", async () => {
    // Kern van de spec ("mag nooit meer de primaire reden zijn waarom een
    // gekoppelde school zichtbaar wordt"): school 500 zit in de Board-5-
    // relatie, "Andere School" niet — ook al heeft "Andere School" een
    // volkomen geldige trainerboard-groep + training, die mag nooit
    // verschijnen. kandidaten zoekt uitsluitend binnen scholen.values()
    // (de al bevestigde set), nooit binnen heel Master Data.
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })],
      uitvoering: [
        uitvoeringItem({ id: "700", naam: "Training bij bevestigde school" }),
        uitvoeringItem({ id: "701", naam: "Training bij niet-gekoppelde school" }),
      ],
      trainerboard: [
        { id: "801", name: "item A", groupTitle: "Montessori Gorinchem", masterId: "700" },
        { id: "802", name: "item B", groupTitle: "Andere School (niet in Board-5-relatie)", masterId: "701" },
      ],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]).toMatchObject({ id: "500", naam: "Montessori Gorinchem" });
    expect(resultaat.bevestigd[0]!.aantalOpen).toBe(1); // alleen training 700 — 701 hoort nergens bij
  });

  it("0 kandidaten (groepsnaam matcht geen enkele bevestigde school) -> geen toewijzing, geen crash", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })],
      uitvoering: [uitvoeringItem({ id: "700", naam: "Training" })],
      trainerboard: [{ id: "800", name: "item", groupTitle: "Onbekende School", masterId: "700" }],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd[0]!.aantalOpen).toBe(0);
  });

  it("2+ kandidaten binnen de bevestigde set met dezelfde genormaliseerde naam -> geen toewijzing (ambiguïteit, nooit gokken)", async () => {
    mockTrainerContext({
      schoolIds: ["500", "501"],
      masterData: [masterDataItem({ id: "500", naam: "De Regenboog" }), masterDataItem({ id: "501", naam: "De Regenboog" })],
      uitvoering: [uitvoeringItem({ id: "700", naam: "Training" })],
      trainerboard: [{ id: "800", name: "item", groupTitle: "De Regenboog", masterId: "700" }],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd.find((s) => s.id === "500")!.aantalOpen).toBe(0);
    expect(resultaat.bevestigd.find((s) => s.id === "501")!.aantalOpen).toBe(0);
  });

  it("kleine case-/witruimteverschillen tussen groupTitle en schoolnaam blijven toegestaan (normalisatie, geen fuzzy match)", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })],
      uitvoering: [uitvoeringItem({ id: "700", naam: "Training" })],
      trainerboard: [{ id: "800", name: "item", groupTitle: "  montessori   GORINCHEM  ", masterId: "700" }],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd[0]!.aantalOpen).toBe(1);
  });

  it("vergelijkbare maar niet identieke schoolnamen matchen nooit (geen fuzzy match)", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Montessori Gorinchem School" })],
      uitvoering: [uitvoeringItem({ id: "700", naam: "Training" })],
      trainerboard: [{ id: "800", name: "item", groupTitle: "Montessori Gorinchem", masterId: "700" }],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd[0]!.aantalOpen).toBe(0);
  });

  it("dedup: twee trainerboard-rijen met dezelfde Master ID tellen de training maar één keer", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })],
      uitvoering: [uitvoeringItem({ id: "700", naam: "Training" })],
      trainerboard: [
        { id: "801", name: "item A", groupTitle: "Montessori Gorinchem", masterId: "700" },
        { id: "802", name: "item B (zelfde Master ID)", groupTitle: "Montessori Gorinchem", masterId: "700" },
      ],
    });

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd[0]!.aantalOpen).toBe(1);
  });
});

describe("verzamelTrainerContext — Uitvoering/trainerboard meerpagina-doorloop", () => {
  it("Uitvoering: trainingen op de tweede pagina worden niet weggelaten", async () => {
    mockHaalItemMetKolomWaarden.mockResolvedValueOnce({
      id: TRAINER.mondayUitvoerderItemId,
      name: TRAINER.name,
      column_values: [{ id: UO_SCHOLEN_KOLOM_ID, text: null, value: null, linked_item_ids: ["500"] }],
    });
    mockHaalItemsMetKolomWaarden.mockResolvedValueOnce([masterDataItem({ id: "500", naam: "School" })]);
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: "pagina-2", items: [uitvoeringItem({ id: "1", naam: "Training pagina 1", schoolIds: ["500"] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "2", naam: "Training pagina 2", schoolIds: ["500"] })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd[0]!.aantalOpen).toBe(2);
  });

  it("stopt zodra de cursor null is — precies 1 haalScholenPagina-aanroep (uitsluitend Uitvoering; Master Data wordt sinds de root-cause-fix niet meer gepagineerd, alleen nog gericht opgehaald)", async () => {
    mockTrainerContext({ schoolIds: ["500"], masterData: [masterDataItem({ id: "500", naam: "School" })] });

    await bepaalScholenVoorTrainer(TRAINER);

    expect(mockScholenPagina).toHaveBeenCalledTimes(1);
  });

  it("het eigen trainerboard (mondayQuery, los van haalScholenPagina) doorloopt ook meerdere pagina's — een Master-ID-match die pas op trainerboard-pagina 2 verschijnt wordt niet gemist", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [uitvoeringItem({ id: "700", naam: "Training" })], // schoolIds leeg -> alleen via trainerboard-fallback vindbaar
    });
    mockUpdatesVoorItem.mockResolvedValue([]);
    // Overschrijft de door mockTrainerContext gezette default: vitest se
    // "once"-wachtrij gaat altijd vóór de default, dus dit bepaalt
    // betrouwbaar de eerste twee aanroepen naar het trainerboard.
    mockQuery
      .mockResolvedValueOnce({ boards: [{ items_page: { cursor: "trainerboard-pagina-2", items: [] } }] })
      .mockResolvedValueOnce({
        boards: [{ items_page: { cursor: null, items: [{ id: "800", name: "item", group: { title: "School" }, column_values: [{ id: "numeric_mm5vceeq", text: "700", value: null }] }] } }],
      });

    const detail = await haalSchoolDetail(TRAINER, "500");

    expect(detail!.trainingen.open[0]).toMatchObject({ id: "700", trainerboardItemId: "800" });
  });
});

describe("trainerboardItemId — schrijfdoel-resolutie voor lib/trainers/writeback.ts", () => {
  it("training met een eigen School-relatie: trainerboardItemId wordt gevuld via de Master-ID-keten", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [uitvoeringItem({ id: "700", naam: "Training", schoolIds: ["500"] })],
      trainerboard: [{ id: "800", name: "Trainerboard-item", groupTitle: "School", masterId: "700" }],
    });
    mockUpdatesVoorItem.mockResolvedValue([]);

    const detail = await haalSchoolDetail(TRAINER, "500");

    expect(detail!.trainingen.open[0]).toMatchObject({ id: "700", trainerboardItemId: "800" });
  });

  it("training zonder eigen School-relatie, toegewezen via de trainerboard-groepsnaam-fallback: trainerboardItemId is het fallback-trainerboard-item", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })],
      uitvoering: [uitvoeringItem({ id: "12713002919", naam: "Training" })], // schoolIds leeg
      trainerboard: [{ id: "12717612402", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "12713002919" }],
    });
    mockUpdatesVoorItem.mockResolvedValue([]);

    const detail = await haalSchoolDetail(TRAINER, "500");

    expect(detail!.trainingen.open[0]).toMatchObject({ id: "12713002919", trainerboardItemId: "12717612402" });
  });

  it("geen bijbehorend trainerboard-item -> trainerboardItemId is null, geen crash", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [uitvoeringItem({ id: "700", naam: "Training", schoolIds: ["500"] })],
      trainerboard: [],
    });
    mockUpdatesVoorItem.mockResolvedValue([]);

    const detail = await haalSchoolDetail(TRAINER, "500");

    expect(detail!.trainingen.open[0]).toMatchObject({ id: "700", trainerboardItemId: null });
  });
});

describe("haalDashboardData", () => {
  // Zelfde afleiding als vandaagIsoAmsterdam() in monday-links.ts (niet
  // new Date().toISOString().slice(0,10) — dat is UTC en kan enkele uren per
  // etmaal van Europe/Amsterdam verschillen, wat deze test rond middernacht
  // NL-tijd onnodig flaky zou maken).
  const VANDAAG = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());

  it("neemt alleen trainingen mét datum mee (nooit trainingen zonder datum)", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [uitvoeringItem({ id: "1", naam: "Zonder datum", schoolIds: ["500"] })],
    });

    const data = await haalDashboardData(TRAINER);
    expect(data.trainingenVandaag).toEqual([]);
    expect(data.komendeTrainingen).toEqual([]);
  });

  it("sluit geannuleerde trainingen uit van vandaag/komend, ook met een datum", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [uitvoeringItem({ id: "1", naam: "Geannuleerd", schoolIds: ["500"], datum: "2099-01-01", status: "Geannuleerd" })],
    });

    const data = await haalDashboardData(TRAINER);
    expect(data.komendeTrainingen).toEqual([]);
  });

  it("sorteert komende trainingen chronologisch", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [
        uitvoeringItem({ id: "1", naam: "Laat", schoolIds: ["500"], datum: "2099-12-01" }),
        uitvoeringItem({ id: "2", naam: "Vroeg", schoolIds: ["500"], datum: "2099-01-01" }),
      ],
    });

    const data = await haalDashboardData(TRAINER);
    expect(data.komendeTrainingen.map((t) => t.naam)).toEqual(["Vroeg", "Laat"]);
  });

  it("logboek-openstaand: verleden datum + logboek niet ingevuld", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [
        uitvoeringItem({ id: "1", naam: "Verleden, niet ingevuld", schoolIds: ["500"], datum: "2020-01-01", logboekIngevuld: false }),
        uitvoeringItem({ id: "2", naam: "Verleden, wél ingevuld", schoolIds: ["500"], datum: "2020-01-02", logboekIngevuld: true }),
        uitvoeringItem({ id: "3", naam: "Toekomst, niet ingevuld", schoolIds: ["500"], datum: "2099-01-01", logboekIngevuld: false }),
      ],
    });

    const data = await haalDashboardData(TRAINER);
    expect(data.logboekOpenstaand.map((t) => t.naam)).toEqual(["Verleden, niet ingevuld"]);
  });

  it("Ronde 2 (Beslissing 1, na review met Michel) — 'Verslag nog invullen' waarschuwt óók voor een training van VANDAAG (<=, niet <), ongeacht status: een training die nog op 'Gepland' staat omdat de trainer vergat 'm op Gedaan te zetten mag niet verdwijnen", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [
        uitvoeringItem({ id: "1", naam: "Vandaag, nog Gepland, niet ingevuld", schoolIds: ["500"], datum: VANDAAG, logboekIngevuld: false }),
        uitvoeringItem({ id: "2", naam: "Vandaag, wél ingevuld", schoolIds: ["500"], datum: VANDAAG, logboekIngevuld: true }),
      ],
    });

    const data = await haalDashboardData(TRAINER);
    expect(data.logboekOpenstaand.map((t) => t.naam)).toEqual(["Vandaag, nog Gepland, niet ingevuld"]);
  });

  it("Ronde 2 vervolg — 'Vandaag' en 'Verslag nog invullen' zijn nu wederzijds-exclusief: een training van vandaag met een niet-ingevuld logboek verschijnt uitsluitend onder 'Verslag nog invullen', niet ook onder 'Vandaag'", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [
        uitvoeringItem({ id: "1", naam: "Vandaag, niet ingevuld", schoolIds: ["500"], datum: VANDAAG, logboekIngevuld: false }),
        uitvoeringItem({ id: "2", naam: "Vandaag, wél ingevuld", schoolIds: ["500"], datum: VANDAAG, logboekIngevuld: true }),
      ],
    });

    const data = await haalDashboardData(TRAINER);
    expect(data.trainingenVandaag.map((t) => t.naam)).toEqual(["Vandaag, wél ingevuld"]);
    expect(data.logboekOpenstaand.map((t) => t.naam)).toEqual(["Vandaag, niet ingevuld"]);
  });

  it("aantalScholen komt overeen met het aantal bevestigde scholen", async () => {
    mockTrainerContext({
      schoolIds: ["500", "501"],
      masterData: [masterDataItem({ id: "500", naam: "A" }), masterDataItem({ id: "501", naam: "B" })],
    });

    const data = await haalDashboardData(TRAINER);
    expect(data.aantalScholen).toBe(2);
  });

  it("Ronde 2 afronding, Trainer-AI — bevestigdeScholen bevat uitsluitend id/naam van déze trainer, alfabetisch (nl) gesorteerd, afgeleid uit dezelfde context (geen extra mockScholenPagina-aanroep t.o.v. een gewone haalDashboardData-call)", async () => {
    mockTrainerContext({
      schoolIds: ["501", "500"],
      masterData: [masterDataItem({ id: "501", naam: "Zilverschool" }), masterDataItem({ id: "500", naam: "Achterhoekschool" })],
    });

    const data = await haalDashboardData(TRAINER);

    expect(data.bevestigdeScholen).toEqual([
      { id: "500", naam: "Achterhoekschool" },
      { id: "501", naam: "Zilverschool" },
    ]);
    expect(mockScholenPagina).toHaveBeenCalledTimes(1);
  });

  it("Traineromgeving V2, Fase 1 — totaalTrainingen telt ALLE trainingen (elke weergavestatus, met én zonder datum), voor de dashboardstatistiek", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [
        uitvoeringItem({ id: "1", naam: "Zonder datum", schoolIds: ["500"] }),
        uitvoeringItem({ id: "2", naam: "Toekomst", schoolIds: ["500"], datum: "2099-01-01" }),
        uitvoeringItem({ id: "3", naam: "Verleden", schoolIds: ["500"], datum: "2020-01-01", logboekIngevuld: true }),
      ],
    });

    const data = await haalDashboardData(TRAINER);
    expect(data.totaalTrainingen).toBe(3);
  });
});

describe("haalAlleTrainingenVoorTrainer (Traineromgeving V2, Fase 1 — /trainingen-pagina)", () => {
  it("geeft ALLE trainingen van de trainer terug, ongefilterd — met én zonder datum, verleden én toekomst, geannuleerd inbegrepen", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [
        uitvoeringItem({ id: "1", naam: "Zonder datum", schoolIds: ["500"] }),
        uitvoeringItem({ id: "2", naam: "Geannuleerd", schoolIds: ["500"], datum: "2020-01-01", status: "Geannuleerd" }),
      ],
    });

    const trainingen = await haalAlleTrainingenVoorTrainer(TRAINER);
    expect(trainingen.map((t) => t.naam).sort()).toEqual(["Geannuleerd", "Zonder datum"]);
  });

  it("elke training draagt schoolId/schoolNaam (zelfde TrainingMetSchool-vorm als haalDashboardData)", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Mijn School" })],
      uitvoering: [uitvoeringItem({ id: "1", naam: "Training", schoolIds: ["500"] })],
    });

    const trainingen = await haalAlleTrainingenVoorTrainer(TRAINER);
    expect(trainingen[0]!.schoolId).toBe("500");
    expect(trainingen[0]!.schoolNaam).toBe("Mijn School");
  });

  it("geen scholen -> lege array, geen fout", async () => {
    mockTrainerContext({ schoolIds: [] });

    expect(await haalAlleTrainingenVoorTrainer(TRAINER)).toEqual([]);
  });
});

describe("haalSchoolDetail — object-level autorisatie", () => {
  it("geeft null terug voor een school-ID dat niet bij deze trainer hoort — geen data, geen 403 die het bestaan verklapt", async () => {
    mockTrainerContext({ schoolIds: ["500"], masterData: [masterDataItem({ id: "500", naam: "Eigen school" })] });

    const detail = await haalSchoolDetail(TRAINER, "999-van-andere-trainer");

    expect(detail).toBeNull();
    expect(mockUpdatesVoorItem).not.toHaveBeenCalled();
  });

  it("geeft volledig detail terug voor een eigen school, met trainingen verdeeld over de weergavebuckets (training-weergave.ts) en het schoollogboek", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Eigen school", hoofdcontactpersoon: "Jeroen Bakker" })],
      uitvoering: [
        uitvoeringItem({ id: "1", naam: "Open", schoolIds: ["500"] }),
        uitvoeringItem({ id: "2", naam: "Komend", schoolIds: ["500"], datum: "2099-01-01" }),
        uitvoeringItem({ id: "3", naam: "Gedaan", schoolIds: ["500"], status: "Gedaan" }),
        uitvoeringItem({ id: "4", naam: "Geannuleerd", schoolIds: ["500"], status: "Geannuleerd" }),
      ],
    });
    mockUpdatesVoorItem.mockResolvedValue([{ id: "u1", item_id: "500", text_body: "Alles goed verlopen", created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z", creator: null }]);

    const detail = await haalSchoolDetail(TRAINER, "500");

    expect(detail).not.toBeNull();
    expect(detail!.contactpersoonNaam).toBe("Jeroen Bakker");
    expect(detail!.trainingen.open.map((t) => t.naam)).toEqual(["Open"]);
    expect(detail!.trainingen.komend.map((t) => t.naam)).toEqual(["Komend"]);
    expect(detail!.trainingen.gedaan.map((t) => t.naam)).toEqual(["Gedaan"]);
    expect(detail!.trainingen.geannuleerd.map((t) => t.naam)).toEqual(["Geannuleerd"]);
    expect(detail!.logboek).toHaveLength(1);
    expect(mockUpdatesVoorItem).toHaveBeenCalledWith("500", 30);
  });

  it("sorteert trainingen binnen een sectie alfabetisch A-Z op naam, niet op de volgorde waarin Monday ze teruggeeft", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Eigen school" })],
      uitvoering: [
        uitvoeringItem({ id: "1", naam: "Training", schoolIds: ["500"] }),
        uitvoeringItem({ id: "2", naam: "Bijeenkomst | dagdeel", schoolIds: ["500"] }),
        uitvoeringItem({ id: "3", naam: "Online spreekuur", schoolIds: ["500"] }),
        uitvoeringItem({ id: "4", naam: "Online beheerderstraining", schoolIds: ["500"] }),
      ],
    });
    mockUpdatesVoorItem.mockResolvedValue([]);

    const detail = await haalSchoolDetail(TRAINER, "500");

    expect(detail!.trainingen.open.map((t) => t.naam)).toEqual([
      "Bijeenkomst | dagdeel",
      "Online beheerderstraining",
      "Online spreekuur",
      "Training",
    ]);
  });

  it("contactpersoonBetrouwbaar is true wanneer de contactpersoon-kolom een echte board_relation-koppeling heeft (linked_item_ids), niet alleen gecachte tekst", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Eigen school", hoofdcontactpersoon: "Jeroen Bakker", hoofdcontactpersoonLinkedId: 12345 })],
    });
    mockUpdatesVoorItem.mockResolvedValue([]);

    const detail = await haalSchoolDetail(TRAINER, "500");

    expect(detail!.contactpersoonNaam).toBe("Jeroen Bakker");
    expect(detail!.contactpersoonBetrouwbaar).toBe(true);
  });

  it("contactpersoonBetrouwbaar is false wanneer de contactpersoon-kolom uitsluitend gecachte tekst heeft, geen echte linked_item_ids-relatie", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "Eigen school", hoofdcontactpersoon: "Verouderde naam" })],
    });
    mockUpdatesVoorItem.mockResolvedValue([]);

    const detail = await haalSchoolDetail(TRAINER, "500");

    // contactpersoonNaam blijft ongewijzigd zichtbaar (bestaand gedrag) —
    // uitsluitend het betrouwbaarheidssignaal is false.
    expect(detail!.contactpersoonNaam).toBe("Verouderde naam");
    expect(detail!.contactpersoonBetrouwbaar).toBe(false);
  });
});

describe("Ronde 2 vervolg — geen verborgen Monday-write tijdens een pageview (GET/alleen-lezen)", () => {
  // Expliciete opdrachtseis: "Ik wil hierbij géén verborgen Monday-write
  // tijdens het alleen bekijken van een pagina." haalDashboardData/
  // haalSchoolDetail/bepaalScholenVoorTrainer voeden uitsluitend Server
  // Component-pagina's (GET-achtig, geen enkele Server Action/mutatie-
  // trigger). Sinds de root-cause-fix roept verzamelTrainerContext
  // legitiem WEL haalItemMetKolomWaarden/haalItemsMetKolomWaarden aan (beide
  // zijn leesfuncties) — deze test controleert daarom uitsluitend op de
  // enige echte SCHRIJFfunctie die dit bestand zou kunnen misbruiken.
  it("haalDashboardData roept nooit een Monday-schrijffunctie aan", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [uitvoeringItem({ id: "1", naam: "Training", schoolIds: ["500"], datum: "2026-09-01" })],
    });

    await haalDashboardData(TRAINER);

    expect(mockWijzigKolomWaarde).not.toHaveBeenCalled();
  });

  it("haalSchoolDetail roept nooit een Monday-schrijffunctie aan", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [uitvoeringItem({ id: "1", naam: "Training", schoolIds: ["500"] })],
    });
    mockUpdatesVoorItem.mockResolvedValue([]);

    await haalSchoolDetail(TRAINER, "500");

    expect(mockWijzigKolomWaarde).not.toHaveBeenCalled();
  });

  it("bepaalScholenVoorTrainer roept nooit een Monday-schrijffunctie aan", async () => {
    mockTrainerContext({ schoolIds: ["500"], masterData: [masterDataItem({ id: "500", naam: "School" })] });

    await bepaalScholenVoorTrainer(TRAINER);

    expect(mockWijzigKolomWaarde).not.toHaveBeenCalled();
  });
});

describe("haalRecenteTrainingenVoorTelefonie (Ronde 3.5, telefonie — spec §5/§6)", () => {
  const VANDAAG = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
  /** Negatief = in de toekomst. Behandelt VANDAAG als een kalenderdag (12:00 UTC, nooit een middernachtrand). */
  function dagenGeleden(n: number): string {
    const d = new Date(`${VANDAAG}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  it("neemt een training van vandaag mee, met trainerboardItemId server-side gekoppeld via de Master-ID-keten (spec §6: nooit een tweede interpretatie)", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [uitvoeringItem({ id: "1", naam: "Training vandaag", schoolIds: ["500"], datum: VANDAAG })],
      trainerboard: [{ id: "2001", name: "Training vandaag", masterId: "1" }],
    });

    const trainingen = await haalRecenteTrainingenVoorTelefonie(TRAINER);
    expect(trainingen).toHaveLength(1);
    expect(trainingen[0]!.trainerboardItemId).toBe("2001");
    expect(trainingen[0]!.schoolId).toBe("500");
    expect(trainingen[0]!.schoolNaam).toBe("School");
  });

  it("sluit een training zonder gekoppeld trainerboard-item uit — telefonisch nooit een niet-bewerkbare training aanbieden", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [uitvoeringItem({ id: "1", naam: "Training", schoolIds: ["500"], datum: VANDAAG })],
    });

    expect(await haalRecenteTrainingenVoorTelefonie(TRAINER)).toEqual([]);
  });

  it("sluit een geannuleerde training uit, ook al valt de datum binnen het venster", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [uitvoeringItem({ id: "1", naam: "Geannuleerd", schoolIds: ["500"], datum: VANDAAG, status: "Geannuleerd" })],
      trainerboard: [{ id: "2001", name: "x", masterId: "1" }],
    });

    expect(await haalRecenteTrainingenVoorTelefonie(TRAINER)).toEqual([]);
  });

  it("sluit een training zonder datum uit", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [uitvoeringItem({ id: "1", naam: "Zonder datum", schoolIds: ["500"] })],
      trainerboard: [{ id: "2001", name: "x", masterId: "1" }],
    });

    expect(await haalRecenteTrainingenVoorTelefonie(TRAINER)).toEqual([]);
  });

  it("sluit een training buiten het recente venster uit (>3 dagen geleden) én een toekomstige training (spec §5: 'begin klein, recente trainingen rond vandaag')", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [
        uitvoeringItem({ id: "1", naam: "4 dagen geleden", schoolIds: ["500"], datum: dagenGeleden(4) }),
        uitvoeringItem({ id: "2", naam: "Morgen", schoolIds: ["500"], datum: dagenGeleden(-1) }),
      ],
      trainerboard: [
        { id: "2001", name: "x", masterId: "1" },
        { id: "2002", name: "y", masterId: "2" },
      ],
    });

    expect(await haalRecenteTrainingenVoorTelefonie(TRAINER)).toEqual([]);
  });

  it("neemt trainingen tot en met 3 dagen geleden mee, gesorteerd meest-recent-eerst", async () => {
    mockTrainerContext({
      schoolIds: ["500"],
      masterData: [masterDataItem({ id: "500", naam: "School" })],
      uitvoering: [
        uitvoeringItem({ id: "1", naam: "3 dagen geleden", schoolIds: ["500"], datum: dagenGeleden(3) }),
        uitvoeringItem({ id: "2", naam: "Vandaag", schoolIds: ["500"], datum: VANDAAG }),
        uitvoeringItem({ id: "3", naam: "Gisteren", schoolIds: ["500"], datum: dagenGeleden(1) }),
      ],
      trainerboard: [
        { id: "2001", name: "x", masterId: "1" },
        { id: "2002", name: "y", masterId: "2" },
        { id: "2003", name: "z", masterId: "3" },
      ],
    });

    const trainingen = await haalRecenteTrainingenVoorTelefonie(TRAINER);
    expect(trainingen.map((t) => t.naam)).toEqual(["Vandaag", "Gisteren", "3 dagen geleden"]);
  });

  // Scenario 7 uit de opdracht ("training van een andere trainer nooit
  // aangeboden") is op DIT niveau niet los te simuleren: trainerboardStructuur
  // wordt al opgehaald op trainer.mondayTrainerboardId (de eigen
  // trainerboard-query), dus "een andere trainer" betekent hier praktisch
  // "geen trainerboard-item" — al gedekt door de test hierboven. De
  // trainer-scoping zelf heeft al brede, bestaande dekking elders in dit
  // bestand (bepaalScholenVoorTrainer, cross-trainer). Het end-to-end
  // scenario — trainer A krijgt telefonisch nooit trainer B se trainingen te
  // kiezen — wordt bewezen in lib/trainers/telefonie/gesprek.test.ts.
});

// Traineromgeving V2, Fase 4 (2026-08-24) — Admin Trainerdashboard.
// haalTrainingenEnScholenVoorAlleTrainers is de admin-brede tegenhanger van
// bepaalScholenVoorTrainer/haalAlleTrainingenVoorTrainer hierboven. Root-
// cause-fix (2026-09-03): kreeg UITSLUITEND de generieke parseLinkedPulseIds-
// reparatie (leest nu linked_item_ids i.p.v. het altijd-lege .value) — de
// bronrichting bleef BEWUST Master Data.Trainer (board 1), niet omgezet naar
// UO_SCHOLEN_KOLOM (board 5) zoals bepaalScholenVoorTrainer hierboven, om de
// kern-performance-eis (exact 2 Monday-aanroepen, ongeacht het aantal
// trainers) te behouden — zie monday-links.ts se toelichting bij deze
// functie. Vóór de fix gaf dit admin-overzicht voor ELKE trainer altijd 0
// scholen/trainingen; de onderstaande tests waren dus zelf ook geraakt door
// dezelfde bug (mockten tot deze herbouw nog met JSON-.value-fixtures, die
// het echte databug-symptoom niet zichtbaar maakten) — masterDataItem/
// uitvoeringItem geven nu net als overal elders linked_item_ids mee.
describe("haalTrainingenEnScholenVoorAlleTrainers (Traineromgeving V2, Fase 4 — Admin Trainerdashboard)", () => {
  it("wijst elke school toe aan de trainer(s) die er via Master Data.Trainer aan gekoppeld zijn, nooit aan een niet-gekoppelde trainer", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          masterDataItem({ id: "500", naam: "School van trainer A", trainerLinkedIds: [111] }),
          masterDataItem({ id: "600", naam: "School van trainer B", trainerLinkedIds: [222] }),
          masterDataItem({ id: "700", naam: "School zonder trainer" }),
        ],
      })
      .mockResolvedValueOnce({ cursor: null, items: [] });

    const { scholenPerTrainer } = await haalTrainingenEnScholenVoorAlleTrainers();

    expect(scholenPerTrainer.get("111")).toEqual([{ id: "500", naam: "School van trainer A" }]);
    expect(scholenPerTrainer.get("222")).toEqual([{ id: "600", naam: "School van trainer B" }]);
    expect(scholenPerTrainer.has("700")).toBe(false); // geen enkele trainer gekoppeld -> voor niemand zichtbaar
  });

  it("een school met meerdere gekoppelde trainers verschijnt bij ELK van die trainers", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Gedeelde school", trainerLinkedIds: [111, 222] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "1", naam: "Gezamenlijke training", schoolIds: ["500"] })] });

    const { scholenPerTrainer, trainingenPerTrainer } = await haalTrainingenEnScholenVoorAlleTrainers();

    expect(scholenPerTrainer.get("111")).toEqual([{ id: "500", naam: "Gedeelde school" }]);
    expect(scholenPerTrainer.get("222")).toEqual([{ id: "500", naam: "Gedeelde school" }]);
    expect(trainingenPerTrainer.get("111")!.map((t) => t.naam)).toEqual(["Gezamenlijke training"]);
    expect(trainingenPerTrainer.get("222")!.map((t) => t.naam)).toEqual(["Gezamenlijke training"]);
  });

  it("elke training draagt schoolId/schoolNaam (zelfde TrainingMetSchool-vorm als haalAlleTrainingenVoorTrainer), en trainerboardItemId is altijd null", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Mijn School", trainerLinkedIds: [111] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "1", naam: "Training", schoolIds: ["500"] })] });

    const { trainingenPerTrainer } = await haalTrainingenEnScholenVoorAlleTrainers();

    const training = trainingenPerTrainer.get("111")![0]!;
    expect(training.schoolId).toBe("500");
    expect(training.schoolNaam).toBe("Mijn School");
    expect(training.trainerboardItemId).toBeNull();
  });

  it("volgt meerdere pagina's per board (Master Data én Uitvoering), niet stil afgekapt bij de eerste pagina", async () => {
    mockScholenPagina.mockImplementation(async ({ columnIds, cursor }) => {
      const isMasterData = columnIds.includes(MD_TRAINER_KOLOM_ID);
      if (isMasterData) {
        if (!cursor) return { cursor: "md-pagina-2", items: [masterDataItem({ id: "500", naam: "School pagina 1", trainerLinkedIds: [111] })] };
        return { cursor: null, items: [masterDataItem({ id: "600", naam: "School pagina 2", trainerLinkedIds: [222] })] };
      }
      return { cursor: null, items: [] };
    });

    const { scholenPerTrainer } = await haalTrainingenEnScholenVoorAlleTrainers();

    expect(scholenPerTrainer.get("111")).toEqual([{ id: "500", naam: "School pagina 1" }]);
    expect(scholenPerTrainer.get("222")).toEqual([{ id: "600", naam: "School pagina 2" }]);
  });

  // Kern-performance-eis (opdrachtseis §13): "vermijd N trainers × N losse
  // Monday-requests" — deze functie moet ONGEACHT hoeveel trainers er in het
  // resultaat voorkomen exact 2 aanroepen doen (Master Data + Uitvoering,
  // elk 1 pagina in dit scenario), en NOOIT het trainerboard bevragen
  // (mondayQuery, zie de moduletoelichting: bewust weggelaten voor het
  // admin-brede overzicht).
  it("doet exact 2 Monday-aanroepen ongeacht het aantal trainers in het resultaat, en roept nooit het trainerboard (mondayQuery) aan", async () => {
    const VEEL_TRAINERS = Array.from({ length: 25 }, (_, i) => i + 1);
    mockScholenPagina
      .mockResolvedValueOnce({
        cursor: null,
        items: VEEL_TRAINERS.map((id) => masterDataItem({ id: `school-${id}`, naam: `School ${id}`, trainerLinkedIds: [id] })),
      })
      .mockResolvedValueOnce({ cursor: null, items: [] });

    const { scholenPerTrainer } = await haalTrainingenEnScholenVoorAlleTrainers();

    expect(scholenPerTrainer.size).toBe(25); // bewijst dat het scenario écht 25 trainers omvat
    expect(mockScholenPagina).toHaveBeenCalledTimes(2);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("lege boards geven lege Maps terug, geen fout", async () => {
    mockScholenPagina.mockResolvedValue({ cursor: null, items: [] });
    const { scholenPerTrainer, trainingenPerTrainer } = await haalTrainingenEnScholenVoorAlleTrainers();
    expect(scholenPerTrainer.size).toBe(0);
    expect(trainingenPerTrainer.size).toBe(0);
  });
});
