import { describe, it, expect } from "vitest";
import { bouwAdminTrainingenLijst } from "./trainingen";
import { codeerAanvullendeTrainingId } from "@/lib/trainers/aanvullende-trainingen";
import type { AdminVerslagActiviteit, AdminTrainerAccount, AdminAanvullendeTraining } from "./aggregatie";
import type { AdminTrainerMondayOverzicht, TrainingMetSchool } from "@/lib/trainers/monday-links";

// Traineromgeving V2, Fase 4 (2026-08-24) — spec §4/§18: "trainers
// gecombineerd, filters trainer/school/status, verslagstatus correct
// gekoppeld." Deze tests bewijzen de samenvoeging + de verslagstatus-join;
// filtering zelf gebeurt in de API-route (app/api/admin/trainers/trainingen)
// en wordt daar getest.

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

function aanvullendeTraining(overrides: Partial<AdminAanvullendeTraining> = {}): AdminAanvullendeTraining {
  return { id: 1, trainerId: 1, mondaySchoolId: "school-1", schoolNaam: "School Een", naam: "Aanvullende training", datum: "2026-09-01", ...overrides };
}

function verslagActiviteit(overrides: Partial<AdminVerslagActiviteit> = {}): AdminVerslagActiviteit {
  return {
    verslagId: 1,
    trainerId: 1,
    mondayTrainingId: "training-1",
    schoolId: "school-1",
    schoolNaam: "School Een",
    trainingNaam: "Training 1",
    bron: "portal",
    status: "bevestigd",
    wanneer: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("bouwAdminTrainingenLijst", () => {
  it("produceert één rij per (trainer, training)-paar, ook als een training twee trainers heeft", () => {
    const trainerA = trainer({ id: 1, naam: "Trainer A", mondayUitvoerderItemId: "uitv-a" });
    const trainerB = trainer({ id: 2, naam: "Trainer B", mondayUitvoerderItemId: "uitv-b" });
    const overzicht: AdminTrainerMondayOverzicht = {
      trainingenPerTrainer: new Map([
        ["uitv-a", [training({ id: "gedeelde-training" })]],
        ["uitv-b", [training({ id: "gedeelde-training" })]],
      ]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    };
    const rijen = bouwAdminTrainingenLijst(overzicht, [trainerA, trainerB], []);
    expect(rijen).toHaveLength(2);
    expect(rijen.map((r) => r.trainerNaam).sort()).toEqual(["Trainer A", "Trainer B"]);
    expect(rijen.every((r) => r.trainingId === "gedeelde-training")).toBe(true);
  });

  it("koppelt de verslagstatus/bron van de juiste trainer aan de juiste training (trainerisolatie)", () => {
    const trainerA = trainer({ id: 1, naam: "Trainer A", mondayUitvoerderItemId: "uitv-a" });
    const trainerB = trainer({ id: 2, naam: "Trainer B", mondayUitvoerderItemId: "uitv-b" });
    const overzicht: AdminTrainerMondayOverzicht = {
      trainingenPerTrainer: new Map([
        ["uitv-a", [training({ id: "training-a" })]],
        ["uitv-b", [training({ id: "training-b" })]],
      ]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    };
    const verslagA = verslagActiviteit({ trainerId: 1, mondayTrainingId: "training-a", status: "voltooid", bron: "portal" });
    const verslagB = verslagActiviteit({ trainerId: 2, mondayTrainingId: "training-b", status: "concept", bron: "telefoon" });

    const rijen = bouwAdminTrainingenLijst(overzicht, [trainerA, trainerB], [verslagA, verslagB]);
    const rijA = rijen.find((r) => r.trainingId === "training-a");
    const rijB = rijen.find((r) => r.trainingId === "training-b");
    expect(rijA).toMatchObject({ verslagStatus: "voltooid", verslagBron: "portal" });
    expect(rijB).toMatchObject({ verslagStatus: "concept", verslagBron: "telefoon" });
  });

  it("toont verslagStatus/verslagBron als null wanneer er nog geen verslagrij bestaat", () => {
    const overzicht: AdminTrainerMondayOverzicht = { trainingenPerTrainer: new Map([["uitv-1", [training()]]]), scholenPerTrainer: new Map(), scholen: new Map(), trainingenPerSchool: new Map() };
    const rijen = bouwAdminTrainingenLijst(overzicht, [trainer()], []);
    expect(rijen[0]).toMatchObject({ verslagStatus: null, verslagBron: null });
  });

  it("leidt de weergavestatus af via bepaalWeergaveStatus (bv. geannuleerd wint altijd)", () => {
    const overzicht: AdminTrainerMondayOverzicht = {
      trainingenPerTrainer: new Map([["uitv-1", [training({ status: "geannuleerd", datum: "2020-01-01" })]]]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    };
    const rijen = bouwAdminTrainingenLijst(overzicht, [trainer()], []);
    expect(rijen[0]?.weergaveStatus).toBe("geannuleerd");
  });

  it("slaat een Monday-item zonder gekoppeld trainer-account defensief over", () => {
    const overzicht: AdminTrainerMondayOverzicht = { trainingenPerTrainer: new Map([["onbekend", [training()]]]), scholenPerTrainer: new Map(), scholen: new Map(), trainingenPerSchool: new Map() };
    expect(bouwAdminTrainingenLijst(overzicht, [trainer({ mondayUitvoerderItemId: "uitv-1" })], [])).toEqual([]);
  });

  it("sorteert aflopend op datum (meest recent eerst)", () => {
    const overzicht: AdminTrainerMondayOverzicht = {
      trainingenPerTrainer: new Map([
        [
          "uitv-1",
          [training({ id: "oud", datum: "2026-01-01" }), training({ id: "nieuw", datum: "2026-12-01" }), training({ id: "midden", datum: "2026-06-01" })],
        ],
      ]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    };
    const rijen = bouwAdminTrainingenLijst(overzicht, [trainer()], []);
    expect(rijen.map((r) => r.trainingId)).toEqual(["nieuw", "midden", "oud"]);
  });

  it("elke mijnleerlijn-rij krijgt bron='mijnleerlijn' (van de Monday-training zelf, niet hardcoded)", () => {
    const overzicht: AdminTrainerMondayOverzicht = { trainingenPerTrainer: new Map([["uitv-1", [training()]]]), scholenPerTrainer: new Map(), scholen: new Map(), trainingenPerSchool: new Map() };
    const rijen = bouwAdminTrainingenLijst(overzicht, [trainer()], []);
    expect(rijen[0]?.bron).toBe("mijnleerlijn");
  });
});

// Upsell-ronde (2026-09-02, spec §10/§11/§12) — het optionele vierde
// argument (aanvullende trainingen, aggregatie.ts se
// haalAlleAanvullendeTrainingen). Bewust een los describe-blok: dit is een
// TWEEDE, onafhankelijke lus binnen bouwAdminTrainingenLijst (aanvullende
// trainingen bestaan niet in mondayOverzicht.trainingenPerTrainer), met een
// eigen trainer-koppeling (op Payload-trainerId, niet mondayUitvoerderItemId).
describe("bouwAdminTrainingenLijst — aanvullende trainingen (Upsell-ronde)", () => {
  const LEGE_OVERZICHT: AdminTrainerMondayOverzicht = { trainingenPerTrainer: new Map(), scholenPerTrainer: new Map(), scholen: new Map(), trainingenPerSchool: new Map() };

  it("voegt een aanvullende training toe met bron='aanvullend' en een gecodeerd trainingId", () => {
    const rijen = bouwAdminTrainingenLijst(LEGE_OVERZICHT, [trainer()], [], [aanvullendeTraining({ id: 42, naam: "Rekenen coaching" })]);
    expect(rijen).toHaveLength(1);
    expect(rijen[0]).toMatchObject({ trainingId: codeerAanvullendeTrainingId(42), trainingNaam: "Rekenen coaching", bron: "aanvullend", schoolId: "school-1", schoolNaam: "School Een", trainerId: 1, trainerNaam: "Anne Trainer" });
  });

  it("koppelt de verslagstatus via het gecodeerde trainingId (dezelfde sleutel als verslag.ts se resolveerTrainingVoorMutatie gebruikt)", () => {
    const gecodeerd = codeerAanvullendeTrainingId(42);
    const verslag = verslagActiviteit({ trainerId: 1, mondayTrainingId: gecodeerd, status: "bevestigd", bron: "portal" });
    const rijen = bouwAdminTrainingenLijst(LEGE_OVERZICHT, [trainer()], [verslag], [aanvullendeTraining({ id: 42 })]);
    expect(rijen[0]).toMatchObject({ verslagStatus: "bevestigd", verslagBron: "portal" });
  });

  it("weergaveStatus: geen live Monday-logboek-checkbox — een bevestigd/voltooid verslag telt als 'logboek ingevuld'", () => {
    const gecodeerd = codeerAanvullendeTrainingId(42);
    const verslag = verslagActiviteit({ trainerId: 1, mondayTrainingId: gecodeerd, status: "voltooid" });
    const rijen = bouwAdminTrainingenLijst(LEGE_OVERZICHT, [trainer()], [verslag], [aanvullendeTraining({ id: 42, datum: "2020-01-01" })]);
    expect(rijen[0]?.weergaveStatus).toBe("gedaan"); // datum in het verleden + logboekIngevuld -> "gedaan" (training-weergave.ts)
  });

  it("weergaveStatus: zonder bevestigd verslag en een datum in het verleden -> 'verslag_nog_invullen'", () => {
    const rijen = bouwAdminTrainingenLijst(LEGE_OVERZICHT, [trainer()], [], [aanvullendeTraining({ id: 42, datum: "2020-01-01" })]);
    expect(rijen[0]?.weergaveStatus).toBe("verslag_nog_invullen");
  });

  it("slaat een aanvullende training van een onbekend (bv. verwijderd) traineraccount defensief over", () => {
    const rijen = bouwAdminTrainingenLijst(LEGE_OVERZICHT, [trainer({ id: 1 })], [], [aanvullendeTraining({ id: 42, trainerId: 999 })]);
    expect(rijen).toEqual([]);
  });

  it("mijnleerlijn- en aanvullende trainingen komen samen in één, chronologisch gesorteerde lijst", () => {
    const overzicht: AdminTrainerMondayOverzicht = { trainingenPerTrainer: new Map([["uitv-1", [training({ id: "ml-1", datum: "2026-01-01" })]]]), scholenPerTrainer: new Map(), scholen: new Map(), trainingenPerSchool: new Map() };
    const rijen = bouwAdminTrainingenLijst(overzicht, [trainer()], [], [aanvullendeTraining({ id: 42, datum: "2026-06-01" })]);
    expect(rijen.map((r) => r.bron)).toEqual(["aanvullend", "mijnleerlijn"]); // 2026-06 vóór 2026-01, aflopend op datum
  });

  it("zonder vierde argument blijft het bestaande, uitsluitend-Monday gedrag exact hetzelfde (backwards compatible)", () => {
    const overzicht: AdminTrainerMondayOverzicht = { trainingenPerTrainer: new Map([["uitv-1", [training()]]]), scholenPerTrainer: new Map(), scholen: new Map(), trainingenPerSchool: new Map() };
    const rijen = bouwAdminTrainingenLijst(overzicht, [trainer()], []);
    expect(rijen).toHaveLength(1);
    expect(rijen[0]?.bron).toBe("mijnleerlijn");
  });
});
