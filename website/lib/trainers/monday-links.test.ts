import { describe, it, expect, vi, beforeEach } from "vitest";
import { mondayQuery, haalScholenPagina, haalUpdatesVoorItem, wijzigKolomWaarde, haalItemMetKolomWaarden } from "@/lib/sales/monday-client";
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
} from "./monday-links";
import type { AuthTrainer } from "./auth";

vi.mock("@/lib/sales/monday-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sales/monday-client")>();
  // wijzigKolomWaarde/haalItemMetKolomWaarden worden hier NIET door monday-
  // links.ts zelf gebruikt (het leespad importeert ze niet eens) — uitsluitend
  // gemockt zodat de test hieronder ("geen verborgen Monday-write tijdens
  // een pageview") kan bewijzen dat ze nooit aangeroepen worden, i.p.v. dat
  // alleen op de afwezigheid van de import te vertrouwen.
  return { ...echt, mondayQuery: vi.fn(), haalScholenPagina: vi.fn(), haalUpdatesVoorItem: vi.fn(), wijzigKolomWaarde: vi.fn(), haalItemMetKolomWaarden: vi.fn() };
});

const mockQuery = vi.mocked(mondayQuery);
const mockScholenPagina = vi.mocked(haalScholenPagina);
const mockUpdatesVoorItem = vi.mocked(haalUpdatesVoorItem);
const mockWijzigKolomWaarde = vi.mocked(wijzigKolomWaarde);
const mockHaalItemMetKolomWaarden = vi.mocked(haalItemMetKolomWaarden);

const TRAINER: AuthTrainer = {
  id: 1,
  name: "Wessel",
  email: "wessel@mijnleerlijn.nl",
  mondayTrainerboardId: "18424768045",
  mondayUitvoerderItemId: "999001",
  actief: true,
};

function linkedPulseIdsValue(ids: (string | number)[]): string {
  return JSON.stringify({ linkedPulseIds: ids.map((linkedPulseId) => ({ linkedPulseId })) });
}

function checkboxValue(checked: boolean): string {
  return JSON.stringify({ checked: checked ? "true" : "" });
}

function masterDataItem(opts: {
  id: string;
  naam: string;
  trainerLinkedIds?: (string | number)[];
  hoofdcontactpersoon?: string | null;
  /** Ronde 2 afronding, Trainer-AI — als gezet, krijgt de contactpersoon-kolom ook een echte .value-relatie (contactpersoonBetrouwbaar = true); zonder is .value leeg, zelfde als voorheen (contactpersoonBetrouwbaar = false). */
  hoofdcontactpersoonLinkedId?: string | number;
  onderwijstype?: string | null;
  locatie?: string | null;
  implementatiefase?: string | null;
}) {
  return {
    id: opts.id,
    name: opts.naam,
    updated_at: "2026-08-19T00:00:00.000Z",
    column_values: [
      { id: "board_relation_mm5r2jy1", text: null, value: opts.trainerLinkedIds ? linkedPulseIdsValue(opts.trainerLinkedIds) : null },
      {
        id: "board_relation_mm4v8fpm",
        text: opts.hoofdcontactpersoon ?? null,
        value: opts.hoofdcontactpersoonLinkedId !== undefined ? linkedPulseIdsValue([opts.hoofdcontactpersoonLinkedId]) : null,
      },
      { id: "dropdown_mm4v9rvg", text: opts.onderwijstype ?? null, value: null },
      { id: "text_mm5r9kn2", text: opts.locatie ?? null, value: null },
      { id: "color_mm5q790a", text: opts.implementatiefase ?? null, value: null },
    ],
  };
}

function uitvoeringItem(opts: { id: string; naam: string; schoolIds?: (string | number)[]; status?: string | null; datum?: string | null; logboekIngevuld?: boolean }) {
  return {
    id: opts.id,
    name: opts.naam,
    updated_at: "2026-08-19T00:00:00.000Z",
    column_values: [
      { id: "board_relation_mm5tyc40", text: null, value: opts.schoolIds ? linkedPulseIdsValue(opts.schoolIds) : null },
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
            // zodat bestaande tests (die alleen .text zetten) ongewijzigd
            // via de .text-fallback blijven werken.
            column_values: [{ id: "numeric_mm5vceeq", text: i.masterId ?? null, value: i.masterIdValue ?? null }],
          })),
        },
      },
    ],
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockScholenPagina.mockReset();
  mockUpdatesVoorItem.mockReset();
});

