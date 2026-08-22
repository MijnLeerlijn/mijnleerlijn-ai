import { describe, it, expect, vi, beforeEach } from "vitest";
import { haalDashboardV2Data } from "./dashboard";
import { haalDashboardData, type TrainerDashboardData, type TrainingMetSchool } from "./monday-links";
import { haalTelefonischeConceptenVoorTrainer, haalVerslagenDieAandachtNodigHebben, telVoltooideVerslagen, type TelefonischConcept, type VastgelopenVerslag } from "./verslag";
import { haalActiviteitVoorTrainer } from "./activiteit";
import type { Payload } from "payload";
import type { AuthTrainer } from "./auth";

// Traineromgeving V2, Fase 1 (2026-08-28) — dekt lib/trainers/dashboard.ts.
// Mockt alle onderliggende domeinlagen (monday-links.ts/verslag.ts/
// activiteit.ts) — dit bestand test uitsluitend de AGGREGATIE/COMPOSITIE
// (welke data waar terechtkomt, sortering van "Aandacht nodig", correcte
// doorgifte van de trainer), niet de dekking van elke leesfunctie zelf.
vi.mock("./monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./monday-links")>();
  return { ...echt, haalDashboardData: vi.fn() };
});
vi.mock("./verslag", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./verslag")>();
  return { ...echt, haalTelefonischeConceptenVoorTrainer: vi.fn(), haalVerslagenDieAandachtNodigHebben: vi.fn(), telVoltooideVerslagen: vi.fn() };
});
vi.mock("./activiteit", () => ({ haalActiviteitVoorTrainer: vi.fn() }));

const mockHaalDashboardData = vi.mocked(haalDashboardData);
const mockHaalTelefonischeConcepten = vi.mocked(haalTelefonischeConceptenVoorTrainer);
const mockHaalVerslagenDieAandachtNodigHebben = vi.mocked(haalVerslagenDieAandachtNodigHebben);
const mockTelVoltooideVerslagen = vi.mocked(telVoltooideVerslagen);
const mockHaalActiviteitVoorTrainer = vi.mocked(haalActiviteitVoorTrainer);

const TRAINER: AuthTrainer = { id: 1, name: "Wessel Kok", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };
const FAKE_PAYLOAD = {} as Payload;

function training(overrides: Partial<TrainingMetSchool> = {}): TrainingMetSchool {
  return { id: "1", naam: "Training A", status: "gepland", ruweStatusTekst: "Gepland", datum: "2026-08-28", logboekIngevuld: false, trainerboardItemId: "8001", schoolId: "500", schoolNaam: "School A", ...overrides };
}

function dashboardData(overrides: Partial<TrainerDashboardData> = {}): TrainerDashboardData {
  return {
    trainingenVandaag: [],
    komendeTrainingen: [],
    aantalScholen: 3,
    logboekOpenstaand: [],
    bevestigdeScholen: [{ id: "500", naam: "School A" }],
    totaalTrainingen: 7,
    ...overrides,
  };
}

function telefonischConcept(overrides: Partial<TelefonischConcept> = {}): TelefonischConcept {
  return { mondayTrainingId: "9", schoolId: "500", schoolNaam: "School A", trainingNaam: "Telefonische training", ontvangenOp: "2026-08-28T09:00:00.000Z", ...overrides };
}

function vastgelopenVerslag(overrides: Partial<VastgelopenVerslag> = {}): VastgelopenVerslag {
  return { mondayTrainingId: "8", schoolId: "500", schoolNaam: "School A", trainingNaam: "Vastgelopen training", status: "gedeeltelijk", wanneer: "2026-08-27T09:00:00.000Z", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHaalDashboardData.mockResolvedValue(dashboardData());
  mockHaalTelefonischeConcepten.mockResolvedValue([]);
  mockHaalVerslagenDieAandachtNodigHebben.mockResolvedValue([]);
  mockTelVoltooideVerslagen.mockResolvedValue(0);
  mockHaalActiviteitVoorTrainer.mockResolvedValue([]);
});

