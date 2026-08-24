import { describe, it, expect, vi, beforeEach } from "vitest";
import { maakFakePayload } from "@/lib/support/fake-payload";
import {
  haalAdminSchoolBasis,
  haalAdminSchoolAandacht,
  haalAdminSchoolOverzichtTab,
  haalAdminSchoolTrainersTab,
  haalAdminSchoolTrainingenTab,
  haalAdminSchoolVerslagenTab,
  haalAdminSchoolLogboekTab,
  haalAdminSchoolBestandenTab,
} from "./schooldetail";
import {
  haalTrainingenEnScholenVoorAlleTrainers,
  type AdminTrainerMondayOverzicht,
  type AdminSchoolMonday,
  type TrainingMetSchool,
  type TrainingSamenvatting,
} from "@/lib/trainers/monday-links";

// Traineromgeving V2, Fase 5 (2026-08-24) — spec §10. Elke functie in
// schooldetail.ts herverifieert zelf het school-ID tegen de Monday-
// Masterdata (zelfde architectuurprincipe als trainerdetail.test.ts) — deze
// suite bewijst eerst dat ALLE ACHT tabbladen "niet_gevonden" teruggeven bij
// een onbestaand school-ID, daarna schoolisolatie per tabblad (school B se
// data lekt nooit in school A se tabblad) en tot slot de performance-eis uit
// spec §5: geen losse Monday-/Payload-aanroepen per trainer of per
// resultaatrij.

vi.mock("@/lib/trainers/monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/monday-links")>();
  return { ...echt, haalTrainingenEnScholenVoorAlleTrainers: vi.fn() };
});

const mockMondayOverzicht = vi.mocked(haalTrainingenEnScholenVoorAlleTrainers);

function school(overrides: Partial<AdminSchoolMonday> = {}): AdminSchoolMonday {
  return { id: "s1", naam: "School A", onderwijstype: "Basisonderwijs", locatie: "Amsterdam", trainerIds: ["uitv-1"], ...overrides };
}

function trainingMetSchool(overrides: Partial<TrainingMetSchool> = {}): TrainingMetSchool {
  return {
    id: "tr1",
    naam: "Training 1",
    status: "gepland",
    ruweStatusTekst: "Gepland",
    datum: "2099-01-01", // ver in de toekomst — onafhankelijk van de systeemklok altijd "komend"
    logboekIngevuld: false,
    trainerboardItemId: "tb-1",
    schoolId: "s1",
    schoolNaam: "School A",
    ...overrides,
  };
}

function trainingSamenvatting(overrides: Partial<TrainingSamenvatting> = {}): TrainingSamenvatting {
  return {
    id: "tr1",
    naam: "Training 1",
    status: "open",
    ruweStatusTekst: "Open",
    datum: "2099-01-01",
    logboekIngevuld: false,
    trainerboardItemId: "tb-1",
    ...overrides,
  };
}

function standaardMondayOverzicht(overrides: Partial<AdminTrainerMondayOverzicht> = {}): AdminTrainerMondayOverzicht {
  return {
    trainingenPerTrainer: new Map([
      ["uitv-1", [trainingMetSchool()]],
      ["uitv-2", [trainingMetSchool({ id: "tr2", schoolId: "s2", schoolNaam: "School B" })]],
    ]),
    scholenPerTrainer: new Map(),
    scholen: new Map([
      ["s1", school()],
      ["s2", school({ id: "s2", naam: "School B", onderwijstype: null, locatie: null, trainerIds: ["uitv-2"] })],
    ]),
    trainingenPerSchool: new Map([
      ["s1", [trainingSamenvatting()]],
      ["s2", [trainingSamenvatting({ id: "tr2" })]],
    ]),
    ...overrides,
  };
}

const trainerA = { id: 1, name: "Trainer A", email: "a@test.nl", actief: true, mondayUitvoerderItemId: "uitv-1", mondayTrainerboardId: "board-a" };
const trainerB = { id: 2, name: "Trainer B", email: "b@test.nl", actief: true, mondayUitvoerderItemId: "uitv-2", mondayTrainerboardId: "board-b" };

beforeEach(() => {
  mockMondayOverzicht.mockReset();
  mockMondayOverzicht.mockResolvedValue(standaardMondayOverzicht());
});

