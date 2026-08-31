import { describe, it, expect, vi, beforeEach } from "vitest";
import { maakFakePayload } from "@/lib/support/fake-payload";
import {
  haalAdminTrainerBasis,
  haalAdminTrainerOverzichtTab,
  haalAdminTrainerScholenTab,
  haalAdminTrainerTrainingenTab,
  haalAdminTrainerVerslagenTab,
  haalAdminTrainerLogboekTab,
  haalAdminTrainerTelefonieTab,
  haalAdminTrainerBestandenTab,
  haalAdminTrainerUpsell,
} from "./trainerdetail";
import { haalAuthTrainerVoorId } from "@/lib/trainers/telefonie/trainer-lookup";
import { haalAlleTrainingenVoorTrainer, type TrainingMetSchool } from "@/lib/trainers/monday-links";
import { haalAanvullendeTrainingenAlsSamenvattingen } from "@/lib/trainers/aanvullende-trainingen";

// Traineromgeving V2, Fase 4 (2026-08-24) — spec §3/§18. Elke functie in dit
// bestand start met dezelfde bestaande poort (haalAuthTrainerVoorId) — deze
// suite bewijst eerst dat ALLE ACHT tabbladen op dezelfde manier
// "niet_gevonden" teruggeven bij een onbestaande trainer (spec §8: geen
// impersonation, elke tab herverifieert zelf). Daarna, gericht, de TWEE
// werkelijk nieuwe queries van dit bestand (Verslagen/Telefonie — de overige
// zes hergebruiken rechtstreeks al-bestaande, elders al geteste
// single-trainer-functies): trainerisolatie (spec §18 "alleen oproepen van
// de juiste trainer") en dataminimalisatie (spec §15 "geen audio").

vi.mock("@/lib/trainers/telefonie/trainer-lookup", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/telefonie/trainer-lookup")>();
  return { ...echt, haalAuthTrainerVoorId: vi.fn(), haalTelefonieProfiel: vi.fn().mockResolvedValue({ mobielNummer: null, telefonieActief: false }) };
});
// Upsell-ronde (2026-09-02) — haalAdminTrainerTrainingenTab/haalAdminTrainerUpsell
// zijn de derde/vierde ECHT nieuwe query in dit bestand (naast Verslagen/
// Telefonie hierboven) — beide roepen live-Monday-afgeleide functies aan die
// hier, i.t.t. de overige (elders al geteste) tabs, voor het eerst gemockt
// moeten worden om hun eigen nieuwe telling-/mergelogica te kunnen bewijzen.
vi.mock("@/lib/trainers/monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/monday-links")>();
  return { ...echt, haalAlleTrainingenVoorTrainer: vi.fn() };
});
vi.mock("@/lib/trainers/aanvullende-trainingen", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/aanvullende-trainingen")>();
  return { ...echt, haalAanvullendeTrainingenAlsSamenvattingen: vi.fn() };
});

const mockHaalTrainer = vi.mocked(haalAuthTrainerVoorId);
const mockMlTrainingen = vi.mocked(haalAlleTrainingenVoorTrainer);
const mockAanvullendeTrainingen = vi.mocked(haalAanvullendeTrainingenAlsSamenvattingen);

function aanvullendeTraining(overrides: Partial<TrainingMetSchool> = {}): TrainingMetSchool {
  return {
    id: "aanvullend:1",
    naam: "Aanvullende training",
    status: "gepland",
    ruweStatusTekst: null,
    datum: "2026-09-05",
    logboekIngevuld: false,
    trainerboardItemId: null,
    bron: "aanvullend",
    schoolId: "s1",
    schoolNaam: "School A",
    ...overrides,
  };
}

beforeEach(() => {
  mockHaalTrainer.mockReset();
  mockMlTrainingen.mockReset();
  mockAanvullendeTrainingen.mockReset();
  mockMlTrainingen.mockResolvedValue([]);
  mockAanvullendeTrainingen.mockResolvedValue([]);
});

describe("elk tabblad geeft 'niet_gevonden' terug voor een onbestaande trainer", () => {
  it.each([
    ["basis", haalAdminTrainerBasis],
    ["overzicht", haalAdminTrainerOverzichtTab],
    ["scholen", haalAdminTrainerScholenTab],
    ["trainingen", haalAdminTrainerTrainingenTab],
    ["verslagen", haalAdminTrainerVerslagenTab],
    ["logboek", haalAdminTrainerLogboekTab],
    ["telefonie", haalAdminTrainerTelefonieTab],
    ["bestanden", haalAdminTrainerBestandenTab],
    ["upsell", haalAdminTrainerUpsell],
  ] as const)("%s", async (_naam, fn) => {
    mockHaalTrainer.mockResolvedValue(null);
    const { payload } = maakFakePayload({});
    const uitkomst = await fn(payload, 999);
    expect(uitkomst.soort).toBe("niet_gevonden");
  });
});

