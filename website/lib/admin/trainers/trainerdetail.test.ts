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
} from "./trainerdetail";
import { haalAuthTrainerVoorId } from "@/lib/trainers/telefonie/trainer-lookup";

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

const mockHaalTrainer = vi.mocked(haalAuthTrainerVoorId);

beforeEach(() => {
  mockHaalTrainer.mockReset();
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
