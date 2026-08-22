import { describe, it, expect, vi, beforeEach } from "vitest";
import { maakLogboekItem, haalLogboekVoorTrainer } from "./logboek";
import { haalSchoolDetail, haalTrainingVoorMutatie } from "./monday-links";
import { haalUpdatesVoorItem, maakUpdate, wijzigKolomWaarde, wijzigKolomWaardeJson } from "@/lib/sales/monday-client";
import { maakFakePayload } from "@/lib/support/fake-payload";
import type { AuthTrainer } from "./auth";
import type { SchoolDetail, TrainingVoorMutatie } from "./monday-links";

// Traineromgeving V2, Fase 1 (2026-08-28) — dekt lib/trainers/logboek.ts.
// Zelfde gescheiden-lagen-aanpak als verslag.test.ts: mockt ./monday-links
// (haalSchoolDetail/haalTrainingVoorMutatie) op modulevlak, test hier
// uitsluitend de ORCHESTRATIE (eigendomscontrole/opslaan/lezen), niet de
// resolutieladder zelf (die heeft al eigen dekking in monday-links.test.ts).
vi.mock("./monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./monday-links")>();
  return { ...echt, haalSchoolDetail: vi.fn(), haalTrainingVoorMutatie: vi.fn() };
});
// Opdrachtseis "handmatig item triggert geen verslag/Monday-flow" — deze
// module gemockt zodat een eventuele (onbedoelde) aanroep hard zichtbaar
// wordt via toHaveBeenCalledTimes(0), i.p.v. stilzwijgend te slagen omdat
// lib/trainers/logboek.ts deze functies toch al niet importeert.
vi.mock("@/lib/sales/monday-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sales/monday-client")>();
  return { ...echt, haalUpdatesVoorItem: vi.fn(), maakUpdate: vi.fn(), wijzigKolomWaarde: vi.fn(), wijzigKolomWaardeJson: vi.fn() };
});

const mockHaalSchoolDetail = vi.mocked(haalSchoolDetail);
const mockHaalTrainingVoorMutatie = vi.mocked(haalTrainingVoorMutatie);
const mockHaalUpdatesVoorItem = vi.mocked(haalUpdatesVoorItem);
const mockMaakUpdate = vi.mocked(maakUpdate);
const mockWijzigKolomWaarde = vi.mocked(wijzigKolomWaarde);
const mockWijzigKolomWaardeJson = vi.mocked(wijzigKolomWaardeJson);

const TRAINER_A: AuthTrainer = { id: 1, name: "Wessel Kok", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };
const TRAINER_B: AuthTrainer = { ...TRAINER_A, id: 2, name: "Andere Trainer" };

const SCHOOL_ID = "500";
const TRAINING_ID = "12713002919";

function schoolDetail(overrides: Partial<SchoolDetail> = {}): SchoolDetail {
  return {
    id: SCHOOL_ID,
    naam: "School A",
    onderwijstype: null,
    locatie: null,
    implementatiefase: null,
    contactpersoonNaam: null,
    contactpersoonBetrouwbaar: false,
    bron: "trainer-relatie",
    trainingen: { verslag_nog_invullen: [], vandaag: [], komend: [], open: [], gedaan: [], geannuleerd: [] },
    logboek: [],
    ...overrides,
  };
}

function trainingVoorMutatie(overrides: Partial<TrainingVoorMutatie> = {}): TrainingVoorMutatie {
  return {
    training: { id: TRAINING_ID, naam: "Training A", status: "gepland", ruweStatusTekst: "Gepland", datum: "2026-08-24", logboekIngevuld: false, trainerboardItemId: "8001" },
    schoolId: SCHOOL_ID,
    schoolNaam: "School A",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHaalSchoolDetail.mockResolvedValue(schoolDetail());
  mockHaalTrainingVoorMutatie.mockResolvedValue(trainingVoorMutatie());
});