describe("haalDashboardV2Data", () => {
  it("geeft de eigen trainer door aan elke onderliggende leesfunctie — nooit een andere trainer", async () => {
    await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(mockHaalDashboardData).toHaveBeenCalledWith(TRAINER);
    expect(mockHaalTelefonischeConcepten).toHaveBeenCalledWith(FAKE_PAYLOAD, TRAINER);
    expect(mockHaalVerslagenDieAandachtNodigHebben).toHaveBeenCalledWith(FAKE_PAYLOAD, TRAINER);
    expect(mockTelVoltooideVerslagen).toHaveBeenCalledWith(FAKE_PAYLOAD, TRAINER);
    expect(mockHaalActiviteitVoorTrainer).toHaveBeenCalledWith(FAKE_PAYLOAD, TRAINER, 5);
  });

  it("aandacht nodig combineert telefonische concepten én vastgelopen verslagen, nieuwste eerst", async () => {
    mockHaalTelefonischeConcepten.mockResolvedValue([telefonischConcept({ ontvangenOp: "2026-08-28T09:00:00.000Z" })]);
    mockHaalVerslagenDieAandachtNodigHebben.mockResolvedValue([vastgelopenVerslag({ wanneer: "2026-08-29T09:00:00.000Z" })]);

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.aandachtNodig).toHaveLength(2);
    expect(data.aandachtNodig[0]!.soort).toBe("verslag_vastgelopen"); // meest recent (29e) staat bovenaan
    expect(data.aandachtNodig[1]!.soort).toBe("telefonisch_concept");
  });

  it("geen concepten/vastgelopen verslagen -> lege aandachtNodig-lijst, geen fout", async () => {
    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);
    expect(data.aandachtNodig).toEqual([]);
  });

  it("vandaag en komend blijven correct gescheiden en onaangeraakt overgenomen van haalDashboardData, komend beperkt tot 5 met een apart totaal", async () => {
    const vandaag = [training({ id: "v1" })];
    const komend = Array.from({ length: 8 }, (_, i) => training({ id: `k${i}`, datum: `2026-09-0${i + 1}` }));
    mockHaalDashboardData.mockResolvedValue(dashboardData({ trainingenVandaag: vandaag, komendeTrainingen: komend }));

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.vandaag).toEqual(vandaag);
    expect(data.komendVolgende).toHaveLength(5);
    expect(data.komendVolgende).toEqual(komend.slice(0, 5));
    expect(data.komendTotaal).toBe(8);
  });

  it("lege vandaag/komend-secties worden netjes afgehandeld", async () => {
    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);
    expect(data.vandaag).toEqual([]);
    expect(data.komendVolgende).toEqual([]);
    expect(data.komendTotaal).toBe(0);
  });

  it("statistieken combineren totaalTrainingen/aantalScholen (haalDashboardData) met verslagenAfgerond (telVoltooideVerslagen) — nooit een 'uren'-veld", async () => {
    mockHaalDashboardData.mockResolvedValue(dashboardData({ totaalTrainingen: 12, aantalScholen: 4 }));
    mockTelVoltooideVerslagen.mockResolvedValue(9);

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.statistieken).toEqual({ totaalTrainingen: 12, aantalScholen: 4, verslagenAfgerond: 9 });
    expect(data.statistieken).not.toHaveProperty("uren");
  });

  it("geeft bevestigdeScholen ongewijzigd door (voor het Vraag-blok)", async () => {
    const scholen = [{ id: "500", naam: "School A" }, { id: "501", naam: "School B" }];
    mockHaalDashboardData.mockResolvedValue(dashboardData({ bevestigdeScholen: scholen }));
    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);
    expect(data.bevestigdeScholen).toEqual(scholen);
  });
});