describe("elk tabblad geeft 'niet_gevonden' terug voor een onbestaand school-ID", () => {
  it.each([
    ["basis", haalAdminSchoolBasis],
    ["aandacht", haalAdminSchoolAandacht],
    ["overzicht", haalAdminSchoolOverzichtTab],
    ["trainers", haalAdminSchoolTrainersTab],
    ["trainingen", haalAdminSchoolTrainingenTab],
    ["verslagen", haalAdminSchoolVerslagenTab],
    ["logboek", haalAdminSchoolLogboekTab],
    ["bestanden", haalAdminSchoolBestandenTab],
  ] as const)("%s", async (_naam, fn) => {
    const { payload } = maakFakePayload({});
    const uitkomst = await fn(payload, "s999");
    expect(uitkomst.soort).toBe("niet_gevonden");
  });
});

describe("haalAdminSchoolBasis", () => {
  it("toont de juiste schoolgegevens en tellingen", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [trainerA, trainerB],
      "training-verslagen": [
        { id: 1, trainer: 1, mondayTrainingId: "tr1", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "Training 1", status: "concept", bron: "portal", updatedAt: "2026-08-20T00:00:00.000Z", telefonieOproep: null },
      ],
      "trainer-logboek-items": [
        { id: 1, trainer: 1, mondaySchoolId: "s1", schoolNaam: "School A", type: "notitie", occurredAt: "2026-08-22T00:00:00.000Z", tekst: "Logboeknotitie", mondayTrainingId: null, trainingNaam: null, createdAt: "2026-08-22T00:00:00.000Z" },
      ],
    });
    const uitkomst = await haalAdminSchoolBasis(payload, "s1");
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data).toMatchObject({
      id: "s1",
      naam: "School A",
      onderwijstype: "Basisonderwijs",
      locatie: "Amsterdam",
      aantalActieveTrainers: 1,
      aantalOpenTrainingen: 1,
      aantalOpenTodos: 1,
      aantalOpenVerslagen: 1,
      laatsteActiviteit: "2026-08-22T00:00:00.000Z", // logboekitem is recenter dan het verslag
    });
    expect(uitkomst.data.trainers).toEqual([{ id: 1, naam: "Trainer A", actief: true }]);
  });

  it("laatsteActiviteit is null zonder verslag-/logboekactiviteit bij deze school", async () => {
    const { payload } = maakFakePayload({ "trainer-accounts": [trainerA] });
    const uitkomst = await haalAdminSchoolBasis(payload, "s1");
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data.laatsteActiviteit).toBeNull();
    expect(uitkomst.data.aantalOpenVerslagen).toBe(0);
  });
});

describe("haalAdminSchoolAandacht — schoolisolatie", () => {
  it("toont alleen aandachtspunten van de opgevraagde school", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [trainerA, trainerB],
      "training-verslagen": [
        { id: 1, trainer: { id: 1, name: "Trainer A" }, mondayTrainingId: "tr1", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "Training 1", status: "gedeeltelijk", bron: "portal", updatedAt: "2026-08-10T00:00:00.000Z", telefonieOproep: null },
        { id: 2, trainer: { id: 2, name: "Trainer B" }, mondayTrainingId: "tr2", mondaySchoolId: "s2", schoolNaam: "School B", trainingNaam: "Training 2", status: "gedeeltelijk", bron: "portal", updatedAt: "2026-08-10T00:00:00.000Z", telefonieOproep: null },
      ],
    });
    const uitkomst = await haalAdminSchoolAandacht(payload, "s1");
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data).toHaveLength(1);
    expect(uitkomst.data[0]).toMatchObject({ soort: "verslag_vastgelopen", schoolId: "s1", trainerNaam: "Trainer A" });
  });
});

describe("haalAdminSchoolOverzichtTab", () => {
  it("combineert komende trainingen, open to-do's, activiteit en gekoppelde trainers — allemaal school-gescoped", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [trainerA, trainerB],
      "training-verslagen": [
        { id: 1, trainer: 1, mondayTrainingId: "tr1", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "Training 1", status: "concept", bron: "portal", updatedAt: "2026-08-20T00:00:00.000Z", telefonieOproep: null },
        { id: 2, trainer: 2, mondayTrainingId: "tr2", mondaySchoolId: "s2", schoolNaam: "School B", trainingNaam: "Training 2", status: "concept", bron: "portal", updatedAt: "2026-08-19T00:00:00.000Z", telefonieOproep: null },
      ],
    });
    const uitkomst = await haalAdminSchoolOverzichtTab(payload, "s1");
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data.gekoppeldeTrainers).toEqual([{ id: 1, naam: "Trainer A", actief: true }]);
    expect(uitkomst.data.komendeTrainingen).toHaveLength(1);
    expect(uitkomst.data.komendeTrainingen[0]).toMatchObject({ trainingId: "tr1", schoolId: "s1" });
    expect(uitkomst.data.openTodos).toHaveLength(1);
    expect(uitkomst.data.openTodos[0]).toMatchObject({ schoolId: "s1" });
    expect(uitkomst.data.recenteActiviteit.length).toBeGreaterThan(0);
    expect(uitkomst.data.recenteActiviteit.every((a) => a.schoolId === "s1")).toBe(true);
  });
});