describe("parseLinkedPulseIds", () => {
  it("parseert linkedPulseIds naar string-ID's", () => {
    expect(parseLinkedPulseIds(linkedPulseIdsValue([18420555, 18420556]))).toEqual(["18420555", "18420556"]);
  });
  it("geeft een lege lijst terug voor null/undefined/lege string", () => {
    expect(parseLinkedPulseIds(null)).toEqual([]);
    expect(parseLinkedPulseIds(undefined)).toEqual([]);
    expect(parseLinkedPulseIds("")).toEqual([]);
  });
  it("geeft een lege lijst terug bij kapotte JSON — geen crash", () => {
    expect(parseLinkedPulseIds("niet-geldige-json{")).toEqual([]);
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
    // Simuleert precies het gerapporteerde databug: Monday's Numbers-kolom
    // toont .text met een duizendtal-scheidingsteken (weergave-instelling),
    // terwijl .value (JSON) het ruwe, ongeformatteerde getal bevat.
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

describe("bepaalScholenVoorTrainer — resolutieladder", () => {
  it("tier 1: Master Data.Trainer bevat het item-ID van deze trainer", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({
        cursor: null,
        items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem", trainerLinkedIds: [999001], onderwijstype: "Montessori", locatie: "Gorinchem" })],
      })
      .mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]).toMatchObject({ id: "500", naam: "Montessori Gorinchem", bron: "trainer-relatie", onderwijstype: "Montessori", locatie: "Gorinchem" });
    expect(resultaat.mogelijkGekoppeld).toEqual([]);
  });

  it("tier 2: geen Trainer-relatie, maar de centrale training (via trainerboard-Master-ID) heeft wél een School-koppeling", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School B" })] }) // geen trainerLinkedIds
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training", schoolIds: ["500"] })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "Trainerboard-item", groupTitle: "School B", masterId: "700" }]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]).toMatchObject({ id: "500", bron: "training-koppeling" });
  });

  it("tier 2 — REGRESSIETEST Wessel se 12 scholen: Master ID.text heeft een duizendtal-scheidingsteken, .value niet — moet nu tóch hard koppelen i.p.v. naar tier 3 wegzakken", async () => {
    // Reproduceert het exacte gerapporteerde databug-scenario: vóór de fix
    // gebruikte haalTrainerboardStructuur() .text ("12.713.002.919") als
    // opzoeksleutel in uitvoeringById (sleutels zijn altijd schone
    // item-ID's, "12713002919") — die exacte match faalde stilzwijgend,
    // ondanks dat de centrale training wél degelijk een geldige
    // School-koppeling had. Zonder de fix zou dit resultaat lege
    // "bevestigd" + een tier-3-suggestie zijn (zie de test hieronder als
    // tegenvoorbeeld); mét de fix moet dit hard bevestigd zijn.
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] }) // geen directe trainerLinkedIds (tier 1 faalt bewust)
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "12713002919", naam: "Training", schoolIds: ["500"] })] });
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([
        { id: "800", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "12.713.002.919", masterIdValue: "12713002919" },
      ])
    );

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]).toMatchObject({ id: "500", naam: "Montessori Gorinchem", bron: "training-koppeling" });
    expect(resultaat.mogelijkGekoppeld).toEqual([]);
  });

  it("tier 2 — zonder de fix (ter documentatie): dezelfde situatie met alléén het geformatteerde .text zou wél mislukken", async () => {
    // Geen masterIdValue meegegeven — dit is exact hoe de OUDE code zich
    // altijd gedroeg (alleen .text bestond effectief). Bevestigt dat de
    // hierboven geteste regressie een reëel, reproduceerbaar verschil maakt
    // en niet toevallig altijd al werkte.
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "12713002919", naam: "Training", schoolIds: ["500"] })] });
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([{ id: "800", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "12.713.002.919" }])
    );

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    // De Master-ID-opzoeking mist ("12.713.002.919" !== "12713002919"),
    // dus uitvoeringById.get(...) vindt niets en de school blijft onbevestigd.
    expect(resultaat.bevestigd).toEqual([]);
  });

  it("tier 2 — bewezen echt voorbeeld: trainerboard-item 12717612402 -> Master ID 12713002919 -> centrale training -> School-koppeling", async () => {
    // Rechtstreeks de door de opdrachtgever gegeven, bevestigd-werkende
    // echte Monday-ID-keten (architectuurrapport) — geen gesimuleerde
    // kleine testgetallen, om te bevestigen dat de resolutieketen ook met
    // echte, 11-cijferige Monday-ID's correct blijft werken (o.a. geen
    // precisieverlies bij het JSON.parse()'en van het getal in
    // parseNumeriekeKolomAlsId — ruim binnen Number.MAX_SAFE_INTEGER).
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "18420120365-school-1", naam: "Bewezen-voorbeeldschool" })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [uitvoeringItem({ id: "12713002919", naam: "Centrale training", schoolIds: ["18420120365-school-1"] })],
      });
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([{ id: "12717612402", name: "Trainerboard-item", groupTitle: "Bewezen-voorbeeldschool", masterId: "12713002919", masterIdValue: "12713002919" }])
    );

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]).toMatchObject({ id: "18420120365-school-1", bron: "training-koppeling" });
  });

  it("cross-trainer: de scheidingsteken-fix lekt geen scholen tussen trainers — elke trainer ziet uitsluitend de koppeling via het eigen trainerboard", async () => {
    // Twee trainers, elk met een eigen trainerboard waarvan de Master-ID-
    // kolom hetzelfde scheidingsteken-format-probleem heeft, maar die naar
    // VERSCHILLENDE centrale trainingen/scholen wijzen — bevestigt dat de
    // fix per-aanroep werkt op de context van de opgegeven trainer, en geen
    // gedeelde/lekkende state introduceert tussen twee achtereenvolgende
    // bepaalScholenVoorTrainer()-aanroepen.
    const TRAINER_B: AuthTrainer = { id: 2, name: "Andere Trainer", email: "andere@mijnleerlijn.nl", mondayTrainerboardId: "18424768099", mondayUitvoerderItemId: "999002", actief: true };

    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School van Wessel" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "12713002919", naam: "Training A", schoolIds: ["500"] })] });
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([{ id: "800", name: "item", groupTitle: "School van Wessel", masterId: "12.713.002.919", masterIdValue: "12713002919" }])
    );
    const resultaatA = await bepaalScholenVoorTrainer(TRAINER);
    expect(resultaatA.bevestigd.map((s) => s.id)).toEqual(["500"]);

    mockScholenPagina
      .mockReset()
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "600", naam: "School van Andere Trainer" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "99999999999", naam: "Training B", schoolIds: ["600"] })] });
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([{ id: "801", name: "item", groupTitle: "School van Andere Trainer", masterId: "99.999.999.999", masterIdValue: "99999999999" }])
    );
    const resultaatB = await bepaalScholenVoorTrainer(TRAINER_B);
    expect(resultaatB.bevestigd.map((s) => s.id)).toEqual(["600"]);

    // Geen enkele school van de ander lekt mee.
    expect(resultaatA.bevestigd.some((s) => s.id === "600")).toBe(false);
    expect(resultaatB.bevestigd.some((s) => s.id === "500")).toBe(false);
  });

  it("tier 2 (test 1, live bevestigd — Wessel/Montessori Gorinchem): School-kolom leeg op de centrale training + exact één Master Data-naammatch -> BEVESTIGD onder Mijn scholen, niet meer als suggestie", async () => {
    // Exacte, live via /admin/trainers-diagnose/monday bevestigde keten:
    // trainerboard-item 12717612402 -> Master ID 12713002919 -> centrale
    // training 12713002919 op "4: Uitvoering" -> School (board_relation_
    // mm5tyc40) is daar ECHT null (geen parse-/scheidingstekenbug — .text en
    // .value zijn op Wessels board voor deze Master ID allebei gewoon
    // "12713002919"). De enige overgebleven schoolidentiteit is groupTitle
    // "Montessori Gorinchem" op het persoonlijke trainerboard.
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "18420120365-montessori-gorinchem", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "12713002919", naam: "Training zonder schoolkoppeling" })] }); // schoolIds leeg — precies Wessels live staat
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([
        { id: "12717612402", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "12713002919", masterIdValue: "12713002919" },
      ])
    );

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]).toMatchObject({ id: "18420120365-montessori-gorinchem", naam: "Montessori Gorinchem", bron: "legacy-unique" });
    // Harde write-back-eis: id is het ECHTE Master Data item-ID, nooit de groepnaam.
    expect(resultaat.bevestigd[0]!.id).not.toBe("Montessori Gorinchem");
    expect(resultaat.mogelijkGekoppeld).toEqual([]);
    // Live gerapporteerde vervolgbug (na acd0a16): de school werd wél
    // bevestigd, maar trainerboard-item 12717612402 se eigen centrale
    // training (12713002919) telde daarna NERGENS mee — 0 open/0 gepland/0
    // gedaan, ondanks dat de school-identiteit via exact déze Master-ID-
    // keten is vastgesteld. De training moet nu wél meetellen.
    expect(resultaat.bevestigd[0]!.aantalOpen).toBe(1);
    expect(resultaat.bevestigd[0]!.aantalGepland).toBe(0);
    expect(resultaat.bevestigd[0]!.aantalGedaan).toBe(0);
  });

  it("REGRESSIETEST (vervolg op test 1): haalSchoolDetail/haalDashboardData tonen dezelfde, via legacy-unique gekoppelde training ook daadwerkelijk", async () => {
    // Zelfde exacte keten als test 1 hierboven, nu getoetst tegen de twee
    // ANDERE consumers van trainingenPerSchool — beide lazen tot deze fix
    // uit dezelfde (structureel lege) map voor een legacy-unique-school.
    const seedMocks = () => {
      mockScholenPagina
        .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "18420120365-montessori-gorinchem", naam: "Montessori Gorinchem" })] })
        .mockResolvedValueOnce({
          cursor: null,
          items: [uitvoeringItem({ id: "12713002919", naam: "Training Montessori Gorinchem", datum: "2026-09-01" })],
        });
      mockQuery.mockResolvedValue(
        trainerboardBoardsResponse([
          { id: "12717612402", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "12713002919", masterIdValue: "12713002919" },
        ])
      );
    };

    seedMocks();
    const detail = await haalSchoolDetail(TRAINER, "18420120365-montessori-gorinchem");
    expect(detail).not.toBeNull();
    expect(detail!.bron).toBe("legacy-unique");
    // Toekomstige datum -> bucket "komend" (training-weergave.ts), niet meer
    // de vlakke "gepland"-statusgroep van vóór Ronde 2 vervolg.
    expect(detail!.trainingen.komend.map((t) => t.id)).toEqual(["12713002919"]);

    mockScholenPagina.mockReset();
    seedMocks();
    const dashboard = await haalDashboardData(TRAINER);
    expect(dashboard.komendeTrainingen).toHaveLength(1);
    expect(dashboard.komendeTrainingen[0]).toMatchObject({ id: "12713002919", schoolId: "18420120365-montessori-gorinchem" });
  });

  it("meerdere trainerboard-items in dezelfde groep (Montessori Gorinchem heeft meerdere Training/Online-uur-items): ALLE tellen mee, niet alleen de eerste", async () => {
    // Reproduceert expliciet de door de opdrachtgever genoemde live situatie
    // — meerdere trainerboard-rijen onder één groep, elk met een eigen
    // Master ID en dus een eigen centrale training. De oude
    // `if (scholen.has(kandidaat.id)) continue;`-guard sloeg élk item ná het
    // eerste in dezelfde groep structureel over (ook de trainingstoewijzing)
    // — dit test expliciet dat een 2e/3e item in dezelfde groep nog steeds
    // wordt meegeteld, ondanks dat de school al bevestigd is door het 1e.
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          uitvoeringItem({ id: "701", naam: "Training 1" }), // open (geen status/datum)
          uitvoeringItem({ id: "702", naam: "Online uur 2", datum: "2026-09-15" }), // gepland
          uitvoeringItem({ id: "703", naam: "Training 3 (gedaan)", status: "Gedaan" }), // gedaan
        ],
      });
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([
        { id: "801", name: "Training 1", groupTitle: "Montessori Gorinchem", masterId: "701" },
        { id: "802", name: "Online uur 2", groupTitle: "Montessori Gorinchem", masterId: "702" },
        { id: "803", name: "Training 3", groupTitle: "Montessori Gorinchem", masterId: "703" },
      ])
    );

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    const school = resultaat.bevestigd[0]!;
    expect(school).toMatchObject({ id: "500", bron: "legacy-unique" });
    expect(school.aantalOpen).toBe(1);
    expect(school.aantalGepland).toBe(1);
    expect(school.aantalGedaan).toBe(1);
  });

  it("gemengde groep: één trainerboard-item met harde School-koppeling + één zonder — beide tellen mee onder dezelfde school", async () => {
    // Het eerste item bevestigt de school hard (training-koppeling); het
    // tweede item (zelfde groep, eigen Master ID, lege School-kolom op zijn
    // eigen centrale training) moet er via legacy-unique alsnog bij opgeteld
    // worden — bevestigt dat de trainingstoewijzing niet afhangt van WELKE
    // tier de school uiteindelijk bevestigde.
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          uitvoeringItem({ id: "701", naam: "Training met harde koppeling", schoolIds: ["500"] }),
          uitvoeringItem({ id: "702", naam: "Training zonder schoolkoppeling" }),
        ],
      });
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([
        { id: "801", name: "item A", groupTitle: "Montessori Gorinchem", masterId: "701" },
        { id: "802", name: "item B", groupTitle: "Montessori Gorinchem", masterId: "702" },
      ])
    );

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    const school = resultaat.bevestigd[0]!;
    expect(school).toMatchObject({ id: "500", bron: "training-koppeling" }); // harde bron blijft leidend, wordt niet overschreven
    expect(school.aantalOpen).toBe(2); // beide trainingen tellen mee
  });

  it("dedup: twee trainerboard-rijen die toevallig dezelfde Master ID hebben, tellen de training maar één keer", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training" })] });
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([
        { id: "801", name: "item A", groupTitle: "Montessori Gorinchem", masterId: "700" },
        { id: "802", name: "item B (zelfde Master ID)", groupTitle: "Montessori Gorinchem", masterId: "700" },
      ])
    );

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]!.aantalOpen).toBe(1);
  });

  it("cross-trainer: legacy-gekoppelde trainingen van de ene trainer tellen niet mee bij de andere", async () => {
    const TRAINER_B: AuthTrainer = { id: 2, name: "Andere Trainer", email: "andere@mijnleerlijn.nl", mondayTrainerboardId: "18424768099", mondayUitvoerderItemId: "999002", actief: true };

    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training A" })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "item", groupTitle: "Montessori Gorinchem", masterId: "700" }]));
    const resultaatA = await bepaalScholenVoorTrainer(TRAINER);
    expect(resultaatA.bevestigd[0]!.aantalOpen).toBe(1);

    mockScholenPagina
      .mockReset()
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "600", naam: "CBS de Wereld" })] })
      .mockResolvedValueOnce({ cursor: null, items: [] }); // TRAINER_B se eigen trainerboard levert geen enkele training op
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));
    const resultaatB = await bepaalScholenVoorTrainer(TRAINER_B);
    // Trainer B heeft hier geen enkele bevestigde school (geen trainer-
    // relatie, geen trainerboard-items) — het punt is dat trainer A se
    // training (700, aan school 500) nergens in trainer B se context lekt.
    expect(resultaatB.bevestigd).toEqual([]);
  });

  it("test 2: een harde Connect Boards-relatie (School niet leeg) wint altijd — de legacy-naammatch wordt dan zelfs niet geprobeerd", async () => {
    // Zelfde groupTitle als hierboven zou OOK een unieke naammatch opleveren
    // als de code daar was aanbeland — maar schoolIds is hier niet leeg, dus
    // de training-koppeling-tak hierboven vangt dit af en 'continue't vóór
    // de naammatch-code ooit bereikt wordt. Bevestigt bron="training-
    // koppeling" (tier 1), nooit "legacy-unique".
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training met harde koppeling", schoolIds: ["500"] })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "item", groupTitle: "Montessori Gorinchem", masterId: "700" }]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]).toMatchObject({ id: "500", bron: "training-koppeling" });
  });

  it("test 3: geen naam-match (0 kandidaten) -> onbevestigd, blijft ook geen suggestie", async () => {
    mockScholenPagina.mockResolvedValueOnce({ cursor: null, items: [] }).mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training" })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "item", groupTitle: "Onbekende School", masterId: "700" }]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);
    expect(resultaat.bevestigd).toEqual([]);
    expect(resultaat.mogelijkGekoppeld).toEqual([]);
  });

  it("test 4: twee Master Data-scholen met dezelfde genormaliseerde naam -> onbevestigd, nooit gekozen (ambiguïteit)", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({
        cursor: null,
        items: [masterDataItem({ id: "500", naam: "De Regenboog" }), masterDataItem({ id: "501", naam: "De Regenboog" })],
      })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training" })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "item", groupTitle: "De Regenboog", masterId: "700" }]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);
    expect(resultaat.bevestigd).toEqual([]);
    expect(resultaat.mogelijkGekoppeld).toEqual([]);
  });

  it("test 5: kleine case-/witruimteverschillen tussen groupTitle en Master Data-naam -> unieke match blijft toegestaan", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training" })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "item", groupTitle: "  montessori   GORINCHEM  ", masterId: "700" }]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);
    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]).toMatchObject({ id: "500", bron: "legacy-unique" });
  });

  it("test 6: vergelijkbare maar niet identieke schoolnamen matchen NOOIT (geen fuzzy match)", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({
        cursor: null,
        items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem School" }), masterDataItem({ id: "501", naam: "Montessori Gorkum" })],
      })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training" })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "item", groupTitle: "Montessori Gorinchem", masterId: "700" }]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);
    expect(resultaat.bevestigd).toEqual([]);
    expect(resultaat.mogelijkGekoppeld).toEqual([]);
  });

  it("een reeds tier-1-bevestigde school (Master Data.Trainer-relatie) wordt niet nogmaals via legacy-groepsnaam herbevestigd/overschreven", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training" })] }); // geen schoolIds
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "item", groupTitle: "Montessori Gorinchem", masterId: "700" }]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);
    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.bevestigd[0]).toMatchObject({ id: "500", bron: "trainer-relatie" });
    expect(resultaat.mogelijkGekoppeld).toEqual([]);
  });

  it("test 7 (cross-trainer): de legacy-groepsnaammatch lekt geen scholen tussen trainers", async () => {
    const TRAINER_B: AuthTrainer = { id: 2, name: "Andere Trainer", email: "andere@mijnleerlijn.nl", mondayTrainerboardId: "18424768099", mondayUitvoerderItemId: "999002", actief: true };

    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training A" })] }); // schoolIds leeg
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "item", groupTitle: "Montessori Gorinchem", masterId: "700" }]));
    const resultaatA = await bepaalScholenVoorTrainer(TRAINER);
    expect(resultaatA.bevestigd.map((s) => ({ id: s.id, bron: s.bron }))).toEqual([{ id: "500", bron: "legacy-unique" }]);

    mockScholenPagina
      .mockReset()
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "600", naam: "CBS de Wereld" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "701", naam: "Training B" })] }); // schoolIds leeg
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "801", name: "item", groupTitle: "CBS de Wereld", masterId: "701" }]));
    const resultaatB = await bepaalScholenVoorTrainer(TRAINER_B);
    expect(resultaatB.bevestigd.map((s) => ({ id: s.id, bron: s.bron }))).toEqual([{ id: "600", bron: "legacy-unique" }]);

    expect(resultaatA.bevestigd.some((s) => s.id === "600")).toBe(false);
    expect(resultaatB.bevestigd.some((s) => s.id === "500")).toBe(false);
  });

  it("een hangende/ongeldige Master ID op het trainerboard (geen bijbehorende centrale training) crasht niet en levert geen suggestie op", async () => {
    mockScholenPagina.mockResolvedValueOnce({ cursor: null, items: [] }).mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "item", groupTitle: "Iets", masterId: "onbestaand-999" }]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);
    expect(resultaat.bevestigd).toEqual([]);
    expect(resultaat.mogelijkGekoppeld).toEqual([]);
  });

  it("telt Open/Gepland/Gedaan correct en bepaalt de eerstvolgende geplande training", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          uitvoeringItem({ id: "1", naam: "Training open", schoolIds: ["500"] }),
          uitvoeringItem({ id: "2", naam: "Training later gepland", schoolIds: ["500"], datum: "2026-09-10" }),
          uitvoeringItem({ id: "3", naam: "Training eerder gepland", schoolIds: ["500"], datum: "2026-08-25" }),
          uitvoeringItem({ id: "4", naam: "Training gedaan", schoolIds: ["500"], status: "Gedaan" }),
        ],
      });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);
    const school = resultaat.bevestigd[0]!;
    expect(school.aantalOpen).toBe(1);
    expect(school.aantalGepland).toBe(2);
    expect(school.aantalGedaan).toBe(1);
    expect(school.eerstvolgendeTraining).toEqual({ datum: "2026-08-25", naam: "Training eerder gepland" });
  });
});

