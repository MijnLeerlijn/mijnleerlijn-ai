import { describe, it, expect, vi, beforeEach } from "vitest";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { haalAdminTrainersOverzicht } from "./overzicht";
import { haalTrainingenEnScholenVoorAlleTrainers, type AdminTrainerMondayOverzicht, type TrainingMetSchool } from "@/lib/trainers/monday-links";

// Traineromgeving V2, Fase 4 (2026-08-24) — spec §13/§18: "performance-tests
// die bewijzen dat niet per trainer opnieuw volledige Monday-boardfetches
// plaatsvinden" + "alle trainers zichtbaar, inactieve trainer correct
// gemarkeerd, gekoppelde scholen correct, to-do-telling correct, laatste
// activiteit correct, trainerisolatie in detaildata." haalTrainingenEnScholen
// VoorAlleTrainers zelf is al apart getest (monday-links.test.ts, inclusief
// zijn EIGEN performance-garantie — vaste 2 Monday-aanroepen ongeacht
// trainerAantal); hier wordt uitsluitend bewezen dat overzicht.ts die functie
// hooguit ÉÉN keer per paginalading aanroept, ongeacht het aantal trainers in
// Payload.

vi.mock("@/lib/trainers/monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/monday-links")>();
  return { ...echt, haalTrainingenEnScholenVoorAlleTrainers: vi.fn() };
});

const mockMondayOverzicht = vi.mocked(haalTrainingenEnScholenVoorAlleTrainers);

function training(overrides: Partial<TrainingMetSchool> = {}): TrainingMetSchool {
  return {
    id: "training-1",
    naam: "Training 1",
    status: "gepland",
    ruweStatusTekst: "Gepland",
    datum: "2026-09-01",
    logboekIngevuld: false,
    trainerboardItemId: "tb-1",
    bron: "mijnleerlijn",
    schoolId: "school-1",
    schoolNaam: "School Een",
    ...overrides,
  };
}

beforeEach(() => {
  mockMondayOverzicht.mockReset();
  mockMondayOverzicht.mockResolvedValue({ trainingenPerTrainer: new Map(), scholenPerTrainer: new Map(), scholen: new Map(), trainingenPerSchool: new Map() });
});

const trainerAccount = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Anne Trainer",
  email: "anne@mijnleerlijn.test",
  actief: true,
  mondayUitvoerderItemId: "uitv-1",
  mondayTrainerboardId: "board-1",
  telefonieActief: false,
  ...overrides,
});

describe("haalAdminTrainersOverzicht — performance", () => {
  it("roept haalTrainingenEnScholenVoorAlleTrainers precies ÉÉN keer aan, ongeacht het aantal trainers", async () => {
    const trainers = Array.from({ length: 25 }, (_, i) => trainerAccount({ id: i + 1, name: `Trainer ${i + 1}`, mondayUitvoerderItemId: `uitv-${i + 1}` }));
    const { payload } = maakFakePayload({ "trainer-accounts": trainers });

    await haalAdminTrainersOverzicht(payload);

    expect(mockMondayOverzicht).toHaveBeenCalledTimes(1);
  });
});