describe("haalAdminSchoolTrainersTab — schoolisolatie", () => {
  it("toont alleen trainers gekoppeld aan de opgevraagde school", async () => {
    const { payload } = maakFakePayload({ "trainer-accounts": [trainerA, trainerB] });
    const uitkomstA = await haalAdminSchoolTrainersTab(payload, "s1");
    const uitkomstB = await haalAdminSchoolTrainersTab(payload, "s2");
    if (uitkomstA.soort !== "ok" || uitkomstB.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomstA.data).toEqual([{ id: 1, naam: "Trainer A", actief: true }]);
    expect(uitkomstB.data).toEqual([{ id: 2, naam: "Trainer B", actief: true }]);
  });
});

describe("haalAdminSchoolTrainingenTab — filtering op school", () => {
  it("toont alleen trainingen van de opgevraagde school, met de juiste trainer", async () => {
    const { payload } = maakFakePayload({ "trainer-accounts": [trainerA, trainerB] });
    const uitkomst = await haalAdminSchoolTrainingenTab(payload, "s1");
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data).toHaveLength(1);
    expect(uitkomst.data[0]).toMatchObject({ trainingId: "tr1", schoolId: "s1", trainerId: 1, trainerNaam: "Trainer A" });
  });
});

describe("haalAdminSchoolVerslagenTab", () => {
  it("toont alleen verslagen gekoppeld aan de opgevraagde school, met trainernaam", async () => {
    const { payload } = maakFakePayload({
      "training-verslagen": [
        {
          id: 1,
          trainer: { id: 1, name: "Trainer A" },
          mondayTrainingId: "tr1",
          mondaySchoolId: "s1",
          trainingNaam: "Training 1",
          status: "bevestigd",
          bron: "portal",
          trainingUpdateStatus: "geschreven",
          schoolUpdateStatus: "niet_verzonden",
          updatedAt: "2026-08-20T00:00:00.000Z",
        },
        {
          id: 2,
          trainer: { id: 2, name: "Trainer B" },
          mondayTrainingId: "tr2",
          mondaySchoolId: "s2",
          trainingNaam: "Training 2",
          status: "concept",
          bron: "portal",
          trainingUpdateStatus: "niet_verzonden",
          schoolUpdateStatus: "niet_verzonden",
          updatedAt: "2026-08-19T00:00:00.000Z",
        },
      ],
    });
    const uitkomst = await haalAdminSchoolVerslagenTab(payload, "s1");
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data).toHaveLength(1);
    expect(uitkomst.data[0]).toMatchObject({ verslagId: 1, trainerNaam: "Trainer A", trainingNaam: "Training 1", trainingUpdateStatus: "geschreven" });
  });
});

describe("haalAdminSchoolLogboekTab", () => {
  it("toont alleen logboekitems van de opgevraagde school, met trainernaam", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [trainerA, trainerB],
      "trainer-logboek-items": [
        { id: 1, trainer: 1, mondaySchoolId: "s1", schoolNaam: "School A", type: "notitie", occurredAt: "2026-08-20T00:00:00.000Z", tekst: "Notitie bij school A", mondayTrainingId: null, trainingNaam: null, createdAt: "2026-08-20T00:00:00.000Z" },
        { id: 2, trainer: 2, mondaySchoolId: "s2", schoolNaam: "School B", type: "notitie", occurredAt: "2026-08-19T00:00:00.000Z", tekst: "Notitie bij school B", mondayTrainingId: null, trainingNaam: null, createdAt: "2026-08-19T00:00:00.000Z" },
      ],
    });
    const uitkomst = await haalAdminSchoolLogboekTab(payload, "s1");
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data).toHaveLength(1);
    expect(uitkomst.data[0]).toMatchObject({ id: 1, trainerNaam: "Trainer A", tekst: "Notitie bij school A" });
  });
});