describe("maakLogboekItem", () => {
  it("trainer kan een eigen logboekitem maken", async () => {
    const { payload, collection } = maakFakePayload({});
    const uitkomst = await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: SCHOOL_ID, type: "telefonisch", occurredAt: "2026-08-28T10:00:00.000Z", tekst: "Gebeld over de planning." });

    expect(uitkomst.soort).toBe("ok");
    if (uitkomst.soort !== "ok") return;
    expect(uitkomst.item.mondaySchoolId).toBe(SCHOOL_ID);
    expect(uitkomst.item.schoolNaam).toBe("School A"); // snapshot van haalSchoolDetail
    expect(uitkomst.item.type).toBe("telefonisch");
    expect(uitkomst.item.tekst).toBe("Gebeld over de planning.");
  });

  it("het item wordt ALTIJD gekoppeld aan de daadwerkelijk ingelogde trainer — er bestaat geen parameter om namens een andere trainer te schrijven", async () => {
    const { payload, collection } = maakFakePayload({});
    await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: SCHOOL_ID, type: "notitie", occurredAt: "2026-08-28T10:00:00.000Z", tekst: "Van trainer A." });
    await maakLogboekItem(payload, TRAINER_B, { mondaySchoolId: SCHOOL_ID, type: "notitie", occurredAt: "2026-08-28T10:00:00.000Z", tekst: "Van trainer B." });

    const vanA = collection("trainer-logboek-items").filter((d) => d.tekst === "Van trainer A.");
    const vanB = collection("trainer-logboek-items").filter((d) => d.tekst === "Van trainer B.");
    expect(vanA).toHaveLength(1);
    expect(vanA[0]!.trainer).toBe(TRAINER_A.id);
    expect(vanB).toHaveLength(1);
    expect(vanB[0]!.trainer).toBe(TRAINER_B.id);
  });

  it("een school die niet bij deze trainer hoort (haalSchoolDetail geeft null) -> niet_gevonden, geen rij aangemaakt", async () => {
    mockHaalSchoolDetail.mockResolvedValue(null);
    const { payload, collection } = maakFakePayload({});
    const uitkomst = await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: "999", type: "notitie", occurredAt: "2026-08-28T10:00:00.000Z", tekst: "Poging." });

    expect(uitkomst.soort).toBe("niet_gevonden");
    expect(collection("trainer-logboek-items")).toHaveLength(0);
  });

  it("een opgegeven training die niet bij deze trainer hoort (haalTrainingVoorMutatie geeft null) -> niet_gevonden", async () => {
    mockHaalTrainingVoorMutatie.mockResolvedValue(null);
    const { payload, collection } = maakFakePayload({});
    const uitkomst = await maakLogboekItem(payload, TRAINER_A, {
      mondaySchoolId: SCHOOL_ID,
      type: "overleg",
      occurredAt: "2026-08-28T10:00:00.000Z",
      tekst: "Over een training.",
      mondayTrainingId: TRAINING_ID,
    });
    expect(uitkomst.soort).toBe("niet_gevonden");
  });

  it("een training die bij een ANDERE school hoort dan de opgegeven mondaySchoolId -> niet_gevonden (voorkomt een inconsistente koppeling)", async () => {
    mockHaalTrainingVoorMutatie.mockResolvedValue(trainingVoorMutatie({ schoolId: "andere-school" }));
    const { payload, collection } = maakFakePayload({});
    const uitkomst = await maakLogboekItem(payload, TRAINER_A, {
      mondaySchoolId: SCHOOL_ID,
      type: "overleg",
      occurredAt: "2026-08-28T10:00:00.000Z",
      tekst: "Over een training.",
      mondayTrainingId: TRAINING_ID,
    });
    expect(uitkomst.soort).toBe("niet_gevonden");
  });

  it("een geldige training-koppeling slaat mondayTrainingId + een naam-snapshot op", async () => {
    const { payload, collection } = maakFakePayload({});
    const uitkomst = await maakLogboekItem(payload, TRAINER_A, {
      mondaySchoolId: SCHOOL_ID,
      type: "overleg",
      occurredAt: "2026-08-28T10:00:00.000Z",
      tekst: "Over training A.",
      mondayTrainingId: TRAINING_ID,
    });
    expect(uitkomst.soort).toBe("ok");
    if (uitkomst.soort !== "ok") return;
    expect(uitkomst.item.mondayTrainingId).toBe(TRAINING_ID);
    expect(uitkomst.item.trainingNaam).toBe("Training A");
  });

  it("lege/whitespace-only notitie -> ongeldige_invoer", async () => {
    const { payload, collection } = maakFakePayload({});
    const uitkomst = await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: SCHOOL_ID, type: "notitie", occurredAt: "2026-08-28T10:00:00.000Z", tekst: "   " });
    expect(uitkomst.soort).toBe("ongeldige_invoer");
  });

  it("ongeldig type -> ongeldige_invoer", async () => {
    const { payload, collection } = maakFakePayload({});
    // @ts-expect-error opzettelijk een niet-bestaand type voor deze test
    const uitkomst = await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: SCHOOL_ID, type: "onbestaand", occurredAt: "2026-08-28T10:00:00.000Z", tekst: "Tekst." });
    expect(uitkomst.soort).toBe("ongeldige_invoer");
  });

  it("ongeldige datum -> ongeldige_invoer", async () => {
    const { payload, collection } = maakFakePayload({});
    const uitkomst = await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: SCHOOL_ID, type: "notitie", occurredAt: "geen-datum", tekst: "Tekst." });
    expect(uitkomst.soort).toBe("ongeldige_invoer");
  });

  it("een te lange notitie wordt begrensd, nooit hard geweigerd (autosave-achtig gedrag, geen verlies)", async () => {
    const { payload, collection } = maakFakePayload({});
    const langeTekst = "a".repeat(5000);
    const uitkomst = await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: SCHOOL_ID, type: "notitie", occurredAt: "2026-08-28T10:00:00.000Z", tekst: langeTekst });
    expect(uitkomst.soort).toBe("ok");
    if (uitkomst.soort !== "ok") return;
    expect(uitkomst.item.tekst.length).toBe(4000);
  });

  it("een handmatig logboekitem triggert NOOIT de trainingsverslag- of Monday-writebackflow", async () => {
    const { payload, collection } = maakFakePayload({});
    await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: SCHOOL_ID, type: "helpdesk", occurredAt: "2026-08-28T10:00:00.000Z", tekst: "Helpdeskvraag." });

    expect(collection("training-verslagen")).toHaveLength(0);
    expect(collection("trainer-telefonie-oproepen")).toHaveLength(0);
    expect(mockHaalUpdatesVoorItem).not.toHaveBeenCalled();
    expect(mockMaakUpdate).not.toHaveBeenCalled();
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalled();
    expect(mockWijzigKolomWaardeJson).not.toHaveBeenCalled();
  });
});

