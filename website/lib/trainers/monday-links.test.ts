import { describe, it, expect, vi, beforeEach } from "vitest";
import { mondayQuery, haalScholenPagina, haalUpdatesVoorItem } from "@/lib/sales/monday-client";
import {
  parseLinkedPulseIds,
  parseCheckboxIngevuld,
  parseMondayDatum,
  bepaalTrainingStatus,
  bepaalScholenVoorTrainer,
  haalDashboardData,
  haalSchoolDetail,
} from "./monday-links";
import type { AuthTrainer } from "./auth";

vi.mock("@/lib/sales/monday-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sales/monday-client")>();
  return { ...echt, mondayQuery: vi.fn(), haalScholenPagina: vi.fn(), haalUpdatesVoorItem: vi.fn() };
});

const mockQuery = vi.mocked(mondayQuery);
const mockScholenPagina = vi.mocked(haalScholenPagina);
const mockUpdatesVoorItem = vi.mocked(haalUpdatesVoorItem);

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
      { id: "board_relation_mm4v8fpm", text: opts.hoofdcontactpersoon ?? null, value: null },
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

  it("tier 3: School-kolom leeg op de centrale training — unieke groepnaam-suggestie, nooit autoritatief", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training zonder schoolkoppeling" })] }); // schoolIds leeg
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "700" }]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);

    expect(resultaat.bevestigd).toEqual([]);
    expect(resultaat.mogelijkGekoppeld).toEqual([{ suggestieNaam: "Montessori Gorinchem", mogelijkeSchoolId: "500", mogelijkeSchoolNaam: "Montessori Gorinchem" }]);
  });

  it("tier 3: bij méér dan één naam-kandidaat wordt NIETS gesuggereerd — nooit gokken bij ambiguïteit", async () => {
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

  it("tier 3: bij nul naam-kandidaten wordt niets gesuggereerd", async () => {
    mockScholenPagina.mockResolvedValueOnce({ cursor: null, items: [] }).mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training" })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "item", groupTitle: "Onbekende School", masterId: "700" }]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);
    expect(resultaat.mogelijkGekoppeld).toEqual([]);
  });

  it("een reeds tier-1-bevestigde school wordt niet nogmaals als tier-3-suggestie getoond", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem", trainerLinkedIds: [999001] })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training" })] }); // geen schoolIds
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "item", groupTitle: "Montessori Gorinchem", masterId: "700" }]));

    const resultaat = await bepaalScholenVoorTrainer(TRAINER);
    expect(resultaat.bevestigd).toHaveLength(1);
    expect(resultaat.mogelijkGekoppeld).toEqual([]);
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
});

describe("haalSchoolDetail — object-level autorisatie", () => {
  it("geeft null terug voor een school-ID dat niet bij deze trainer hoort — geen data, geen 403 die het bestaan verklapt", async () => {
    mockScholenPagina.mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Eigen school", trainerLinkedIds: [999001] })] }).mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const detail = await haalSchoolDetail(TRAINER, "999-van-andere-trainer");

    expect(detail).toBeNull();
    expect(mockUpdatesVoorItem).not.toHaveBeenCalled();
  });

  it("geeft volledig detail terug voor een eigen school, met trainingen verdeeld over de 4 statusbuckets en het schoollogboek", async () => {
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Eigen school", trainerLinkedIds: [999001], hoofdcontactpersoon: "Jeroen Bakker" })] })
      .mockResolvedValueOnce({
        cursor: null,
        items: [
          uitvoeringItem({ id: "1", naam: "Open", schoolIds: ["500"] }),
          uitvoeringItem({ id: "2", naam: "Gepland", schoolIds: ["500"], datum: "2099-01-01" }),
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
    expect(detail!.trainingen.gepland.map((t) => t.naam)).toEqual(["Gepland"]);
    expect(detail!.trainingen.gedaan.map((t) => t.naam)).toEqual(["Gedaan"]);
    expect(detail!.trainingen.geannuleerd.map((t) => t.naam)).toEqual(["Geannuleerd"]);
    expect(detail!.logboek).toHaveLength(1);
    expect(mockUpdatesVoorItem).toHaveBeenCalledWith("500", 30);
  });
});