const trainerA = { id: 1, name: "Trainer A", email: "a@test.nl", mondayTrainerboardId: "board-a", mondayUitvoerderItemId: "uitv-a", actief: true };
const trainerB = { id: 2, name: "Trainer B", email: "b@test.nl", mondayTrainerboardId: "board-b", mondayUitvoerderItemId: "uitv-b", actief: true };

describe("haalAdminTrainerVerslagenTab", () => {
  it("toont alleen verslagen van de opgevraagde trainer (trainerisolatie), incl. writeback-status", async () => {
    mockHaalTrainer.mockResolvedValue(trainerA);
    const { payload } = maakFakePayload({
      "training-verslagen": [
        {
          id: 1,
          trainer: 1,
          mondayTrainingId: "t1",
          mondaySchoolId: "s1",
          schoolNaam: "School A",
          trainingNaam: "T1",
          status: "bevestigd",
          bron: "portal",
          trainingUpdateStatus: "geschreven",
          schoolUpdateStatus: "niet_verzonden",
          bevestigdOp: "2026-08-20T00:00:00.000Z",
          updatedAt: "2026-08-20T00:00:00.000Z",
        },
        { id: 2, trainer: 2, mondayTrainingId: "t2", mondaySchoolId: "s2", schoolNaam: "School B", trainingNaam: "T2", status: "concept", bron: "portal", trainingUpdateStatus: "niet_verzonden", schoolUpdateStatus: "niet_verzonden", bevestigdOp: null, updatedAt: "2026-08-19T00:00:00.000Z" },
      ],
    });
    const uitkomst = await haalAdminTrainerVerslagenTab(payload, 1);
    expect(uitkomst.soort).toBe("ok");
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data).toHaveLength(1);
    expect(uitkomst.data[0]).toMatchObject({ verslagId: 1, trainingUpdateStatus: "geschreven", schoolUpdateStatus: "niet_verzonden" });
  });
});

describe("haalAdminTrainerTelefonieTab", () => {
  it("toont alleen oproepen van de opgevraagde trainer (trainerisolatie), met zichtbare foutstatus", async () => {
    mockHaalTrainer.mockResolvedValue(trainerA);
    const { payload } = maakFakePayload({
      "trainer-telefonie-oproepen": [
        {
          id: 1,
          trainer: 1,
          status: "mislukt",
          foutcode: "transcriptie_mislukt",
          foutmelding: "Max. pogingen bereikt",
          transcriptiePogingen: 3,
          heropnamePogingen: 0,
          ontvangenOp: "2026-08-20T00:00:00.000Z",
          afgerondOp: "2026-08-20T00:05:00.000Z",
          gekozenSchoolNaam: "School A",
          gekozenTrainingNaam: "T1",
          verslag: null,
          opnameVerwijderdOp: null,
        },
        { id: 2, trainer: 2, status: "concept_klaar", foutcode: null, foutmelding: null, transcriptiePogingen: 0, heropnamePogingen: 0, ontvangenOp: "2026-08-19T00:00:00.000Z", afgerondOp: null, gekozenSchoolNaam: null, gekozenTrainingNaam: null, verslag: null, opnameVerwijderdOp: null },
      ],
    });
    const uitkomst = await haalAdminTrainerTelefonieTab(payload, 1);
    expect(uitkomst.soort).toBe("ok");
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data).toHaveLength(1);
    expect(uitkomst.data[0]).toMatchObject({ status: "mislukt", foutcode: "transcriptie_mislukt", foutmelding: "Max. pogingen bereikt" });
  });

  it("geeft nooit audio-/opnamevelden door (recordingProviderId/opnameOphaalReferentie bestaan niet in het return-type)", async () => {
    mockHaalTrainer.mockResolvedValue(trainerA);
    const { payload } = maakFakePayload({
      "trainer-telefonie-oproepen": [
        {
          id: 1,
          trainer: 1,
          status: "mislukt",
          foutcode: "opname_mislukt",
          foutmelding: "fout",
          transcriptiePogingen: 1,
          heropnamePogingen: 0,
          ontvangenOp: "2026-08-20T00:00:00.000Z",
          afgerondOp: "2026-08-20T00:05:00.000Z",
          gekozenSchoolNaam: null,
          gekozenTrainingNaam: null,
          verslag: null,
          opnameVerwijderdOp: null,
          recordingProviderId: "geheim",
          opnameOphaalReferentie: "https://geheim",
        },
      ],
    });
    const uitkomst = await haalAdminTrainerTelefonieTab(payload, 1);
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data[0]).not.toHaveProperty("recordingProviderId");
    expect(uitkomst.data[0]).not.toHaveProperty("opnameOphaalReferentie");
  });

  it("toont verslagGekoppeld=true zodra er een gekoppeld verslag is, anders false", async () => {
    mockHaalTrainer.mockResolvedValue(trainerA);
    const { payload } = maakFakePayload({
      "trainer-telefonie-oproepen": [
        { id: 1, trainer: 1, status: "concept_klaar", foutcode: null, foutmelding: null, transcriptiePogingen: 1, heropnamePogingen: 0, ontvangenOp: "2026-08-20T00:00:00.000Z", afgerondOp: "2026-08-20T00:05:00.000Z", gekozenSchoolNaam: null, gekozenTrainingNaam: null, verslag: 55, opnameVerwijderdOp: null },
      ],
    });
    const uitkomst = await haalAdminTrainerTelefonieTab(payload, 1);
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data[0]?.verslagGekoppeld).toBe(true);
  });
});