describe("haalAdminTrainersOverzicht — dashboardtotalen en trainerkaarten", () => {
  it("toont alle trainers, markeert een inactieve trainer correct", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [trainerAccount({ id: 1, name: "Actieve Trainer", actief: true }), trainerAccount({ id: 2, name: "Inactieve Trainer", actief: false, mondayUitvoerderItemId: "uitv-2" })],
    });
    const overzicht = await haalAdminTrainersOverzicht(payload);
    expect(overzicht.trainers).toHaveLength(2);
    expect(overzicht.trainers.find((t) => t.trainerId === 1)?.actief).toBe(true);
    expect(overzicht.trainers.find((t) => t.trainerId === 2)?.actief).toBe(false);
    expect(overzicht.totalen.actieveTrainers).toBe(1);
  });

  it("telt gekoppelde scholen per trainer correct, via de Monday-aggregaat", async () => {
    mockMondayOverzicht.mockResolvedValue({
      trainingenPerTrainer: new Map(),
      scholenPerTrainer: new Map([["uitv-1", [{ id: "s1", naam: "School A" }, { id: "s2", naam: "School B" }]]]),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    });
    const { payload } = maakFakePayload({ "trainer-accounts": [trainerAccount({ id: 1 })] });
    const overzicht = await haalAdminTrainersOverzicht(payload);
    expect(overzicht.trainers[0]?.aantalScholen).toBe(2);
  });

  it("telt trainingen deze maand uniek (een training met twee trainers telt maar één keer)", async () => {
    const dezeMaand = new Date().toISOString().slice(0, 7);
    mockMondayOverzicht.mockResolvedValue({
      trainingenPerTrainer: new Map([
        ["uitv-1", [training({ id: "gedeelde-training", datum: `${dezeMaand}-15` })]],
        ["uitv-2", [training({ id: "gedeelde-training", datum: `${dezeMaand}-15` })]],
      ]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    });
    const { payload } = maakFakePayload({ "trainer-accounts": [trainerAccount({ id: 1, mondayUitvoerderItemId: "uitv-1" }), trainerAccount({ id: 2, mondayUitvoerderItemId: "uitv-2" })] });
    const overzicht = await haalAdminTrainersOverzicht(payload);
    expect(overzicht.totalen.trainingenDezeMaand).toBe(1);
  });

  it("open-verslagen-totaal en open-to-do's-totaal komen overeen met de som van de per-trainerkaarten se to-do-telling", async () => {
    // Correctieronde Admin Traineromgeving (2026-08-25) — het openVerslag
    // telt alleen mee als To do wanneer de training ook echt in de (mock-)
    // Monday-trainingenset van trainer 1 voorkomt (training-actualiteit.ts).
    mockMondayOverzicht.mockResolvedValue({
      trainingenPerTrainer: new Map([["uitv-1", [training({ id: "t1" })]]]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    });
    const { payload } = maakFakePayload({
      "trainer-accounts": [trainerAccount({ id: 1 })],
      "training-verslagen": [{ id: 1, trainer: 1, mondayTrainingId: "t1", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "T1", status: "concept", bron: "telefoon", updatedAt: "2026-08-20T00:00:00.000Z", telefonieOproep: null }],
    });
    const overzicht = await haalAdminTrainersOverzicht(payload);
    expect(overzicht.totalen.openVerslagen).toBe(1);
    expect(overzicht.totalen.openTodos).toBe(1);
    expect(overzicht.trainers[0]?.aantalOpenVerslagen).toBe(1);
    expect(overzicht.trainers[0]?.aantalOpenTodos).toBe(1);
  });

  it("laatste activiteit is de meest recente van logboek/verslag-activiteit (ongeacht status)", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [trainerAccount({ id: 1 })],
      "training-verslagen": [{ id: 1, trainer: 1, mondayTrainingId: "t1", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "T1", status: "voltooid", bron: "portal", updatedAt: "2026-08-10T00:00:00.000Z" }],
      "trainer-logboek-items": [{ id: 1, trainer: 1, mondaySchoolId: "s1", schoolNaam: "School A", type: "notitie", occurredAt: "2026-08-22T00:00:00.000Z", tekst: "recentste", mondayTrainingId: null, trainingNaam: null, createdAt: "2026-08-22T00:00:00.000Z" }],
    });
    const overzicht = await haalAdminTrainersOverzicht(payload);
    expect(overzicht.trainers[0]?.laatsteActiviteit).toBe("2026-08-22T00:00:00.000Z");
  });

  it("laatste activiteit is null als er nog geen enkele activiteit is", async () => {
    const { payload } = maakFakePayload({ "trainer-accounts": [trainerAccount({ id: 1 })] });
    const overzicht = await haalAdminTrainersOverzicht(payload);
    expect(overzicht.trainers[0]?.laatsteActiviteit).toBeNull();
  });

  it("trainerisolatie: de kaart van trainer A bevat nooit tellingen van trainer B", async () => {
    mockMondayOverzicht.mockResolvedValue({
      trainingenPerTrainer: new Map([["uitv-2", [training({ id: "training-van-b" })]]]),
      scholenPerTrainer: new Map([["uitv-2", [{ id: "s2", naam: "School van B" }]]]),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    });
    const { payload } = maakFakePayload({
      "trainer-accounts": [trainerAccount({ id: 1, name: "Trainer A", mondayUitvoerderItemId: "uitv-1" }), trainerAccount({ id: 2, name: "Trainer B", mondayUitvoerderItemId: "uitv-2" })],
      "training-verslagen": [{ id: 1, trainer: 2, mondayTrainingId: "t-van-b", mondaySchoolId: "s2", schoolNaam: "School van B", trainingNaam: "T van B", status: "concept", bron: "portal", updatedAt: "2026-08-20T00:00:00.000Z" }],
    });
    const overzicht = await haalAdminTrainersOverzicht(payload);
    const kaartA = overzicht.trainers.find((t) => t.trainerId === 1);
    const kaartB = overzicht.trainers.find((t) => t.trainerId === 2);
    expect(kaartA).toMatchObject({ aantalScholen: 0, aantalKomendeTrainingen: 0, aantalOpenTodos: 0, aantalOpenVerslagen: 0 });
    expect(kaartB).toMatchObject({ aantalScholen: 1, aantalOpenVerslagen: 1 });
  });
});
