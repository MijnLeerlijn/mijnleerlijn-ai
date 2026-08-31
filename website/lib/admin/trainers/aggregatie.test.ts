import { describe, it, expect } from "vitest";
import { maakFakePayload } from "@/lib/support/fake-payload";
import {
  haalOpenVerslagenVoorAlleTrainers,
  haalRecenteVerslagActiviteitVoorAlleTrainers,
  haalMislukteTelefonieOproepenVoorAlleTrainers,
  haalLogboekitemsVoorAlleTrainers,
  haalKennisvragenSinds,
  haalAlleTrainerAccounts,
  haalAlleAanvullendeTrainingen,
} from "./aggregatie";

// Traineromgeving V2, Fase 4 (2026-08-24) — bewijst dat elke admin-brede
// query hier EXACT dezelfde statuscriteria hanteert als de bestaande
// single-trainer-functies in lib/trainers/verslag.ts/oproep-state.ts (spec
// §19: alleen lezen/spiegelen, geen nieuwe interpretatie), en dat het
// trainer-filter bewust ONTBREEKT (admin-breed = alle trainers in één keer).
//
// Voor haalOpenVerslagenVoorAlleTrainers (depth:1) worden trainer/
// telefonieOproep hieronder als AL-GEPOPULEERDE objecten geseed — de fake
// Payload-nabootsing (lib/support/fake-payload.ts) simuleert geen echte
// depth-gebaseerde populatie, maar geeft altijd exact terug wat er geseed is,
// dus dit oefent de "object vs. kaal getal"-afhandeling in aggregatie.ts nog
// steeds correct uit (zelfde precedent als elders in dit project waar depth:1
// niet apart wordt nagebootst).

describe("haalOpenVerslagenVoorAlleTrainers", () => {
  it("bevat concept/gedeeltelijk/bevestigd, maar nooit voltooid — over alle trainers", async () => {
    const { payload } = maakFakePayload({
      "training-verslagen": [
        { id: 1, trainer: { id: 10, name: "Trainer A" }, mondayTrainingId: "t1", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "T1", status: "concept", bron: "portal", updatedAt: "2026-08-20T00:00:00.000Z", telefonieOproep: null },
        { id: 2, trainer: { id: 20, name: "Trainer B" }, mondayTrainingId: "t2", mondaySchoolId: "s2", schoolNaam: "School B", trainingNaam: "T2", status: "gedeeltelijk", bron: "portal", updatedAt: "2026-08-19T00:00:00.000Z", telefonieOproep: null },
        { id: 3, trainer: { id: 10, name: "Trainer A" }, mondayTrainingId: "t3", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "T3", status: "bevestigd", bron: "portal", updatedAt: "2026-08-18T00:00:00.000Z", telefonieOproep: null },
        { id: 4, trainer: { id: 10, name: "Trainer A" }, mondayTrainingId: "t4", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "T4", status: "voltooid", bron: "portal", updatedAt: "2026-08-17T00:00:00.000Z", telefonieOproep: null },
      ],
    });
    const resultaat = await haalOpenVerslagenVoorAlleTrainers(payload);
    expect(resultaat.map((r) => r.verslagId).sort()).toEqual([1, 2, 3]);
    expect(resultaat.some((r) => r.status === "voltooid")).toBe(false);
  });

  it("leidt trainerId/trainerNaam af uit het gepopuleerde trainer-object", async () => {
    const { payload } = maakFakePayload({
      "training-verslagen": [{ id: 1, trainer: { id: 42, name: "Wessel" }, mondayTrainingId: "t1", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "T1", status: "concept", bron: "portal", updatedAt: "2026-08-20T00:00:00.000Z", telefonieOproep: null }],
    });
    const [regel] = await haalOpenVerslagenVoorAlleTrainers(payload);
    expect(regel).toMatchObject({ trainerId: 42, trainerNaam: "Wessel" });
  });

  it("vult telefonieOntvangenOp alleen bij bron=telefoon, via het gepopuleerde telefonieOproep-object", async () => {
    const { payload } = maakFakePayload({
      "training-verslagen": [
        {
          id: 1,
          trainer: { id: 10, name: "Trainer A" },
          mondayTrainingId: "t1",
          mondaySchoolId: "s1",
          schoolNaam: "School A",
          trainingNaam: "T1",
          status: "concept",
          bron: "telefoon",
          updatedAt: "2026-08-20T00:00:00.000Z",
          telefonieOproep: { id: 99, ontvangenOp: "2026-08-20T09:00:00.000Z" },
        },
        { id: 2, trainer: { id: 10, name: "Trainer A" }, mondayTrainingId: "t2", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "T2", status: "concept", bron: "portal", updatedAt: "2026-08-20T00:00:00.000Z", telefonieOproep: null },
      ],
    });
    const resultaat = await haalOpenVerslagenVoorAlleTrainers(payload);
    expect(resultaat.find((r) => r.verslagId === 1)?.telefonieOntvangenOp).toBe("2026-08-20T09:00:00.000Z");
    expect(resultaat.find((r) => r.verslagId === 2)?.telefonieOntvangenOp).toBeNull();
  });
});