describe("trainerboardItemId (Ronde 2) — schrijfdoel-resolutie voor lib/trainers/writeback.ts", () => {
  it("tier 1 (training-koppeling): trainerboardItemId wordt onvoorwaardelijk gevuld, ook al bevestigt dit trainerboard-item de school niet zelf", async () => {
    // vóór Ronde 2 werd tbItem.id (het trainerboard-item-ID) nergens
    // bewaard — deze test bevestigt dat de nieuwe, onvoorwaardelijke
    // masterId->tbItem.id-Map ook voor een tier-1 (harde School-koppeling)
    // training het juiste trainerboard-item-ID oplevert, niet het centrale
    // training-ID en niet null.
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training", schoolIds: ["500"] })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "Trainerboard-item", groupTitle: "School", masterId: "700" }]));

    const detail = await haalSchoolDetail(TRAINER, "500");
    expect(detail!.trainingen.open[0]).toMatchObject({ id: "700", trainerboardItemId: "800" });
  });

  it("tier 2 (legacy-unique): trainerboardItemId is het trainerboard-item dat de schoolnaammatch veroorzaakte", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "12713002919", naam: "Training" })] });
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([{ id: "12717612402", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "12713002919" }])
    );

    const detail = await haalSchoolDetail(TRAINER, "500");
    expect(detail!.trainingen.open[0]).toMatchObject({ id: "12713002919", trainerboardItemId: "12717612402" });
  });

  it("geen bijbehorend trainerboard-item (bv. hard bevestigd via Master Data.Trainer, maar deze training verscheen nooit op dit trainerboard) -> trainerboardItemId is null, geen crash", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training", schoolIds: ["500"] })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([])); // leeg trainerboard — geen enkel item

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
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "1", naam: "Zonder datum", schoolIds: ["500"] })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const data = await haalDashboardData(TRAINER);
    expect(data.trainingenVandaag).toEqual([]);
    expect(data.komendeTrainingen).toEqual([]);
  });

  it("sluit geannuleerde trainingen uit van vandaag/komend, ook met een datum", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "1", naam: "Geannuleerd", schoolIds: ["500"], datum: "2099-01-01", status: "Geannuleerd" })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const data = await haalDashboardData(TRAINER);
    expect(data.komendeTrainingen).toEqual([]);
  });

  it("sorteert komende trainingen chronologisch", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          uitvoeringItem({ id: "1", naam: "Laat", schoolIds: ["500"], datum: "2099-12-01" }),
          uitvoeringItem({ id: "2", naam: "Vroeg", schoolIds: ["500"], datum: "2099-01-01" }),
        ],
      });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const data = await haalDashboardData(TRAINER);
    expect(data.komendeTrainingen.map((t) => t.naam)).toEqual(["Vroeg", "Laat"]);
  });

  it("logboek-openstaand: verleden datum + logboek niet ingevuld", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          uitvoeringItem({ id: "1", naam: "Verleden, niet ingevuld", schoolIds: ["500"], datum: "2020-01-01", logboekIngevuld: false }),
          uitvoeringItem({ id: "2", naam: "Verleden, wél ingevuld", schoolIds: ["500"], datum: "2020-01-02", logboekIngevuld: true }),
          uitvoeringItem({ id: "3", naam: "Toekomst, niet ingevuld", schoolIds: ["500"], datum: "2099-01-01", logboekIngevuld: false }),
        ],
      });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const data = await haalDashboardData(TRAINER);
    expect(data.logboekOpenstaand.map((t) => t.naam)).toEqual(["Verleden, niet ingevuld"]);
  });

  it("Ronde 2 (Beslissing 1, na review met Michel) — 'Verslag nog invullen' waarschuwt óók voor een training van VANDAAG (<=, niet <), ongeacht status: een training die nog op 'Gepland' staat omdat de trainer vergat 'm op Gedaan te zetten mag niet verdwijnen", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          uitvoeringItem({ id: "1", naam: "Vandaag, nog Gepland, niet ingevuld", schoolIds: ["500"], datum: VANDAAG, logboekIngevuld: false }),
          uitvoeringItem({ id: "2", naam: "Vandaag, wél ingevuld", schoolIds: ["500"], datum: VANDAAG, logboekIngevuld: true }),
        ],
      });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const data = await haalDashboardData(TRAINER);
    expect(data.logboekOpenstaand.map((t) => t.naam)).toEqual(["Vandaag, nog Gepland, niet ingevuld"]);
  });

  it("Ronde 2 vervolg — 'Vandaag' en 'Verslag nog invullen' zijn nu wederzijds-exclusief: een training van vandaag met een niet-ingevuld logboek verschijnt uitsluitend onder 'Verslag nog invullen', niet ook onder 'Vandaag'", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          uitvoeringItem({ id: "1", naam: "Vandaag, niet ingevuld", schoolIds: ["500"], datum: VANDAAG, logboekIngevuld: false }),
          uitvoeringItem({ id: "2", naam: "Vandaag, wél ingevuld", schoolIds: ["500"], datum: VANDAAG, logboekIngevuld: true }),
        ],
      });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const data = await haalDashboardData(TRAINER);
    // "Vandaag, niet ingevuld" zit uitsluitend in logboekOpenstaand (al
    // gecontroleerd hierboven) — de kernwijziging hier is dat hij NIET ook
    // nog los in trainingenVandaag verschijnt, zoals vóór deze ronde wél
    // gebeurde (twee onafhankelijke filters die konden overlappen).
    expect(data.trainingenVandaag.map((t) => t.naam)).toEqual(["Vandaag, wél ingevuld"]);
    expect(data.logboekOpenstaand.map((t) => t.naam)).toEqual(["Vandaag, niet ingevuld"]);
  });

  it("aantalScholen komt overeen met het aantal bevestigde scholen", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({
        cursor: null,
        items: [masterDataItem({ id: "500", naam: "A", trainerLinkedIds: [999001] }), masterDataItem({ id: "501", naam: "B", trainerLinkedIds: [999001] })],
      })
      .mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const data = await haalDashboardData(TRAINER);
    expect(data.aantalScholen).toBe(2);
    void VANDAAG;
  });

  it("Ronde 2 afronding, Trainer-AI — bevestigdeScholen bevat uitsluitend id/naam van déze trainer, alfabetisch (nl) gesorteerd, afgeleid uit dezelfde context (geen extra mockScholenPagina-aanroep t.o.v. een gewone haalDashboardData-call)", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          masterDataItem({ id: "501", naam: "Zilverschool", trainerLinkedIds: [999001] }),
          masterDataItem({ id: "500", naam: "Achterhoekschool", trainerLinkedIds: [999001] }),
        ],
      })
      .mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const data = await haalDashboardData(TRAINER);

    expect(data.bevestigdeScholen).toEqual([
      { id: "500", naam: "Achterhoekschool" },
      { id: "501", naam: "Zilverschool" },
    ]);
    // Zelfde 2 aanroepen (Master Data + Uitvoering) als elke andere test in
    // dit blok — bevestigdeScholen wordt puur in-memory afgeleid van
    // context.scholen, geen bepaalScholenVoorTrainer()/verzamelTrainerContext
    // -herhaling.
    expect(mockScholenPagina).toHaveBeenCalledTimes(2);
  });

  it("cross-trainer: bevestigdeScholen (dashboard 'Alle scholen') bevat nooit de school van een andere trainer, ook niet als die school in dezelfde Master Data-pagina meekomt", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          masterDataItem({ id: "500", naam: "Eigen school", trainerLinkedIds: [999001] }), // TRAINER.mondayUitvoerderItemId
          masterDataItem({ id: "600", naam: "School van andere trainer", trainerLinkedIds: [999002] }), // een ANDERE trainer se relatie
        ],
      })
      .mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const data = await haalDashboardData(TRAINER);

    expect(data.bevestigdeScholen).toEqual([{ id: "500", naam: "Eigen school" }]);
    expect(data.bevestigdeScholen.map((s) => s.naam)).not.toContain("School van andere trainer");
  });
});

