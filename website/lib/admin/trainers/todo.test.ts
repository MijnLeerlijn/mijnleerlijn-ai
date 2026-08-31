import { describe, it, expect } from "vitest";
import { bouwAdminTodoLijst } from "./todo";
import type { AdminOpenVerslag, AdminTrainerAccount } from "./aggregatie";
import type { AdminTrainerMondayOverzicht, TrainingMetSchool } from "@/lib/trainers/monday-links";

// Traineromgeving V2, Fase 4 (2026-08-24) — spec §5/§18: "exact dezelfde
// to-do-logica als lib/trainers/dashboard.ts, geen tweede definitie" +
// "dezelfde training mag maar één keer voorkomen." Deze tests bewijzen
// precies die twee eisen, plus trainerisolatie (elk item draagt het juiste
// trainerId/trainerNaam).

function trainer(overrides: Partial<AdminTrainerAccount> = {}): AdminTrainerAccount {
  return {
    id: 1,
    naam: "Anne Trainer",
    email: "anne@mijnleerlijn.test",
    actief: true,
    mondayUitvoerderItemId: "uitv-1",
    mondayTrainerboardId: "board-1",
    telefonieActief: false,
    ...overrides,
  };
}

function training(overrides: Partial<TrainingMetSchool> = {}): TrainingMetSchool {
  return {
    id: "training-1",
    naam: "Training 1",
    status: "gedaan",
    ruweStatusTekst: "Gedaan",
    datum: "2026-08-01",
    logboekIngevuld: false,
    trainerboardItemId: "tb-1",
    bron: "mijnleerlijn",
    schoolId: "school-1",
    schoolNaam: "School Een",
    ...overrides,
  };
}

function verslag(overrides: Partial<AdminOpenVerslag> = {}): AdminOpenVerslag {
  return {
    verslagId: 1,
    trainerId: 1,
    trainerNaam: "Anne Trainer",
    mondayTrainingId: "training-verslag-1",
    schoolId: "school-1",
    schoolNaam: "School Een",
    trainingNaam: "Training verslag 1",
    status: "concept",
    bron: "telefoon",
    wanneer: "2026-08-20T10:00:00.000Z",
    telefonieOntvangenOp: "2026-08-20T09:55:00.000Z",
    ...overrides,
  };
}

const legeMondayOverzicht: AdminTrainerMondayOverzicht = {
  trainingenPerTrainer: new Map(),
  scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
};

/**
 * Correctieronde Admin Traineromgeving (2026-08-25) — een openVerslag-record
 * telt alleen mee als de bijbehorende training ook echt in de (mock-)Monday-
 * trainingenset van die trainer voorkomt (training-actualiteit.ts). Bouwt een
 * overzicht met precies de trainingId's die een test nodig heeft, voor de
 * gegeven trainer se mondayUitvoerderItemId — puur testfixture, geen
 * productiecode.
 */
function overzichtMet(mondayUitvoerderItemId: string, trainingIds: string[]): AdminTrainerMondayOverzicht {
  return {
    trainingenPerTrainer: new Map([[mondayUitvoerderItemId, trainingIds.map((id) => training({ id }))]]),
    scholenPerTrainer: new Map(),
    scholen: new Map(),
    trainingenPerSchool: new Map(),
  };
}