describe("haalAdminSchoolBestandenTab", () => {
  it("toont alleen schoolbestanden van de opgevraagde school, nooit storageKey/publieke Blob-referentie", async () => {
    const { payload } = maakFakePayload({
      "trainer-bestanden": [
        { id: 1, scope: "school", titel: "Handleiding A", categorie: "curriculum", storageKey: "trainer-bestanden/geheim-a.pdf", uploader: { id: 1, name: "Trainer A" }, mondaySchoolId: "s1", mondayTrainingId: "tr1", trainingNaam: "Training 1", createdAt: "2026-08-20T00:00:00.000Z" },
        { id: 2, scope: "school", titel: "Handleiding B", categorie: "curriculum", storageKey: "trainer-bestanden/geheim-b.pdf", uploader: { id: 2, name: "Trainer B" }, mondaySchoolId: "s2", createdAt: "2026-08-19T00:00:00.000Z" },
        // scope="trainer" maar toevallig mondaySchoolId="s1" — moet WEL uitgesloten blijven (scope-filter, niet alleen schoolId-filter).
        { id: 3, scope: "trainer", titel: "Persoonlijk bestand", categorie: "overig", storageKey: "trainer-bestanden/geheim-c.pdf", uploader: { id: 1, name: "Trainer A" }, mondaySchoolId: "s1", createdAt: "2026-08-18T00:00:00.000Z" },
      ],
    });
    const uitkomst = await haalAdminSchoolBestandenTab(payload, "s1");
    if (uitkomst.soort !== "ok") throw new Error("onverwacht niet_gevonden");
    expect(uitkomst.data).toHaveLength(1);
    expect(uitkomst.data[0]).toMatchObject({ id: 1, titel: "Handleiding A", uploaderNaam: "Trainer A" });
    expect(uitkomst.data[0]).not.toHaveProperty("storageKey");
  });
});

describe("performance — geen N+1 Monday-/Payload-fetches per school-tabblad (spec §5)", () => {
  it("haalAdminSchoolTrainingenTab roept haalTrainingenEnScholenVoorAlleTrainers precies ÉÉN keer aan, ongeacht het aantal trainers", async () => {
    const veelTrainers = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      name: `Trainer ${i + 1}`,
      email: `t${i + 1}@test.nl`,
      actief: true,
      mondayUitvoerderItemId: `uitv-${i + 1}`,
      mondayTrainerboardId: `board-${i + 1}`,
    }));
    const { payload } = maakFakePayload({ "trainer-accounts": veelTrainers });
    await haalAdminSchoolTrainingenTab(payload, "s1");
    expect(mockMondayOverzicht).toHaveBeenCalledTimes(1);
  });

  it("haalAdminSchoolVerslagenTab doet precies ÉÉN Payload-query, ongeacht het aantal resultaatrijen", async () => {
    const veelVerslagen = Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      trainer: 1,
      mondayTrainingId: `tr-${i}`,
      mondaySchoolId: "s1",
      trainingNaam: `Training ${i}`,
      status: "concept",
      bron: "portal",
      trainingUpdateStatus: "niet_verzonden",
      schoolUpdateStatus: "niet_verzonden",
      updatedAt: "2026-08-20T00:00:00.000Z",
    }));
    const { payload } = maakFakePayload({ "training-verslagen": veelVerslagen });
    const findSpy = vi.spyOn(payload, "find");
    await haalAdminSchoolVerslagenTab(payload, "s1");
    expect(findSpy).toHaveBeenCalledTimes(1);
  });

  it("haalAdminSchoolBestandenTab doet precies ÉÉN Payload-query, ongeacht het aantal resultaatrijen", async () => {
    const veelBestanden = Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      scope: "school",
      titel: `Bestand ${i}`,
      categorie: "curriculum",
      storageKey: `trainer-bestanden/x-${i}.pdf`,
      uploader: 1,
      mondaySchoolId: "s1",
      createdAt: "2026-08-20T00:00:00.000Z",
    }));
    const { payload } = maakFakePayload({ "trainer-bestanden": veelBestanden });
    const findSpy = vi.spyOn(payload, "find");
    await haalAdminSchoolBestandenTab(payload, "s1");
    expect(findSpy).toHaveBeenCalledTimes(1);
  });
});
