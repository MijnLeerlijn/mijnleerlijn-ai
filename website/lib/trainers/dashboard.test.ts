import { describe, it, expect, vi, beforeEach } from "vitest";
import { haalDashboardV2Data } from "./dashboard";
import { haalDashboardData, type TrainerDashboardData, type TrainingMetSchool } from "./monday-links";
import {
  haalTelefonischeConceptenVoorTrainer,
  haalVerslagenDieAandachtNodigHebben,
  haalGestarteConceptenVoorTrainer,
  telVoltooideVerslagen,
  type TelefonischConcept,
  type VastgelopenVerslag,
  type GestartConcept,
} from "./verslag";
import { haalActiviteitVoorTrainer } from "./activiteit";
import { haalAanvullendeTrainingenAlsSamenvattingen } from "./aanvullende-trainingen";
import type { Payload } from "payload";
import type { AuthTrainer } from "./auth";

// Traineromgeving V2, Fase 1 (2026-08-28), uitgebreid Vervolgronde
// (2026-08-22) — dekt lib/trainers/dashboard.ts. Mockt alle onderliggende
// domeinlagen (monday-links.ts/verslag.ts/activiteit.ts) — dit bestand test
// uitsluitend de AGGREGATIE/COMPOSITIE (welke data waar terechtkomt,
// prioriteit/dedup van "To do", correcte doorgifte van de trainer), niet de
// dekking van elke leesfunctie zelf.
vi.mock("./monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./monday-links")>();
  return { ...echt, haalDashboardData: vi.fn() };
});
vi.mock("./verslag", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./verslag")>();
  return {
    ...echt,
    haalTelefonischeConceptenVoorTrainer: vi.fn(),
    haalVerslagenDieAandachtNodigHebben: vi.fn(),
    haalGestarteConceptenVoorTrainer: vi.fn(),
    telVoltooideVerslagen: vi.fn(),
  };
});
vi.mock("./activiteit", () => ({ haalActiviteitVoorTrainer: vi.fn() }));
// Upsell-ronde (2026-09-02) — haalDashboardV2Data haalt aanvullende
// trainingen nu naast de Monday-data op (lib/trainers/aanvullende-
// trainingen.ts), zelfde mockprincipe als de andere domeinlagen hierboven:
// deze suite test uitsluitend de aggregatie, niet die leesfunctie zelf (die
// heeft haar eigen tests in aanvullende-trainingen.test.ts).
vi.mock("./aanvullende-trainingen", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./aanvullende-trainingen")>();
  return { ...echt, haalAanvullendeTrainingenAlsSamenvattingen: vi.fn() };
});

const mockHaalDashboardData = vi.mocked(haalDashboardData);
const mockHaalTelefonischeConcepten = vi.mocked(haalTelefonischeConceptenVoorTrainer);
const mockHaalVerslagenDieAandachtNodigHebben = vi.mocked(haalVerslagenDieAandachtNodigHebben);
const mockHaalGestarteConcepten = vi.mocked(haalGestarteConceptenVoorTrainer);
const mockTelVoltooideVerslagen = vi.mocked(telVoltooideVerslagen);
const mockHaalActiviteitVoorTrainer = vi.mocked(haalActiviteitVoorTrainer);
const mockHaalAanvullendeTrainingen = vi.mocked(haalAanvullendeTrainingenAlsSamenvattingen);

const TRAINER: AuthTrainer = { id: 1, name: "Wessel Kok", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };
const FAKE_PAYLOAD = {} as Payload;

function training(overrides: Partial<TrainingMetSchool> = {}): TrainingMetSchool {
  return {
    id: "1",
    naam: "Training A",
    status: "gepland",
    ruweStatusTekst: "Gepland",
    datum: "2026-08-28",
    logboekIngevuld: false,
    trainerboardItemId: "8001",
    bron: "mijnleerlijn",
    schoolId: "500",
    schoolNaam: "School A",
    ...overrides,
  };
}

function dashboardData(overrides: Partial<TrainerDashboardData> = {}): TrainerDashboardData {
  return {
    trainingenVandaag: [],
    komendeTrainingen: [],
    aantalScholen: 3,
    logboekOpenstaand: [],
    bevestigdeScholen: [{ id: "500", naam: "School A" }],
    totaalTrainingen: 7,
    // Correctieronde Admin Traineromgeving (2026-08-25) — actuele-trainingen-
    // whitelist voor de To-do-filtering (training-actualiteit.ts). Standaard
    // leeg: tests die telefonische/vastgelopen/gestarte concepten mocken en
    // verwachten dat ze in de To do verschijnen, geven hier expliciet een
    // matchende alleTrainingen mee — dat is exact het nieuwe gedrag dat
    // bewaakt moet worden (zie ook de aparte "actuele-trainingenwhitelist"-
    // testgroep hieronder).
    alleTrainingen: [],
    ...overrides,
  };
}

function telefonischConcept(overrides: Partial<TelefonischConcept> = {}): TelefonischConcept {
  return { mondayTrainingId: "9", schoolId: "500", schoolNaam: "School A", trainingNaam: "Telefonische training", ontvangenOp: "2026-08-28T09:00:00.000Z", ...overrides };
}

