import { describe, it, expect, vi, beforeEach } from "vitest";
import { mondayQuery, haalScholenPagina, haalUpdatesVoorItem, haalItemMetKolomWaarden, haalItemsMetKolomWaarden, type MondaySchoolItem } from "@/lib/sales/monday-client";
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
//
// Root-cause-fix (2026-09-03) — herbouwd op de nieuwe basis (UO_SCHOLEN_KOLOM
// op het eigen item van de trainer op board 5), zie monday-links.ts se
// moduletoelichting. De laatste describe-block hieronder test een BEWUST
// STRENGERE garantie dan voorheen: de trainerboard-groepsnaam-fallback kon
// vóór deze fix op zichzelf (via een unieke naammatch) al toegang tot een
// school geven ("legacy-unique") — dat kan sinds de fix niet meer, de
// fallback koppelt uitsluitend trainingen aan een school die al via de
// Board-5-relatie bevestigd is.
vi.mock("@/lib/sales/monday-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sales/monday-client")>();
  return { ...echt, mondayQuery: vi.fn(), haalScholenPagina: vi.fn(), haalUpdatesVoorItem: vi.fn(), haalItemMetKolomWaarden: vi.fn(), haalItemsMetKolomWaarden: vi.fn() };
});

const mockQuery = vi.mocked(mondayQuery);
const mockScholenPagina = vi.mocked(haalScholenPagina);
const mockUpdatesVoorItem = vi.mocked(haalUpdatesVoorItem);
const mockHaalItemMetKolomWaarden = vi.mocked(haalItemMetKolomWaarden);
const mockHaalItemsMetKolomWaarden = vi.mocked(haalItemsMetKolomWaarden);

const UO_SCHOLEN_KOLOM_ID = "board_relation_mm4v62g5"; // UO_SCHOLEN_KOLOM

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

function masterDataItem(opts: { id: string; naam: string }): MondaySchoolItem {
  return {
    id: opts.id,
    name: opts.naam,
    updated_at: "2026-08-19T00:00:00.000Z",
    column_values: [
      { id: "board_relation_mm4v8fpm", text: null, value: null, linked_item_ids: [] },
      { id: "dropdown_mm4v9rvg", text: null, value: null },
      { id: "text_mm5r9kn2", text: null, value: null },
      { id: "color_mm5q790a", text: null, value: null },
    ],
  };
}