describe("haalSchoolDetail — object-level autorisatie", () => {
  it("geeft null terug voor een school-ID dat niet bij deze trainer hoort — geen data, geen 403 die het bestaan verklapt", async () => {
    mockScholenPagina.mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Eigen school", trainerLinkedIds: [999001] })] }).mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const detail = await haalSchoolDetail(TRAINER, "999-van-andere-trainer");

    expect(detail).toBeNull();
    expect(mockUpdatesVoorItem).not.toHaveBeenCalled();
  });

  it("geeft volledig detail terug voor een eigen school, met trainingen verdeeld over de weergavebuckets (training-weergave.ts) en het schoollogboek", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Eigen school", trainerLinkedIds: [999001], hoofdcontactpersoon: "Jeroen Bakker" })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          uitvoeringItem({ id: "1", naam: "Open", schoolIds: ["500"] }),
          uitvoeringItem({ id: "2", naam: "Komend", schoolIds: ["500"], datum: "2099-01-01" }),
          uitvoeringItem({ id: "3", naam: "Gedaan", schoolIds: ["500"], status: "Gedaan" }),
          uitvoeringItem({ id: "4", naam: "Geannuleerd", schoolIds: ["500"], status: "Geannuleerd" }),
        ],
      });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));
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
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Eigen school", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          uitvoeringItem({ id: "1", naam: "Training", schoolIds: ["500"] }),
          uitvoeringItem({ id: "2", naam: "Bijeenkomst | dagdeel", schoolIds: ["500"] }),
          uitvoeringItem({ id: "3", naam: "Online spreekuur", schoolIds: ["500"] }),
          uitvoeringItem({ id: "4", naam: "Online beheerderstraining", schoolIds: ["500"] }),
        ],
      });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));
    mockUpdatesVoorItem.mockResolvedValue([]);

    const detail = await haalSchoolDetail(TRAINER, "500");

    // Alle vier hebben geen datum/status -> allemaal in de "open"-sectie.
    expect(detail!.trainingen.open.map((t) => t.naam)).toEqual([
      "Bijeenkomst | dagdeel",
      "Online beheerderstraining",
      "Online spreekuur",
      "Training",
    ]);
  });

  it("contactpersoonBetrouwbaar is true wanneer de contactpersoon-kolom een echte board_relation-koppeling heeft (.value), niet alleen gecachte tekst", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({
        cursor: null,
        items: [masterDataItem({ id: "500", naam: "Eigen school", trainerLinkedIds: [999001], hoofdcontactpersoon: "Jeroen Bakker", hoofdcontactpersoonLinkedId: 12345 })],
      })
      .mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));
    mockUpdatesVoorItem.mockResolvedValue([]);

    const detail = await haalSchoolDetail(TRAINER, "500");

    expect(detail!.contactpersoonNaam).toBe("Jeroen Bakker");
    expect(detail!.contactpersoonBetrouwbaar).toBe(true);
  });

  it("contactpersoonBetrouwbaar is false wanneer de contactpersoon-kolom uitsluitend gecachte tekst heeft, geen echte .value-relatie", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({
        cursor: null,
        items: [masterDataItem({ id: "500", naam: "Eigen school", trainerLinkedIds: [999001], hoofdcontactpersoon: "Verouderde naam" })],
      })
      .mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));
    mockUpdatesVoorItem.mockResolvedValue([]);

    const detail = await haalSchoolDetail(TRAINER, "500");

    // contactpersoonNaam blijft ongewijzigd zichtbaar (bestaand gedrag, elders
    // niet aangepast) — uitsluitend het NIEUWE betrouwbaarheidssignaal is
    // false, dat is wat de nieuwe Trainer-AI-context moet respecteren.
    expect(detail!.contactpersoonNaam).toBe("Verouderde naam");
    expect(detail!.contactpersoonBetrouwbaar).toBe(false);
  });
});