function vastgelopenVerslag(overrides: Partial<VastgelopenVerslag> = {}): VastgelopenVerslag {
  return { mondayTrainingId: "8", schoolId: "500", schoolNaam: "School A", trainingNaam: "Vastgelopen training", status: "gedeeltelijk", wanneer: "2026-08-27T09:00:00.000Z", ...overrides };
}

function gestartConcept(overrides: Partial<GestartConcept> = {}): GestartConcept {
  return { mondayTrainingId: "7", schoolId: "500", schoolNaam: "School A", trainingNaam: "Gestarte training", wanneer: "2026-08-26T09:00:00.000Z", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHaalDashboardData.mockResolvedValue(dashboardData());
  mockHaalTelefonischeConcepten.mockResolvedValue([]);
  mockHaalVerslagenDieAandachtNodigHebben.mockResolvedValue([]);
  mockHaalGestarteConcepten.mockResolvedValue([]);
  mockTelVoltooideVerslagen.mockResolvedValue(0);
  mockHaalActiviteitVoorTrainer.mockResolvedValue([]);
  mockHaalAanvullendeTrainingen.mockResolvedValue([]);
});

describe("haalDashboardV2Data", () => {
  it("geeft de eigen trainer door aan elke onderliggende leesfunctie — nooit een andere trainer", async () => {
    await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(mockHaalDashboardData).toHaveBeenCalledWith(TRAINER);
    expect(mockHaalTelefonischeConcepten).toHaveBeenCalledWith(FAKE_PAYLOAD, TRAINER);
    expect(mockHaalVerslagenDieAandachtNodigHebben).toHaveBeenCalledWith(FAKE_PAYLOAD, TRAINER);
    expect(mockHaalGestarteConcepten).toHaveBeenCalledWith(FAKE_PAYLOAD, TRAINER);
    expect(mockTelVoltooideVerslagen).toHaveBeenCalledWith(FAKE_PAYLOAD, TRAINER);
    expect(mockHaalActiviteitVoorTrainer).toHaveBeenCalledWith(FAKE_PAYLOAD, TRAINER, 5);
    expect(mockHaalAanvullendeTrainingen).toHaveBeenCalledWith(FAKE_PAYLOAD, TRAINER);
  });

  it("To do is zichtbaar (niet-leeg) zodra minstens één categorie iets oplevert", async () => {
    mockHaalTelefonischeConcepten.mockResolvedValue([telefonischConcept()]);
    mockHaalDashboardData.mockResolvedValue(dashboardData({ alleTrainingen: [training({ id: "9" })] }));

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.todo).toHaveLength(1);
    expect(data.todo[0]!.soort).toBe("telefonisch_concept");
  });

  it("To do is een lege lijst (dus verborgen op de pagina) als geen van de vier categorieën iets oplevert", async () => {
    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);
    expect(data.todo).toEqual([]);
  });

  it("To do combineert alle vier categorieën, in prioriteitsvolgorde: telefonisch > vastgelopen > gestart > ontbrekend", async () => {
    // Bewust in omgekeerde/willekeurige tijdsvolgorde gemockt — de opdracht
    // vraagt "belangrijkste actie eerst", niet uitsluitend recentst-eerst.
    mockHaalTelefonischeConcepten.mockResolvedValue([telefonischConcept({ mondayTrainingId: "1", ontvangenOp: "2026-08-10T09:00:00.000Z" })]);
    mockHaalVerslagenDieAandachtNodigHebben.mockResolvedValue([vastgelopenVerslag({ mondayTrainingId: "2", wanneer: "2026-08-29T09:00:00.000Z" })]);
    mockHaalGestarteConcepten.mockResolvedValue([gestartConcept({ mondayTrainingId: "3", wanneer: "2026-08-30T09:00:00.000Z" })]);
    mockHaalDashboardData.mockResolvedValue(
      dashboardData({ logboekOpenstaand: [training({ id: "4", datum: "2026-08-31" })], alleTrainingen: [training({ id: "1" }), training({ id: "2" }), training({ id: "3" }), training({ id: "4" })] })
    );

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.todo.map((i) => i.soort)).toEqual(["telefonisch_concept", "verslag_vastgelopen", "concept_gestart", "verslag_ontbreekt"]);
  });

  it("dezelfde training komt maar één keer voor in To do, ook als hij in meerdere categorieën tegelijk voorkomt — hoogste prioriteit wint", async () => {
    mockHaalTelefonischeConcepten.mockResolvedValue([telefonischConcept({ mondayTrainingId: "1" })]);
    mockHaalVerslagenDieAandachtNodigHebben.mockResolvedValue([vastgelopenVerslag({ mondayTrainingId: "1" })]);
    mockHaalDashboardData.mockResolvedValue(dashboardData({ logboekOpenstaand: [training({ id: "1" })], alleTrainingen: [training({ id: "1" })] }));

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.todo).toHaveLength(1);
    expect(data.todo[0]!.soort).toBe("telefonisch_concept");
    expect(data.todo[0]!.trainingId).toBe("1");
  });

  it("verslag_ontbreekt (uit logboekOpenstaand) sorteert binnen zijn eigen categorie oplopend op datum — langst openstaand eerst", async () => {
    mockHaalDashboardData.mockResolvedValue(
      dashboardData({
        logboekOpenstaand: [training({ id: "recent", datum: "2026-08-20", schoolNaam: "School Recent" }), training({ id: "oud", datum: "2026-08-01", schoolNaam: "School Oud" })],
      })
    );

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.todo.map((i) => i.trainingId)).toEqual(["oud", "recent"]);
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

// Correctieronde Admin Traineromgeving (2026-08-25, spec §1/§3) — root cause:
// telefonische/vastgelopen/gestarte conceptverslagen bleven voorheen
// onvoorwaardelijk als To do zichtbaar, ook nadat de bijbehorende training
// niet meer in Monday bestond/gekoppeld was bij deze trainer.
describe("haalDashboardV2Data — actuele-trainingenwhitelist (spec §1)", () => {
  it("training bestaat nog bij de trainer (in alleTrainingen) → het conceptverslag mag als To do zichtbaar zijn", async () => {
    mockHaalTelefonischeConcepten.mockResolvedValue([telefonischConcept({ mondayTrainingId: "9" })]);
    mockHaalDashboardData.mockResolvedValue(dashboardData({ alleTrainingen: [training({ id: "9" })] }));

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.todo.map((i) => i.trainingId)).toContain("9");
  });

  it("training verwijderd/ontkoppeld uit Monday (niet in alleTrainingen) → oud telefonisch concept levert GEEN To do meer op, ook al bestaat het record nog", async () => {
    mockHaalTelefonischeConcepten.mockResolvedValue([telefonischConcept({ mondayTrainingId: "verwijderd" })]);
    mockHaalDashboardData.mockResolvedValue(dashboardData({ alleTrainingen: [] })); // Monday geeft deze training niet meer terug

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.todo).toEqual([]);
  });

  it("een vastgelopen (gedeeltelijk/bevestigd) verslag van een verwijderde training levert ook geen To do meer op", async () => {
    mockHaalVerslagenDieAandachtNodigHebben.mockResolvedValue([vastgelopenVerslag({ mondayTrainingId: "verwijderd" })]);
    mockHaalDashboardData.mockResolvedValue(dashboardData({ alleTrainingen: [] }));

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.todo).toEqual([]);
  });

  it("een zelf-gestart (portal)concept van een verwijderde training levert ook geen To do meer op", async () => {
    mockHaalGestarteConcepten.mockResolvedValue([gestartConcept({ mondayTrainingId: "verwijderd" })]);
    mockHaalDashboardData.mockResolvedValue(dashboardData({ alleTrainingen: [] }));

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.todo).toEqual([]);
  });

  it("verslag_ontbreekt (rechtstreeks uit de live Monday-set) blijft altijd zichtbaar — die categorie heeft de whitelist niet nodig", async () => {
    mockHaalDashboardData.mockResolvedValue(dashboardData({ logboekOpenstaand: [training({ id: "live-1" })], alleTrainingen: [] }));

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.todo.map((i) => i.trainingId)).toEqual(["live-1"]);
  });
});

