import { describe, it, expect, vi, beforeEach } from "vitest";
import { mondayQuery, haalScholenPagina, haalUpdatesVoorItem } from "@/lib/sales/monday-client";
import { bepaalScholenVoorTrainer, haalSchoolDetail } from "./monday-links";
import type { AuthTrainer } from "./auth";

// Traineromgeving V1, Ronde 1 (2026-08-19) — dedicated securitytests, apart
// van monday-links.test.ts se functionele dekking, om de opdracht se
// expliciete minimale testlijst (architectuurrapport §11) rechtstreeks en
// herkenbaar terug te laten komen: "trainer A ziet alleen eigen scholen",
// "trainer A kan URL van school van trainer B niet openen",
// "onbekende/ambigue schoolmapping lekt geen data". Zelfde mock-/builder-
// aanpak als monday-links.test.ts (bewust hier gedupliceerd i.p.v.
// geïmporteerd — elk testbestand in dit project is zelfstandig leesbaar).
vi.mock("@/lib/sales/monday-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sales/monday-client")>();
  return { ...echt, mondayQuery: vi.fn(), haalScholenPagina: vi.fn(), haalUpdatesVoorItem: vi.fn() };
});

const mockQuery = vi.mocked(mondayQuery);
const mockScholenPagina = vi.mocked(haalScholenPagina);
const mockUpdatesVoorItem = vi.mocked(haalUpdatesVoorItem);

const TRAINER_A: AuthTrainer = {
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

function uitvoeringItem(opts: { id: string; naam: string; schoolIds?: (string | number)[] }) {
  return {
    id: opts.id,
    name: opts.naam,
    updated_at: "2026-08-19T00:00:00.000Z",
    column_values: [
      { id: "board_relation_mm5tyc40", text: null, value: opts.schoolIds ? linkedPulseIdsValue(opts.schoolIds) : null },
      { id: "color_mm5tz3wk", text: null, value: null },
      { id: "date_mm5tnfvx", text: null, value: null },
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

beforeEach(() => {
  mockQuery.mockReset();
  mockScholenPagina.mockReset();
  mockUpdatesVoorItem.mockReset();
});

describe("Beveiliging — scholen-isolatie tussen trainers", () => {
  it("trainer A ziet uitsluitend eigen scholen; trainer B se school komt nergens in trainer A se lijst voor (en vice versa)", async () => {
    const masterData = {
      cursor: null,
      items: [
        masterDataItem({ id: "500", naam: "School van A", trainerLinkedIds: [999001] }),
        masterDataItem({ id: "501", naam: "School van B", trainerLinkedIds: [999002] }),
      ],
    };
    mockScholenPagina.mockResolvedValueOnce(masterData).mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    const resultaatA = await bepaalScholenVoorTrainer(TRAINER_A);
    expect(resultaatA.bevestigd.map((s) => s.id)).toEqual(["500"]);
    expect(resultaatA.bevestigd.some((s) => s.id === "501")).toBe(false);

    mockScholenPagina.mockReset();
    mockScholenPagina.mockResolvedValueOnce(masterData).mockResolvedValueOnce({ cursor: null, items: [] });
    const resultaatB = await bepaalScholenVoorTrainer(TRAINER_B);
    expect(resultaatB.bevestigd.map((s) => s.id)).toEqual(["501"]);
    expect(resultaatB.bevestigd.some((s) => s.id === "500")).toBe(false);
  });

  it("trainer A kan het school-ID van trainer B niet openen via haalSchoolDetail, ook al bestaat dat ID écht (bij een andere trainer)", async () => {
    const masterData = {
      cursor: null,
      items: [
        masterDataItem({ id: "500", naam: "School van A", trainerLinkedIds: [999001] }),
        masterDataItem({ id: "501", naam: "School van B", trainerLinkedIds: [999002] }),
      ],
    };
    mockScholenPagina.mockResolvedValueOnce(masterData).mockResolvedValueOnce({ cursor: null, items: [] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([]));

    // Trainer A vraagt het schooldossier op van "501" — bestaat, maar is van B.
    const detail = await haalSchoolDetail(TRAINER_A, "501");

    expect(detail).toBeNull();
    expect(mockUpdatesVoorItem).not.toHaveBeenCalled();
  });
});

// "Trainer A kan API-ID van trainer B niet gebruiken" (architectuurrapport §11
// se securitylijst): bepaalScholenVoorTrainer/haalDashboardData/haalSchoolDetail
// nemen allemaal een volledig AuthTrainer-object, server-side afgeleid uit het
// geverifieerde sessiecookie (lib/trainers/session.ts) — nooit een los,
// door de client op te geven trainer-ID. schoolId (haalSchoolDetail se tweede
// parameter) is de ENIGE client-bepaalde waarde in deze hele module, en dat
// is precies wat de twee tests hierboven afdekken. Geen aparte test nodig
// voor "geen trainer-ID-parameter bestaat" — dat is zichtbaar aan de
// functiehandtekeningen zelf, geen apart te testen gedrag.

describe("Beveiliging — onbevestigde (tier 3) schoolsuggesties lekken geen data", () => {
  it("een uitsluitend als tier-3-suggestie herkende school (nooit bevestigd) is NIET opvraagbaar via haalSchoolDetail", async () => {
    // Zelfde opzet als de "Montessori Gorinchem"-tier-3-test in
    // monday-links.test.ts: groepnaam op het trainerboard matcht een unieke
    // Master Data-school, maar de centrale training heeft geen School-relatie
    // — dus uitsluitend een read-only suggestie, nooit een bevestigde koppeling.
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training zonder schoolkoppeling" })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "700" }]));

    const scholen = await bepaalScholenVoorTrainer(TRAINER_A);
    expect(scholen.bevestigd).toEqual([]);
    expect(scholen.mogelijkGekoppeld[0]?.mogelijkeSchoolId).toBe("500");

    mockScholenPagina.mockReset();
    mockScholenPagina
      .mockResolvedValueOnce({ cursor: null, items: [masterDataItem({ id: "500", naam: "Montessori Gorinchem" })] })
      .mockResolvedValueOnce({ cursor: null, items: [uitvoeringItem({ id: "700", naam: "Training zonder schoolkoppeling" })] });
    mockQuery.mockResolvedValue(trainerboardBoardsResponse([{ id: "800", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "700" }]));

    const detail = await haalSchoolDetail(TRAINER_A, "500");
    expect(detail).toBeNull();
    expect(mockUpdatesVoorItem).not.toHaveBeenCalled();
  });
});