describe("Ronde 2 vervolg — geen verborgen Monday-write tijdens een pageview (GET/alleen-lezen)", () => {
  // Expliciete opdrachtseis: "Ik wil hierbij géén verborgen Monday-write
  // tijdens het alleen bekijken van een pagina." haalDashboardData/
  // haalSchoolDetail/bepaalScholenVoorTrainer voeden uitsluitend Server
  // Component-pagina's (GET-achtig, geen enkele Server Action/mutatie-
  // trigger) — dit bewijst het ook op functieniveau, niet alleen doordat
  // deze module wijzigKolomWaarde/haalItemMetKolomWaarden nooit importeert.
  it("haalDashboardData roept nooit een Monday-schrijffunctie aan", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "1", naam: "Training", schoolIds: ["500"], datum: "2026-09-01" })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    await haalDashboardData(TRAINER);

    expect(mockWijzigKolomWaarde).not.toHaveBeenCalled();
    expect(mockHaalItemMetKolomWaarden).not.toHaveBeenCalled();
  });

  it("haalSchoolDetail roept nooit een Monday-schrijffunctie aan", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "1", naam: "Training", schoolIds: ["500"] })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));
    mockUpdatesVoorItem.mockResolvedValue([]);

    await haalSchoolDetail(TRAINER, "500");

    expect(mockWijzigKolomWaarde).not.toHaveBeenCalled();
    expect(mockHaalItemMetKolomWaarden).not.toHaveBeenCalled();
  });

  it("bepaalScholenVoorTrainer roept nooit een Monday-schrijffunctie aan", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    await bepaalScholenVoorTrainer(TRAINER);

    expect(mockWijzigKolomWaarde).not.toHaveBeenCalled();
    expect(mockHaalItemMetKolomWaarden).not.toHaveBeenCalled();
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
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "1", naam: "Training vandaag", schoolIds: ["500"], datum: VANDAAG })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "2001", name: "Training vandaag", masterId: "1" }]));

    const trainingen = await haalRecenteTrainingenVoorTelefonie(TRAINER);
    expect(trainingen).toHaveLength(1);
    expect(trainingen[0]!.trainerboardItemId).toBe("2001");
    expect(trainingen[0]!.schoolId).toBe("500");
    expect(trainingen[0]!.schoolNaam).toBe("School");
  });

  it("sluit een training zonder gekoppeld trainerboard-item uit — telefonisch nooit een niet-bewerkbare training aanbieden", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "1", naam: "Training", schoolIds: ["500"], datum: VANDAAG })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([])); // geen matchend masterId

    expect(await haalRecenteTrainingenVoorTelefonie(TRAINER)).toEqual([]);
  });

  it("sluit een geannuleerde training uit, ook al valt de datum binnen het venster", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "1", naam: "Geannuleerd", schoolIds: ["500"], datum: VANDAAG, status: "Geannuleerd" })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "2001", name: "x", masterId: "1" }]));

    expect(await haalRecenteTrainingenVoorTelefonie(TRAINER)).toEqual([]);
  });

  it("sluit een training zonder datum uit", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "1", naam: "Zonder datum", schoolIds: ["500"] })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "2001", name: "x", masterId: "1" }]));

    expect(await haalRecenteTrainingenVoorTelefonie(TRAINER)).toEqual([]);
  });

  it("sluit een training buiten het recente venster uit (>3 dagen geleden) én een toekomstige training (spec §5: 'begin klein, recente trainingen rond vandaag')", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          uitvoeringItem({ id: "1", naam: "4 dagen geleden", schoolIds: ["500"], datum: dagenGeleden(4) }),
          uitvoeringItem({ id: "2", naam: "Morgen", schoolIds: ["500"], datum: dagenGeleden(-1) }),
        ],
      });
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([
        { id: "2001", name: "x", masterId: "1" },
        { id: "2002", name: "y", masterId: "2" },
      ])
    );

    expect(await haalRecenteTrainingenVoorTelefonie(TRAINER)).toEqual([]);
  });

  it("neemt trainingen tot en met 3 dagen geleden mee, gesorteerd meest-recent-eerst", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "School", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          uitvoeringItem({ id: "1", naam: "3 dagen geleden", schoolIds: ["500"], datum: dagenGeleden(3) }),
          uitvoeringItem({ id: "2", naam: "Vandaag", schoolIds: ["500"], datum: VANDAAG }),
          uitvoeringItem({ id: "3", naam: "Gisteren", schoolIds: ["500"], datum: dagenGeleden(1) }),
        ],
      });
    mockQuery.mockResolvedValue(
      trainerboardBoardsResponse([
        { id: "2001", name: "x", masterId: "1" },
        { id: "2002", name: "y", masterId: "2" },
        { id: "2003", name: "z", masterId: "3" },
      ])
    );

    const trainingen = await haalRecenteTrainingenVoorTelefonie(TRAINER);
    expect(trainingen.map((t) => t.naam)).toEqual(["Vandaag", "Gisteren", "3 dagen geleden"]);
  });

  // Scenario 7 uit de opdracht ("training van een andere trainer nooit
  // aangeboden") is op DIT niveau niet los te simuleren: trainerboardStructuur
  // wordt al opgehaald op trainer.mondayTrainerboardId (de eigen
  // trainerboard-query), dus "een andere trainer" betekent hier praktisch
  // "geen trainerboard-item" — al gedekt door de test hierboven. De
  // trainer-scoping zelf (Tier 1/Tier 1-vervolg) heeft al brede, bestaande
  // dekking elders in dit bestand (bepaalScholenVoorTrainer). Het end-to-end
  // scenario — trainer A krijgt telefonisch nooit trainer B se trainingen te
  // kiezen — wordt bewezen in lib/trainers/telefonie/gesprek.test.ts.
});