// Upsell-ronde (2026-09-02, spec §A4/§K) — "Behandel een aanvullende
// training verder als een normale training: zichtbaar in planning/
// trainingen." Deze suite bewijst dat de her-groepering in dashboard.ts
// (groepeerOpWeergaveStatus over Monday- ÉN aanvullende trainingen samen)
// een aanvullende training exact zo behandelt als een Monday-training —
// geen tweede interpretatie van "wat telt als training".
describe("haalDashboardV2Data — aanvullende trainingen (spec §A4/§K)", () => {
  it("een aanvullende training telt mee in totaalTrainingen/alleTrainingen, naast de Monday-trainingen", async () => {
    mockHaalDashboardData.mockResolvedValue(dashboardData({ totaalTrainingen: 1, alleTrainingen: [training({ id: "ml-1" })] }));
    mockHaalAanvullendeTrainingen.mockResolvedValue([training({ id: "aanvullend:1", bron: "aanvullend", datum: "2099-01-01" })]);

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.statistieken.totaalTrainingen).toBe(2);
    expect(data.komendVolgende.map((t) => t.id)).toContain("aanvullend:1");
  });

  it("een verlopen aanvullende training zonder verslag verschijnt in To do (verslag_ontbreekt), net als een Monday-training", async () => {
    mockHaalDashboardData.mockResolvedValue(dashboardData());
    mockHaalAanvullendeTrainingen.mockResolvedValue([training({ id: "aanvullend:2", bron: "aanvullend", datum: "2026-01-01", logboekIngevuld: false })]);

    const data = await haalDashboardV2Data(FAKE_PAYLOAD, TRAINER);

    expect(data.todo).toEqual([expect.objectContaining({ soort: "verslag_ontbreekt", trainingId: "aanvullend:2" })]);
  });
});
