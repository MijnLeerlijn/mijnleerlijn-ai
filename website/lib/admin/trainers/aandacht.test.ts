import { describe, it, expect } from "vitest";
import { bouwAdminAandachtOverzicht, OUD_CONCEPT_DAGEN, VEEL_OUDE_VERSLAGEN_DREMPEL } from "./aandacht";
import type { AdminOpenVerslag, AdminMislukteTelefonieOproep, AdminTrainerAccount } from "./aggregatie";

// Traineromgeving V2, Fase 4 (2026-08-24) — spec §7/§18: "telefonie
// definitief mislukt; Monday-writeback vastgelopen; oude open concepten;
// eventueel trainer met veel oude oningevulde verslagen. Geen arbitraire
// nieuwe probleemstatussen zonder bestaande data." NU = een vaste referentie
// (2026-08-24T12:00:00Z) i.p.v. new Date(), zodat "hoeveel dagen oud" hier
// deterministisch getest kan worden.

const NU = new Date("2026-08-24T12:00:00.000Z");

function trainer(overrides: Partial<AdminTrainerAccount> = {}): AdminTrainerAccount {
  return { id: 1, naam: "Anne Trainer", email: "anne@mijnleerlijn.test", actief: true, mondayUitvoerderItemId: "uitv-1", mondayTrainerboardId: "board-1", telefonieActief: false, ...overrides };
}

function verslag(overrides: Partial<AdminOpenVerslag> = {}): AdminOpenVerslag {
  return {
    verslagId: 1,
    trainerId: 1,
    trainerNaam: "Anne Trainer",
    mondayTrainingId: "t1",
    schoolId: "school-1",
    schoolNaam: "School Een",
    trainingNaam: "Training 1",
    status: "concept",
    bron: "portal",
    wanneer: "2026-08-24T00:00:00.000Z",
    telefonieOntvangenOp: null,
    ...overrides,
  };
}

function misluktOproep(overrides: Partial<AdminMislukteTelefonieOproep> = {}): AdminMislukteTelefonieOproep {
  return { oproepId: 1, trainerId: 1, foutcode: "onbekende_fout", foutmelding: "Iets ging mis", afgerondOp: "2026-08-20T00:00:00.000Z", gekozenMondaySchoolId: null, gekozenSchoolNaam: null, gekozenTrainingNaam: null, ...overrides };
}

function dagenGeleden(dagen: number): string {
  return new Date(NU.getTime() - dagen * 24 * 60 * 60 * 1000).toISOString();
}

describe("bouwAdminAandachtOverzicht", () => {
  it("neemt een definitief mislukte telefonie-oproep altijd op, ongeacht ouderdom", () => {
    const overzicht = bouwAdminAandachtOverzicht([], [misluktOproep()], [trainer()], NU);
    expect(overzicht.items).toHaveLength(1);
    expect(overzicht.items[0]?.soort).toBe("telefonie_mislukt");
  });

  it("neemt status=gedeeltelijk/bevestigd altijd op (Monday-writeback vastgelopen), ongeacht ouderdom", () => {
    const vers = verslag({ status: "gedeeltelijk", wanneer: dagenGeleden(1) });
    const overzicht = bouwAdminAandachtOverzicht([vers], [], [trainer()], NU);
    expect(overzicht.items).toHaveLength(1);
    expect(overzicht.items[0]?.soort).toBe("verslag_vastgelopen");
  });

  it(`neemt een concept ouder dan OUD_CONCEPT_DAGEN (${OUD_CONCEPT_DAGEN}) op als concept_oud`, () => {
    const oudConcept = verslag({ status: "concept", wanneer: dagenGeleden(OUD_CONCEPT_DAGEN + 1) });
    const overzicht = bouwAdminAandachtOverzicht([oudConcept], [], [trainer()], NU);
    expect(overzicht.items).toHaveLength(1);
    expect(overzicht.items[0]?.soort).toBe("concept_oud");
  });

  it("negeert een vers concept (jonger dan OUD_CONCEPT_DAGEN)", () => {
    const versConcept = verslag({ status: "concept", wanneer: dagenGeleden(1) });
    const overzicht = bouwAdminAandachtOverzicht([versConcept], [], [trainer()], NU);
    expect(overzicht.items).toHaveLength(0);
  });

  it("negeert een voltooid verslag (geen aandachtscategorie voor voltooide verslagen)", () => {
    // haalOpenVerslagenVoorAlleTrainers levert nooit status="voltooid" — deze
    // test bevestigt dat een eventueel toch meegegeven voltooide rij hier
    // sowieso in geen van de drie categorieën valt (defensief).
    const voltooid = { ...verslag({ wanneer: dagenGeleden(30) }), status: "voltooid" as unknown as AdminOpenVerslag["status"] };
    const overzicht = bouwAdminAandachtOverzicht([voltooid], [], [trainer()], NU);
    expect(overzicht.items).toHaveLength(0);
  });

  it("sorteert items oudste/langst-lopende eerst (meest urgent)", () => {
    const nieuw = misluktOproep({ oproepId: 1, afgerondOp: dagenGeleden(1) });
    const oud = misluktOproep({ oproepId: 2, afgerondOp: dagenGeleden(10) });
    const overzicht = bouwAdminAandachtOverzicht([], [nieuw, oud], [trainer()], NU);
    expect(overzicht.items.map((i) => i.wanneer)).toEqual([oud.afgerondOp, nieuw.afgerondOp]);
  });

  it(`markeert een trainer met >= ${VEEL_OUDE_VERSLAGEN_DREMPEL} vastgelopen/oude verslagen in trainersMetVeelOudeVerslagen`, () => {
    const verslagen = Array.from({ length: VEEL_OUDE_VERSLAGEN_DREMPEL }, (_, i) => verslag({ verslagId: i, mondayTrainingId: `t${i}`, status: "gedeeltelijk" }));
    const overzicht = bouwAdminAandachtOverzicht(verslagen, [], [trainer()], NU);
    expect(overzicht.trainersMetVeelOudeVerslagen).toEqual([{ trainerId: 1, trainerNaam: "Anne Trainer", aantal: VEEL_OUDE_VERSLAGEN_DREMPEL }]);
  });

  it("markeert een trainer NIET als het aantal onder de drempel blijft", () => {
    const verslagen = Array.from({ length: VEEL_OUDE_VERSLAGEN_DREMPEL - 1 }, (_, i) => verslag({ verslagId: i, mondayTrainingId: `t${i}`, status: "gedeeltelijk" }));
    const overzicht = bouwAdminAandachtOverzicht(verslagen, [], [trainer()], NU);
    expect(overzicht.trainersMetVeelOudeVerslagen).toEqual([]);
  });

  it("een oud, telefonisch concept telt niet dubbel mee als zowel telefonisch als 'oud' (één categorie per rij)", () => {
    const oudTelefonisch = verslag({ status: "concept", bron: "telefoon", wanneer: dagenGeleden(OUD_CONCEPT_DAGEN + 1) });
    const overzicht = bouwAdminAandachtOverzicht([oudTelefonisch], [], [trainer()], NU);
    expect(overzicht.items).toHaveLength(1);
  });
});