describe("haalRecenteVerslagActiviteitVoorAlleTrainers", () => {
  it("bevat ALLE statussen inclusief voltooid (i.t.t. de open-variant)", async () => {
    const { payload } = maakFakePayload({
      "training-verslagen": [
        { id: 1, trainer: 10, mondayTrainingId: "t1", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "T1", status: "voltooid", bron: "portal", updatedAt: "2026-08-20T00:00:00.000Z" },
        { id: 2, trainer: 10, mondayTrainingId: "t2", mondaySchoolId: "s1", schoolNaam: "School A", trainingNaam: "T2", status: "concept", bron: "portal", updatedAt: "2026-08-19T00:00:00.000Z" },
      ],
    });
    const resultaat = await haalRecenteVerslagActiviteitVoorAlleTrainers(payload);
    expect(resultaat.map((r) => r.status).sort()).toEqual(["concept", "voltooid"]);
  });
});

describe("haalMislukteTelefonieOproepenVoorAlleTrainers", () => {
  it("bevat uitsluitend status=mislukt, over alle trainers", async () => {
    const { payload } = maakFakePayload({
      "trainer-telefonie-oproepen": [
        { id: 1, trainer: 10, status: "mislukt", foutcode: "opname_mislukt", foutmelding: "Geen opname ontvangen", afgerondOp: "2026-08-20T00:00:00.000Z", gekozenSchoolNaam: null, gekozenTrainingNaam: null },
        { id: 2, trainer: 20, status: "concept_klaar", foutcode: null, foutmelding: null, afgerondOp: "2026-08-19T00:00:00.000Z", gekozenSchoolNaam: null, gekozenTrainingNaam: null },
        { id: 3, trainer: 10, status: "opname_verwacht", foutcode: null, foutmelding: null, afgerondOp: null, gekozenSchoolNaam: null, gekozenTrainingNaam: null },
      ],
    });
    const resultaat = await haalMislukteTelefonieOproepenVoorAlleTrainers(payload);
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0]).toMatchObject({ oproepId: 1, trainerId: 10, foutcode: "opname_mislukt" });
  });

  it("bevat nooit audio-/opnamevelden (recordingProviderId, opnameOphaalReferentie)", async () => {
    const { payload } = maakFakePayload({
      "trainer-telefonie-oproepen": [
        {
          id: 1,
          trainer: 10,
          status: "mislukt",
          foutcode: "opname_mislukt",
          foutmelding: "fout",
          afgerondOp: "2026-08-20T00:00:00.000Z",
          gekozenSchoolNaam: null,
          gekozenTrainingNaam: null,
          recordingProviderId: "geheim-provider-id",
          opnameOphaalReferentie: "https://geheime-url",
        },
      ],
    });
    const [regel] = await haalMislukteTelefonieOproepenVoorAlleTrainers(payload);
    expect(regel).not.toHaveProperty("recordingProviderId");
    expect(regel).not.toHaveProperty("opnameOphaalReferentie");
  });
});

describe("haalLogboekitemsVoorAlleTrainers", () => {
  it("geeft logboekitems van alle trainers terug, nieuwste eerst", async () => {
    const { payload } = maakFakePayload({
      "trainer-logboek-items": [
        { id: 1, trainer: 10, mondaySchoolId: "s1", schoolNaam: "School A", type: "notitie", occurredAt: "2026-08-19T00:00:00.000Z", tekst: "oud", mondayTrainingId: null, trainingNaam: null, createdAt: "2026-08-19T00:00:00.000Z" },
        { id: 2, trainer: 20, mondaySchoolId: "s2", schoolNaam: "School B", type: "helpdesk", occurredAt: "2026-08-20T00:00:00.000Z", tekst: "nieuw", mondayTrainingId: null, trainingNaam: null, createdAt: "2026-08-20T00:00:00.000Z" },
      ],
    });
    const resultaat = await haalLogboekitemsVoorAlleTrainers(payload);
    expect(resultaat.map((r) => r.trainerId)).toEqual([20, 10]);
  });
});