describe("haalLogboekVoorTrainer", () => {
  it("een trainer ziet uitsluitend eigen logboekitems, nooit die van een andere trainer", async () => {
    const { payload, collection } = maakFakePayload({});
    await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: SCHOOL_ID, type: "notitie", occurredAt: "2026-08-28T09:00:00.000Z", tekst: "Item van A — 1." });
    await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: SCHOOL_ID, type: "telefonisch", occurredAt: "2026-08-28T11:00:00.000Z", tekst: "Item van A — 2." });
    await maakLogboekItem(payload, TRAINER_B, { mondaySchoolId: SCHOOL_ID, type: "overleg", occurredAt: "2026-08-28T10:00:00.000Z", tekst: "Item van B." });

    const itemsVanA = await haalLogboekVoorTrainer(payload, TRAINER_A);
    expect(itemsVanA).toHaveLength(2);
    expect(itemsVanA.every((item) => item.tekst.includes("van A"))).toBe(true);

    const itemsVanB = await haalLogboekVoorTrainer(payload, TRAINER_B);
    expect(itemsVanB).toHaveLength(1);
    expect(itemsVanB[0]!.tekst).toBe("Item van B.");
  });

  it("sorteert nieuwste eerst op occurredAt (het moment van het contact, niet van vastleggen)", async () => {
    const { payload, collection } = maakFakePayload({});
    await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: SCHOOL_ID, type: "notitie", occurredAt: "2026-08-01T10:00:00.000Z", tekst: "Oudste." });
    await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: SCHOOL_ID, type: "notitie", occurredAt: "2026-08-28T10:00:00.000Z", tekst: "Nieuwste." });

    const items = await haalLogboekVoorTrainer(payload, TRAINER_A);
    expect(items[0]!.tekst).toBe("Nieuwste.");
    expect(items[1]!.tekst).toBe("Oudste.");
  });

  it("een lege lijst (geen items) wordt netjes afgehandeld — geen fout, gewoon een lege array", async () => {
    const { payload, collection } = maakFakePayload({});
    const items = await haalLogboekVoorTrainer(payload, TRAINER_A);
    expect(items).toEqual([]);
  });

  it("respecteert de opgegeven limiet", async () => {
    const { payload, collection } = maakFakePayload({});
    for (let i = 0; i < 5; i += 1) {
      await maakLogboekItem(payload, TRAINER_A, { mondaySchoolId: SCHOOL_ID, type: "notitie", occurredAt: `2026-08-2${i}T10:00:00.000Z`, tekst: `Item ${i}` });
    }
    const items = await haalLogboekVoorTrainer(payload, TRAINER_A, { limiet: 2 });
    expect(items).toHaveLength(2);
  });
});