describe("bouwAdminTodoLijst", () => {
  it("categoriseert een telefonisch concept correct, met ontvangenOp als 'wanneer'", () => {
    const v = verslag({ status: "concept", bron: "telefoon", telefonieOntvangenOp: "2026-08-20T09:55:00.000Z" });
    const todo = bouwAdminTodoLijst(overzichtMet("uitv-1", ["training-verslag-1"]), [v], [trainer()]);
    expect(todo).toHaveLength(1);
    expect(todo[0]).toMatchObject({ soort: "telefonisch_concept", wanneer: "2026-08-20T09:55:00.000Z", trainerId: 1, trainerNaam: "Anne Trainer" });
  });

  it("categoriseert gedeeltelijk/bevestigd als verslag_vastgelopen, met updatedAt als 'wanneer'", () => {
    const gedeeltelijk = verslag({ verslagId: 1, mondayTrainingId: "t1", status: "gedeeltelijk", bron: "portal", wanneer: "2026-08-19T00:00:00.000Z" });
    const bevestigd = verslag({ verslagId: 2, mondayTrainingId: "t2", status: "bevestigd", bron: "portal", wanneer: "2026-08-18T00:00:00.000Z" });
    const todo = bouwAdminTodoLijst(overzichtMet("uitv-1", ["t1", "t2"]), [gedeeltelijk, bevestigd], [trainer()]);
    expect(todo).toHaveLength(2);
    expect(todo.every((t) => t.soort === "verslag_vastgelopen")).toBe(true);
  });

  it("categoriseert een portalconcept als concept_gestart (nooit telefonisch_concept)", () => {
    const v = verslag({ status: "concept", bron: "portal" });
    const todo = bouwAdminTodoLijst(overzichtMet("uitv-1", ["training-verslag-1"]), [v], [trainer()]);
    expect(todo[0]?.soort).toBe("concept_gestart");
  });

  it("categoriseert een verlopen training zonder verslag als verslag_ontbreekt, via de Monday-kant", () => {
    const overzicht: AdminTrainerMondayOverzicht = {
      trainingenPerTrainer: new Map([["uitv-1", [training({ id: "t-verlopen", datum: "2020-01-01", status: "gedaan", logboekIngevuld: false })]]]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    };
    const todo = bouwAdminTodoLijst(overzicht, [], [trainer()]);
    expect(todo).toHaveLength(1);
    expect(todo[0]).toMatchObject({ soort: "verslag_ontbreekt", trainerId: 1, trainerNaam: "Anne Trainer", trainingId: "t-verlopen" });
  });

  it("dedupliceert op trainingId: dezelfde training in twee categorieën komt maar één keer voor, hoogste prioriteit wint", () => {
    // Dezelfde mondayTrainingId is zowel een telefonisch concept ALS
    // (kunstmatig, voor de test) via de Monday-kant een verlopen training
    // zonder verslag — telefonisch_concept moet winnen (hoogste prioriteit).
    const v = verslag({ status: "concept", bron: "telefoon", mondayTrainingId: "dezelfde-training" });
    const overzicht: AdminTrainerMondayOverzicht = {
      trainingenPerTrainer: new Map([["uitv-1", [training({ id: "dezelfde-training", datum: "2020-01-01", logboekIngevuld: false })]]]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    };
    const todo = bouwAdminTodoLijst(overzicht, [v], [trainer()]);
    expect(todo).toHaveLength(1);
    expect(todo[0]?.soort).toBe("telefonisch_concept");
  });

  it("prioriteitsvolgorde: telefonisch_concept > verslag_vastgelopen > concept_gestart > verslag_ontbreekt, ongeacht invoervolgorde", () => {
    const ontbreekt = training({ id: "t-ontbreekt", datum: "2020-01-01", logboekIngevuld: false });
    const gestartTraining = training({ id: "t-gestart" });
    const vastgelopenTraining = training({ id: "t-vastgelopen" });
    const telefonischTraining = training({ id: "t-telefonisch" });
    const overzicht: AdminTrainerMondayOverzicht = {
      trainingenPerTrainer: new Map([["uitv-1", [ontbreekt, gestartTraining, vastgelopenTraining, telefonischTraining]]]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    };
    const gestart = verslag({ verslagId: 1, mondayTrainingId: "t-gestart", status: "concept", bron: "portal" });
    const vastgelopen = verslag({ verslagId: 2, mondayTrainingId: "t-vastgelopen", status: "bevestigd", bron: "portal" });
    const telefonisch = verslag({ verslagId: 3, mondayTrainingId: "t-telefonisch", status: "concept", bron: "telefoon" });

    const todo = bouwAdminTodoLijst(overzicht, [gestart, vastgelopen, telefonisch], [trainer()]);
    expect(todo.map((t) => t.soort)).toEqual(["telefonisch_concept", "verslag_vastgelopen", "concept_gestart", "verslag_ontbreekt"]);
  });

  it("trainerisolatie: to-do-items van trainer A bevatten nooit trainer B se naam/ID", () => {
    const trainerA = trainer({ id: 1, naam: "Trainer A", mondayUitvoerderItemId: "uitv-a" });
    const trainerB = trainer({ id: 2, naam: "Trainer B", mondayUitvoerderItemId: "uitv-b" });
    const verslagVanA = verslag({ trainerId: 1, trainerNaam: "Trainer A", mondayTrainingId: "van-a", status: "concept", bron: "telefoon" });
    const verslagVanB = verslag({ trainerId: 2, trainerNaam: "Trainer B", mondayTrainingId: "van-b", status: "concept", bron: "telefoon" });
    const overzicht: AdminTrainerMondayOverzicht = {
      trainingenPerTrainer: new Map([
        ["uitv-a", [training({ id: "van-a" })]],
        ["uitv-b", [training({ id: "van-b" })]],
      ]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    };

    const todo = bouwAdminTodoLijst(overzicht, [verslagVanA, verslagVanB], [trainerA, trainerB]);
    const vanA = todo.find((t) => t.trainingId === "van-a");
    const vanB = todo.find((t) => t.trainingId === "van-b");
    expect(vanA).toMatchObject({ trainerId: 1, trainerNaam: "Trainer A" });
    expect(vanB).toMatchObject({ trainerId: 2, trainerNaam: "Trainer B" });
  });

  it("slaat een Monday-item zonder gekoppeld trainer-account defensief over (crasht niet)", () => {
    const overzicht: AdminTrainerMondayOverzicht = {
      trainingenPerTrainer: new Map([["onbekend-uitv-item", [training({ datum: "2020-01-01", logboekIngevuld: false })]]]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    };
    expect(() => bouwAdminTodoLijst(overzicht, [], [trainer({ mondayUitvoerderItemId: "uitv-1" })])).not.toThrow();
    expect(bouwAdminTodoLijst(overzicht, [], [trainer({ mondayUitvoerderItemId: "uitv-1" })])).toHaveLength(0);
  });

  it("geeft een lege lijst terug als er niets openstaat", () => {
    expect(bouwAdminTodoLijst(legeMondayOverzicht, [], [trainer()])).toEqual([]);
  });
});

// Correctieronde Admin Traineromgeving (2026-08-25, spec §1) — root cause:
// een openVerslag-record (telefonisch concept/vastgelopen/gestart) bleef
// voorheen onvoorwaardelijk als admin-To-do zichtbaar, ook nadat de
// bijbehorende training niet meer in Monday bestond/gekoppeld was bij die
// trainer (bv. verwijderd, of overgedragen aan een andere trainer).
describe("bouwAdminTodoLijst — actuele-trainingenwhitelist (spec §1)", () => {
  it("training bestaat nog bij de trainer → het conceptverslag mag als To do zichtbaar zijn", () => {
    const v = verslag({ status: "concept", bron: "telefoon", mondayTrainingId: "bestaat-nog" });
    const todo = bouwAdminTodoLijst(overzichtMet("uitv-1", ["bestaat-nog"]), [v], [trainer()]);
    expect(todo.map((t) => t.trainingId)).toContain("bestaat-nog");
  });

  it("training verwijderd/ontkoppeld uit Monday → oud telefonisch concept levert GEEN To do meer op, ook al bestaat het record nog (Wessel-scenario)", () => {
    const v = verslag({ status: "concept", bron: "telefoon", mondayTrainingId: "verwijderde-training" });
    // Monday geeft deze training niet meer terug voor deze trainer — trainingenPerTrainer leeg.
    const todo = bouwAdminTodoLijst(overzichtMet("uitv-1", []), [v], [trainer()]);
    expect(todo).toEqual([]);
  });

  it("een vastgelopen verslag van een verwijderde training levert ook geen To do meer op", () => {
    const v = verslag({ status: "bevestigd", bron: "portal", mondayTrainingId: "verwijderde-training" });
    const todo = bouwAdminTodoLijst(overzichtMet("uitv-1", []), [v], [trainer()]);
    expect(todo).toEqual([]);
  });

  it("een zelf-gestart concept van een verwijderde training levert ook geen To do meer op", () => {
    const v = verslag({ status: "concept", bron: "portal", mondayTrainingId: "verwijderde-training" });
    const todo = bouwAdminTodoLijst(overzichtMet("uitv-1", []), [v], [trainer()]);
    expect(todo).toEqual([]);
  });

  it("training inmiddels aan een ANDERE trainer gekoppeld → geen oude To do meer bij de oorspronkelijke trainer (record blijft op naam van de oorspronkelijke trainer staan)", () => {
    const trainerOorspronkelijk = trainer({ id: 1, naam: "Oorspronkelijke Trainer", mondayUitvoerderItemId: "uitv-1" });
    const trainerNieuw = trainer({ id: 2, naam: "Nieuwe Trainer", mondayUitvoerderItemId: "uitv-2" });
    // Het openVerslag-record verwijst nog naar trainer 1 (nooit met terugwerkende kracht omgezet).
    const v = verslag({ trainerId: 1, trainerNaam: "Oorspronkelijke Trainer", status: "concept", bron: "telefoon", mondayTrainingId: "overgedragen-training" });
    // Monday-realiteit: de training zit nu in trainer 2 se trainingenlijst, NIET meer in die van trainer 1.
    const overzicht: AdminTrainerMondayOverzicht = {
      trainingenPerTrainer: new Map([
        ["uitv-1", []],
        ["uitv-2", [training({ id: "overgedragen-training" })]],
      ]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    };
    const todo = bouwAdminTodoLijst(overzicht, [v], [trainerOorspronkelijk, trainerNieuw]);
    // Nooit meer bij trainer 1 (het telefonisch concept is stale voor hém).
    expect(todo.find((t) => t.trainerId === 1)).toBeUndefined();
    // De training zelf mag best een (nieuw, correct) to-do bij trainer 2 opleveren via de
    // gewone live-Monday-kant (verslag_ontbreekt) — dat is een ander, al bestaand mechanisme,
    // geen onderdeel van deze fix, en geen "verlies" van de training.
    expect(todo.find((t) => t.trainerId === 2)?.trainingId).toBe("overgedragen-training");
  });

  it("string/number-typeverschil in mondayTrainingId breekt de match niet (spec: 'geen fragiele === tussen 123 en \"123\"')", () => {
    // AdminOpenVerslag.mondayTrainingId is in de praktijk altijd tekst (Payload text-veld), maar
    // deze test dwingt een numerieke waarde af om de normalisatie zelf te bewijzen, los van die aanname.
    // Bewust een training-ID dat verder nergens anders in dit overzicht voorkomt (uitsluitend de
    // whitelist-normalisatie zelf wordt hier getoetst, niet de — losstaande — dedupgarantie).
    const v = verslag({ status: "concept", bron: "telefoon", mondayTrainingId: 123 as unknown as string });
    const todo = bouwAdminTodoLijst(overzichtMet("uitv-1", ["123"]), [v], [trainer()]);
    expect(todo.some((t) => t.soort === "telefonisch_concept")).toBe(true);
  });
});