describe("haalKennisvragenSinds", () => {
  it("filtert op createdAt >= sinds, over alle trainers", async () => {
    const { payload } = maakFakePayload({
      "trainer-kennisvragen": [
        { id: 1, trainer: 10, antwoordGevonden: true, createdAt: "2026-08-01T00:00:00.000Z" },
        { id: 2, trainer: 20, antwoordGevonden: false, createdAt: "2026-08-20T00:00:00.000Z" },
      ],
    });
    const resultaat = await haalKennisvragenSinds(payload, new Date("2026-08-15T00:00:00.000Z"));
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0]).toMatchObject({ trainerId: 20, antwoordGevonden: false });
  });

  it("bevat nooit vraag-/antwoordtekst (die bestaat sowieso niet op deze collectie)", async () => {
    const { payload } = maakFakePayload({ "trainer-kennisvragen": [{ id: 1, trainer: 10, antwoordGevonden: true, createdAt: "2026-08-20T00:00:00.000Z" }] });
    const [regel] = await haalKennisvragenSinds(payload, new Date("2026-01-01T00:00:00.000Z"));
    expect(Object.keys(regel!).sort()).toEqual(["antwoordGevonden", "createdAt", "trainerId"]);
  });
});

describe("haalAlleTrainerAccounts", () => {
  it("geeft alle trainer-accounts terug, inclusief actief/inactief", async () => {
    const { payload } = maakFakePayload({
      "trainer-accounts": [
        { id: 1, name: "Actieve Trainer", email: "a@test.nl", actief: true, mondayUitvoerderItemId: "uitv-1", mondayTrainerboardId: "board-1", telefonieActief: false },
        { id: 2, name: "Inactieve Trainer", email: "b@test.nl", actief: false, mondayUitvoerderItemId: "uitv-2", mondayTrainerboardId: "board-2", telefonieActief: false },
      ],
    });
    const resultaat = await haalAlleTrainerAccounts(payload);
    expect(resultaat).toHaveLength(2);
    expect(resultaat.find((t) => t.id === 2)?.actief).toBe(false);
  });
});

// Upsell-ronde (2026-09-02, spec §10/§11/§12) — admin-brede aanvullende
// trainingen, zelfde ÉÉN-query-nooit-een-lus-over-trainers-principe als elke
// andere functie hierboven.
describe("haalAlleAanvullendeTrainingen", () => {
  it("geeft alle aanvullende trainingen terug, over alle trainers, in één query", async () => {
    const { payload } = maakFakePayload({
      "aanvullende-trainingen": [
        { id: 1, trainer: 10, mondaySchoolId: "s1", schoolNaam: "School A", naam: "Rekenen coaching", datum: "2026-09-05T00:00:00.000Z" },
        { id: 2, trainer: 20, mondaySchoolId: "s2", schoolNaam: "School B", naam: "Taal verdieping", datum: "2026-09-06T00:00:00.000Z" },
      ],
    });
    const resultaat = await haalAlleAanvullendeTrainingen(payload);
    expect(resultaat).toHaveLength(2);
    expect(resultaat.map((r) => r.trainerId).sort()).toEqual([10, 20]);
  });

  it("normaliseert datum tot een kale YYYY-MM-DD (net als een Monday-trainingdatum)", async () => {
    const { payload } = maakFakePayload({
      "aanvullende-trainingen": [{ id: 1, trainer: 10, mondaySchoolId: "s1", schoolNaam: "School A", naam: "Rekenen coaching", datum: "2026-09-05T00:00:00.000Z" }],
    });
    const [regel] = await haalAlleAanvullendeTrainingen(payload);
    expect(regel?.datum).toBe("2026-09-05");
  });

  it("schoolNaam valt terug op null wanneer die niet is opgeslagen", async () => {
    const { payload } = maakFakePayload({
      "aanvullende-trainingen": [{ id: 1, trainer: 10, mondaySchoolId: "s1", schoolNaam: null, naam: "Rekenen coaching", datum: "2026-09-05T00:00:00.000Z" }],
    });
    const [regel] = await haalAlleAanvullendeTrainingen(payload);
    expect(regel?.schoolNaam).toBeNull();
  });
});
