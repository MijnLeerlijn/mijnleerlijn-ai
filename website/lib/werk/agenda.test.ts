import { describe, it, expect } from "vitest";
import { bepaalWerkAgenda, type TaakInvoer } from "./agenda";
import type { AgendaActieInvoer, SchoolMetMondayPlanning } from "@/lib/sales/vandaag";
import type { GoogleCalendarEvent } from "@/lib/google-calendar/api";
import { vandaagIso, voegDagenToe } from "@/lib/sales/format-datum";

const VANDAAG = vandaagIso();
const GISTEREN = voegDagenToe(VANDAAG, -1);

function taak(overrides: Partial<TaakInvoer> & { id: number }): TaakInvoer {
  return {
    titel: `Taak ${overrides.id}`,
    beschrijving: null,
    datum: null,
    tijd: null,
    status: "open",
    schoolId: null,
    schoolName: null,
    ...overrides,
  };
}

function salesActie(overrides: Partial<AgendaActieInvoer> & { schoolId: number; dueDate: string }): AgendaActieInvoer {
  return {
    id: overrides.schoolId * 1000 + 1,
    description: "Bel deze school",
    type: "bellen",
    schoolName: `School ${overrides.schoolId}`,
    relatiestatus: "Prospect",
    plaats: null,
    ...overrides,
  };
}

function schoolMetPlanning(overrides: Partial<SchoolMetMondayPlanning> & { id: number }): SchoolMetMondayPlanning {
  return {
    schoolName: `School ${overrides.id}`,
    relatiestatus: "Lead",
    plaats: null,
    actief: true,
    mondayVolgendeActieDatum: null,
    cachedGeplandeActieTekst: null,
    ...overrides,
  };
}

function agendaEvent(overrides: Partial<GoogleCalendarEvent> & { id: string; datum: string }): GoogleCalendarEvent {
  return {
    titel: `Event ${overrides.id}`,
    volledigeDag: false,
    tijd: null,
    eindTijd: null,
    ...overrides,
  };
}

describe("bepaalWerkAgenda — Mijn Werk V1: personal-tasks als derde, onafhankelijke bron naast sales/monday", () => {
  it("een taak met een datum verschijnt op die datum, met bron: 'taak'", () => {
    const datum = voegDagenToe(VANDAAG, 3);
    const weergave = bepaalWerkAgenda([taak({ id: 1, titel: "Presentatie afmaken", datum })], [], [], datum);

    expect(weergave.opGekozenDatum).toHaveLength(1);
    expect(weergave.opGekozenDatum[0]).toMatchObject({ bron: "taak", id: 1, titel: "Presentatie afmaken", datum });
  });

  it("een taak zonder datum verschijnt nooit in opGekozenDatum, ook niet op vandaag — uitsluitend in ongepland", () => {
    const weergave = bepaalWerkAgenda([taak({ id: 1, datum: null })], [], [], VANDAAG);

    expect(weergave.opGekozenDatum).toEqual([]);
    expect(weergave.ongepland).toHaveLength(1);
    expect(weergave.ongepland[0]!.id).toBe(1);
  });

  it("ongepland is onafhankelijk van de gekozen datum — dezelfde lijst ongeacht welke dag bekeken wordt", () => {
    const taken = [taak({ id: 1, datum: null })];
    const opVandaag = bepaalWerkAgenda(taken, [], [], VANDAAG);
    const opAndereDag = bepaalWerkAgenda(taken, [], [], voegDagenToe(VANDAAG, 10));

    expect(opVandaag.ongepland).toHaveLength(1);
    expect(opAndereDag.ongepland).toHaveLength(1);
  });

  it("een taak met een datum in het verleden verschijnt uitsluitend als achterstallig bij het bekijken van vandaag", () => {
    const weergave = bepaalWerkAgenda([taak({ id: 1, datum: GISTEREN })], [], [], VANDAAG);

    expect(weergave.achterstallig).toHaveLength(1);
    expect(weergave.achterstallig[0]).toMatchObject({ bron: "taak", id: 1 });
    expect(weergave.opGekozenDatum).toEqual([]);
  });

  it("achterstallige taken mengen nooit door een niet-vandaag-datum heen (zelfde regel als sales-acties)", () => {
    const weergave = bepaalWerkAgenda([taak({ id: 1, datum: GISTEREN })], [], [], voegDagenToe(VANDAAG, 5));

    expect(weergave.achterstallig).toEqual([]);
  });

  it("afgeronde/vervallen taken verschijnen nergens — niet op hun datum, niet als achterstallig, niet in ongepland", () => {
    const datum = voegDagenToe(VANDAAG, 2);
    const taken = [taak({ id: 1, datum, status: "afgerond" }), taak({ id: 2, datum: null, status: "vervallen" })];
    const weergave = bepaalWerkAgenda(taken, [], [], datum);

    expect(weergave.opGekozenDatum).toEqual([]);
    expect(weergave.ongepland).toEqual([]);
  });

  it("een taak, een sales-actie én een Monday-planning kunnen alledrie op dezelfde dag verschijnen — geen dedup tussen taak en de andere bronnen", () => {
    const datum = voegDagenToe(VANDAAG, 4);
    const taken = [taak({ id: 1, datum, schoolId: 7, schoolName: "School 7" })];
    const acties = [salesActie({ schoolId: 7, dueDate: `${datum}T09:00:00.000Z` })];
    const scholen = [schoolMetPlanning({ id: 9, mondayVolgendeActieDatum: datum })];

    const weergave = bepaalWerkAgenda(taken, acties, scholen, datum);

    expect(weergave.opGekozenDatum).toHaveLength(3);
    expect(weergave.opGekozenDatum.map((i) => i.bron).sort()).toEqual(["monday", "sales", "taak"]);
  });

  it("maakt of muteert nooit taken/acties/scholen — puur een afgeleide weergave op basis van de meegegeven invoer", () => {
    const taken = [taak({ id: 1, datum: VANDAAG })];
    const acties = [salesActie({ schoolId: 1, dueDate: `${VANDAAG}T09:00:00.000Z` })];
    const scholen = [schoolMetPlanning({ id: 2, mondayVolgendeActieDatum: VANDAAG })];
    const takenKopie = [...taken];
    const actiesKopie = [...acties];
    const scholenKopie = [...scholen];

    bepaalWerkAgenda(taken, acties, scholen, VANDAAG);

    expect(taken).toEqual(takenKopie);
    expect(acties).toEqual(actiesKopie);
    expect(scholen).toEqual(scholenKopie);
  });

  it("geeft school-context door op een taakitem, en null wanneer er geen schoolcontext is", () => {
    const datum = voegDagenToe(VANDAAG, 1);
    const weergave = bepaalWerkAgenda(
      [taak({ id: 1, datum, schoolId: 5, schoolName: "Springplank" }), taak({ id: 2, datum, schoolId: null, schoolName: null })],
      [],
      [],
      datum
    );

    const metSchool = weergave.opGekozenDatum.find((i) => i.bron === "taak" && i.id === 1);
    const zonderSchool = weergave.opGekozenDatum.find((i) => i.bron === "taak" && i.id === 2);
    expect(metSchool).toMatchObject({ schoolId: 5, schoolName: "Springplank" });
    expect(zonderSchool).toMatchObject({ schoolId: null, schoolName: null });
  });
});