function uitvoeringItem(opts: { id: string; naam: string; schoolIds?: (string | number)[] }): MondaySchoolItem {
  return {
    id: opts.id,
    name: opts.naam,
    updated_at: "2026-08-19T00:00:00.000Z",
    column_values: [
      { id: "board_relation_mm5tyc40", text: null, value: null, linked_item_ids: opts.schoolIds ? opts.schoolIds.map(String) : [] },
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

/** Zelfde patroon als monday-links.test.ts se mockTrainerContext, hier met een expliciete trainer-parameter (dit bestand test bewust met TWEE trainers). */
function mockTrainerContext(
  trainer: AuthTrainer,
  opts: {
    schoolIds?: (string | number)[] | null;
    masterData?: MondaySchoolItem[];
    uitvoering?: MondaySchoolItem[];
    trainerboard?: Parameters<typeof trainerboardBoardsResponse>[0];
  }
) {
  mockHaalItemMetKolomWaarden.mockResolvedValueOnce(
    opts.schoolIds === null
      ? null
      : { id: trainer.mondayUitvoerderItemId, name: trainer.name, column_values: [{ id: UO_SCHOLEN_KOLOM_ID, text: null, value: null, linked_item_ids: (opts.schoolIds ?? []).map(String) }] }
  );
  mockHaalItemsMetKolomWaarden.mockResolvedValueOnce(opts.masterData ?? []);
  mockScholenPagina.mockResolvedValueOnce({ cursor: null, items: opts.uitvoering ?? [] });
  mockQuery.mockResolvedValue(trainerboardBoardsResponse(opts.trainerboard ?? []));
}

beforeEach(() => {
  mockQuery.mockReset();
  mockScholenPagina.mockReset();
  mockUpdatesVoorItem.mockReset();
  mockHaalItemMetKolomWaarden.mockReset();
  mockHaalItemsMetKolomWaarden.mockReset();
});

describe("Beveiliging — scholen-isolatie tussen trainers", () => {
  it("trainer A ziet uitsluitend eigen scholen; trainer B se school komt nergens in trainer A se lijst voor (en vice versa)", async () => {
    mockTrainerContext(TRAINER_A, { schoolIds: ["500"], masterData: [masterDataItem({ id: "500", naam: "School van A" })] });
    const resultaatA = await bepaalScholenVoorTrainer(TRAINER_A);
    expect(resultaatA.bevestigd.map((s) => s.id)).toEqual(["500"]);
    expect(resultaatA.bevestigd.some((s) => s.id === "501")).toBe(false);

    mockTrainerContext(TRAINER_B, { schoolIds: ["501"], masterData: [masterDataItem({ id: "501", naam: "School van B" })] });
    const resultaatB = await bepaalScholenVoorTrainer(TRAINER_B);
    expect(resultaatB.bevestigd.map((s) => s.id)).toEqual(["501"]);
    expect(resultaatB.bevestigd.some((s) => s.id === "500")).toBe(false);
  });

  it("trainer A kan het school-ID van trainer B niet openen via haalSchoolDetail, ook al bestaat dat ID écht (bij een andere trainer)", async () => {
    // Sterker dan voorheen: trainer A se Master-Data-batchfetch vraagt
    // uitsluitend de ID's uit de EIGEN Board-5-relatie op — school 501 wordt
    // hier dus niet eens opgehaald, laat staan getoond.
    mockTrainerContext(TRAINER_A, { schoolIds: ["500"], masterData: [masterDataItem({ id: "500", naam: "School van A" })] });

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

describe("Beveiliging — de trainerboard-groepsnaam-fallback kan nooit toegang tot een NIEUWE school geven (root-cause-fix 2026-09-03)", () => {
  it("een school die uitsluitend via een unieke trainerboard-groepsnaam-match zou worden gevonden (geen Board-5-relatie) is NIET bevestigd en NIET opvraagbaar via haalSchoolDetail", async () => {
    // Vóór de root-cause-fix kon een UNIEKE groepnaam-match (School-kolom
    // leeg op de centrale training) op zichzelf al een school aan de
    // bevestigde lijst toevoegen ("legacy-unique" — zie de git-historie van
    // dit bestand). Dat mag sinds de fix nooit meer: de fallback koppelt
    // uitsluitend trainingen aan een school die al via UO_SCHOLEN_KOLOM
    // (Board 5) bevestigd is. Zonder die relatie blijft de school
    // onbereikbaar, ook al is de naam-match op zichzelf ondubbelzinnig.
    // Geen masterData meegegeven: bij een lege Board-5-relatie vraagt
    // verzamelTrainerContext haalItemsMetKolomWaarden(ids: [], ...) op — in
    // het echte monday-client.ts-kortsluitpad levert dat altijd [] op, ook al
    // bestaat school "500" op zichzelf wél in Master Data.
    mockTrainerContext(TRAINER_A, {
      schoolIds: [], // GEEN Board-5-relatie
      uitvoering: [uitvoeringItem({ id: "700", naam: "Training zonder schoolkoppeling" })],
      trainerboard: [{ id: "800", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "700" }],
    });

    const scholen = await bepaalScholenVoorTrainer(TRAINER_A);
    expect(scholen.bevestigd).toEqual([]);
    expect(scholen.mogelijkGekoppeld).toEqual([]);

    mockTrainerContext(TRAINER_A, {
      schoolIds: [],
      uitvoering: [uitvoeringItem({ id: "700", naam: "Training zonder schoolkoppeling" })],
      trainerboard: [{ id: "800", name: "Trainerboard-item", groupTitle: "Montessori Gorinchem", masterId: "700" }],
    });
    const detail = await haalSchoolDetail(TRAINER_A, "500");
    expect(detail).toBeNull();
    expect(mockUpdatesVoorItem).not.toHaveBeenCalled();
  });

  it("een ambigue groepnaam-match (2+ Master Data-kandidaten) blijft ook wanneer de school WEL in de Board-5-relatie zit ongeresolved — de training wordt aan geen van beide gekoppeld, nooit gegokt", async () => {
    mockTrainerContext(TRAINER_A, {
      schoolIds: ["500", "501"],
      masterData: [masterDataItem({ id: "500", naam: "De Regenboog" }), masterDataItem({ id: "501", naam: "De Regenboog" })],
      uitvoering: [uitvoeringItem({ id: "700", naam: "Training zonder schoolkoppeling" })],
      trainerboard: [{ id: "800", name: "Trainerboard-item", groupTitle: "De Regenboog", masterId: "700" }],
    });

    const scholen = await bepaalScholenVoorTrainer(TRAINER_A);
    // Beide blijven zichtbaar — dat komt uitsluitend uit de Board-5-relatie
    // zelf, onafhankelijk van de naam-match-uitkomst.
    expect(scholen.bevestigd.map((s) => s.id).sort()).toEqual(["500", "501"]);
    // De ambigue training wordt aan GEEN van beide gekoppeld — nooit gokken.
    expect(scholen.bevestigd.find((s) => s.id === "500")!.aantalOpen).toBe(0);
    expect(scholen.bevestigd.find((s) => s.id === "501")!.aantalOpen).toBe(0);
  });
});