// Upsell-ronde (2026-09-02, spec §A4/§11) — haalAdminTrainerTrainingenTab
// mergde voorheen uitsluitend haalAlleTrainingenVoorTrainer (Monday); toont nu
// ook de aanvullende trainingen van deze trainer, exact zoals de portal se
// eigen /trainingen-pagina dat in Fase 1 al deed.
describe("haalAdminTrainerTrainingenTab", () => {
  it("combineert mijnleerlijn- en aanvullende trainingen van de trainer in één lijst", async () => {
    mockHaalTrainer.mockResolvedValue(trainerA);
    mockMlTrainingen.mockResolvedValue([{ id: "ml-1", naam: "ML-training", status: "gepland", ruweStatusTekst: "Gepland", datum: "2026-09-01", logboekIngevuld: false, trainerboardItemId: "tb-1", bron: "mijnleerlijn", schoolId: "s1", schoolNaam: "School A" }]);
    mockAanvullendeTrainingen.mockResolvedValue([aanvullendeTraining()]);

    const { payload } = maakFakePayload({});
    const uitkomst = await haalAdminTrainerTrainingenTab(payload, 1);
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data).toHaveLength(2);
    expect(uitkomst.data.map((t) => t.bron).sort()).toEqual(["aanvullend", "mijnleerlijn"]);
  });
});

// Upsell-ronde (2026-09-02, spec §11) — de tellingen/verhouding zelf zijn
// nieuwe logica (i.t.t. Trainingen hierboven, dat uitsluitend samenvoegt),
// dus met eigen gerichte dekking, zelfde behandeling als Verslagen/Telefonie.
describe("haalAdminTrainerUpsell", () => {
  it("telt ML/aanvullend/scholen-met-aanvullend en berekent de verhouding", async () => {
    mockHaalTrainer.mockResolvedValue(trainerA);
    mockMlTrainingen.mockResolvedValue([
      { id: "ml-1", naam: "ML 1", status: "gepland", ruweStatusTekst: "Gepland", datum: "2026-09-01", logboekIngevuld: false, trainerboardItemId: "tb-1", bron: "mijnleerlijn", schoolId: "s1", schoolNaam: "School A" },
      { id: "ml-2", naam: "ML 2", status: "gepland", ruweStatusTekst: "Gepland", datum: "2026-09-02", logboekIngevuld: false, trainerboardItemId: "tb-2", bron: "mijnleerlijn", schoolId: "s1", schoolNaam: "School A" },
    ]);
    mockAanvullendeTrainingen.mockResolvedValue([aanvullendeTraining({ id: "aanvullend:1", schoolId: "s1" }), aanvullendeTraining({ id: "aanvullend:2", schoolId: "s2", schoolNaam: "School B" })]);

    const { payload } = maakFakePayload({});
    const uitkomst = await haalAdminTrainerUpsell(payload, 1);
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data).toEqual({ aantalMijnleerlijn: 2, aantalAanvullend: 2, aantalScholenMetAanvullend: 2, verhouding: 1 });
  });

  it("verhouding is null zolang er nog geen mijnleerlijn-trainingen zijn (geen deling door nul)", async () => {
    mockHaalTrainer.mockResolvedValue(trainerA);
    mockMlTrainingen.mockResolvedValue([]);
    mockAanvullendeTrainingen.mockResolvedValue([aanvullendeTraining()]);

    const { payload } = maakFakePayload({});
    const uitkomst = await haalAdminTrainerUpsell(payload, 1);
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data.verhouding).toBeNull();
  });

  it("aantalScholenMetAanvullend dedupliceert meerdere aanvullende trainingen bij dezelfde school", async () => {
    mockHaalTrainer.mockResolvedValue(trainerA);
    mockMlTrainingen.mockResolvedValue([]);
    mockAanvullendeTrainingen.mockResolvedValue([aanvullendeTraining({ id: "aanvullend:1", schoolId: "s1" }), aanvullendeTraining({ id: "aanvullend:2", schoolId: "s1" })]);

    const { payload } = maakFakePayload({});
    const uitkomst = await haalAdminTrainerUpsell(payload, 1);
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data.aantalScholenMetAanvullend).toBe(1);
    expect(uitkomst.data.aantalAanvullend).toBe(2);
  });
});