describe("bepaalWerkAgenda — Mijn Werk Fase 2: agenda-events als vierde, onafhankelijke bron", () => {
  it("een agenda-event verschijnt op opGekozenDatum met bron: 'agenda', ongeacht dat het niet in taken/acties/scholen zit", () => {
    const datum = voegDagenToe(VANDAAG, 2);
    const weergave = bepaalWerkAgenda([], [], [], datum, [agendaEvent({ id: "evt1", datum, titel: "Training", tijd: "09:00" })]);

    expect(weergave.opGekozenDatum).toHaveLength(1);
    expect(weergave.opGekozenDatum[0]).toMatchObject({ bron: "agenda", id: "evt1", titel: "Training", tijd: "09:00" });
  });

  it("agenda-events hebben geen achterstallig-concept — worden nooit in achterstallig getoond", () => {
    const weergave = bepaalWerkAgenda([], [], [], VANDAAG, [agendaEvent({ id: "evt1", datum: VANDAAG })]);
    expect(weergave.achterstallig).toEqual([]);
  });

  it("bestaande aanroepers zonder agendaEvents-argument blijven ongewijzigd werken (optioneel, default [])", () => {
    const datum = voegDagenToe(VANDAAG, 1);
    const weergave = bepaalWerkAgenda([taak({ id: 1, datum })], [], [], datum);
    expect(weergave.opGekozenDatum).toHaveLength(1);
  });

  it("taak, sales, monday én agenda kunnen alle vier op dezelfde dag verschijnen — geen dedup met de nieuwe bron", () => {
    const datum = voegDagenToe(VANDAAG, 4);
    const taken = [taak({ id: 1, datum, schoolId: 7, schoolName: "School 7" })];
    const acties = [salesActie({ schoolId: 7, dueDate: `${datum}T09:00:00.000Z` })];
    const scholen = [schoolMetPlanning({ id: 9, mondayVolgendeActieDatum: datum })];
    const events = [agendaEvent({ id: "evt1", datum })];

    const weergave = bepaalWerkAgenda(taken, acties, scholen, datum, events);

    expect(weergave.opGekozenDatum).toHaveLength(4);
    expect(weergave.opGekozenDatum.map((i) => i.bron).sort()).toEqual(["agenda", "monday", "sales", "taak"]);
  });

  it("sorteert: hele-dag-events eerst, dan getimede items chronologisch, dan de rest", () => {
    const datum = voegDagenToe(VANDAAG, 3);
    const taken = [taak({ id: 1, datum, titel: "Taak om 11", tijd: "11:00" })];
    const acties = [salesActie({ schoolId: 5, dueDate: `${datum}T00:00:00.000Z`, description: "Ongetimede sales-actie" })];
    const events = [
      agendaEvent({ id: "vroeg", datum, titel: "Vroege afspraak", tijd: "09:00" }),
      agendaEvent({ id: "heledag", datum, titel: "Studiedag", volledigeDag: true }),
    ];

    const weergave = bepaalWerkAgenda(taken, acties, [], datum, events);

    expect(weergave.opGekozenDatum.map((i) => (i.bron === "agenda" ? i.id : i.bron))).toEqual([
      "heledag", // hele-dag-event eerst
      "vroeg", // dan getimed, chronologisch (09:00 vóór 11:00)
      "taak", // taak om 11:00
      "sales", // rest (geen tijdstip-concept) in bestaande volgorde
    ]);
  });

  it("volledigeDag/tijd/eindTijd komen ongewijzigd door op het WerkAgendaEventItem", () => {
    const datum = voegDagenToe(VANDAAG, 1);
    const weergave = bepaalWerkAgenda([], [], [], datum, [
      agendaEvent({ id: "evt1", datum, volledigeDag: true, tijd: null, eindTijd: null }),
    ]);
    expect(weergave.opGekozenDatum[0]).toMatchObject({ bron: "agenda", volledigeDag: true, tijd: null, eindTijd: null });
  });
});
