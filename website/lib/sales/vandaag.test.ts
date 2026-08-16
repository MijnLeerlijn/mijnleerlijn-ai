import { describe, it, expect } from "vitest";
import { bepaalVandaagWeergave, bepaalGecombineerdeAgenda, type AgendaActieInvoer, type SchoolMetMondayPlanning } from "./vandaag";
import { vandaagIso, voegDagenToe } from "./format-datum";

const VANDAAG = vandaagIso();
const MORGEN = voegDagenToe(VANDAAG, 1);
const OVERMORGEN = voegDagenToe(VANDAAG, 2);
const GISTEREN = voegDagenToe(VANDAAG, -1);
const EERGISTEREN = voegDagenToe(VANDAAG, -2);

function actie(dueDate: string) {
  return { dueDate: `${dueDate}T09:00:00.000Z` };
}

describe("bepaalVandaagWeergave — productiecorrectie 2026-08-16 (punt 2)", () => {
  it("toont bij 'vandaag' zowel de acties van vandaag als een aparte achterstallig-groep", () => {
    const acties = [actie(GISTEREN), actie(EERGISTEREN), actie(VANDAAG), actie(MORGEN)];

    const weergave = bepaalVandaagWeergave(acties, VANDAAG);

    expect(weergave.isVandaag).toBe(true);
    expect(weergave.opGekozenDatum).toHaveLength(1);
    expect(weergave.opGekozenDatum[0]!.dueDate.slice(0, 10)).toBe(VANDAAG);
    expect(weergave.achterstallig).toHaveLength(2);
    expect(weergave.achterstallig.map((a) => a.dueDate.slice(0, 10)).sort()).toEqual([EERGISTEREN, GISTEREN].sort());
  });

  it("mengt achterstallige acties NOOIT door een toekomstige datum heen", () => {
    const acties = [actie(GISTEREN), actie(MORGEN), actie(OVERMORGEN)];

    const weergave = bepaalVandaagWeergave(acties, MORGEN);

    expect(weergave.isVandaag).toBe(false);
    expect(weergave.achterstallig).toEqual([]);
    expect(weergave.opGekozenDatum).toHaveLength(1);
    expect(weergave.opGekozenDatum[0]!.dueDate.slice(0, 10)).toBe(MORGEN);
  });

  it("toont voor een toekomstige datum uitsluitend acties die exact op die datum vallen", () => {
    const acties = [actie(VANDAAG), actie(MORGEN), actie(OVERMORGEN)];

    const weergave = bepaalVandaagWeergave(acties, OVERMORGEN);

    expect(weergave.opGekozenDatum).toHaveLength(1);
    expect(weergave.opGekozenDatum[0]!.dueDate.slice(0, 10)).toBe(OVERMORGEN);
  });

  it("toont voor een zelfgekozen datum in het verleden geen aparte achterstallig-groep — alleen exact die datum", () => {
    const acties = [actie(EERGISTEREN), actie(GISTEREN)];

    const weergave = bepaalVandaagWeergave(acties, GISTEREN);

    expect(weergave.isVandaag).toBe(false);
    expect(weergave.achterstallig).toEqual([]);
    expect(weergave.opGekozenDatum).toHaveLength(1);
    expect(weergave.opGekozenDatum[0]!.dueDate.slice(0, 10)).toBe(GISTEREN);
  });

  it("geeft lege groepen terug wanneer er niets op de gekozen datum staat", () => {
    const weergave = bepaalVandaagWeergave([actie(VANDAAG)], OVERMORGEN);

    expect(weergave.opGekozenDatum).toEqual([]);
    expect(weergave.achterstallig).toEqual([]);
  });
});

// Functionele inconsistentie (vervolg op productiecorrectie punt 2) — root
// cause: de datumweergave toonde uitsluitend lokale sales-actions, dus een
// school met UITSLUITEND een geldige Monday "Datum volgende actie" verscheen
// nooit op haar eigen geplande dag, terwijl diezelfde school elders (To-do se
// "Gepland in Monday") al als gepland gold. bepaalGecombineerdeAgenda()
// combineert beide bronnen, gededupliceerd per (school, datum), zonder ooit
// een sales-actions-record aan te maken.
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

describe("bepaalGecombineerdeAgenda — functionele-inconsistentiefix (Vandaag-tab toont voortaan ook Monday-planningen)", () => {
  it("een school met UITSLUITEND een geldige Monday-datum (24 aug) en géén lokale actie is zichtbaar op die datum — het expliciet gevraagde testscenario", () => {
    const datum = voegDagenToe(VANDAAG, 8);
    const scholen = [schoolMetPlanning({ id: 42, schoolName: "Springplank", mondayVolgendeActieDatum: datum, cachedGeplandeActieTekst: "Mail sturen voor afspraak" })];

    const weergave = bepaalGecombineerdeAgenda([], scholen, datum);

    expect(weergave.opGekozenDatum).toHaveLength(1);
    const item = weergave.opGekozenDatum[0]!;
    expect(item.bron).toBe("monday");
    if (item.bron === "monday") {
      expect(item.schoolId).toBe(42);
      expect(item.schoolName).toBe("Springplank");
      expect(item.datum).toBe(datum);
      expect(item.geplandeActieTekst).toBe("Mail sturen voor afspraak");
    }
  });

  it("geeft null door voor geplandeActieTekst wanneer de cache leeg is — de pure functie verzint geen fallbacktekst (dat is een UI-laagbeslissing)", () => {
    const datum = voegDagenToe(VANDAAG, 3);
    const scholen = [schoolMetPlanning({ id: 1, mondayVolgendeActieDatum: datum, cachedGeplandeActieTekst: null })];

    const weergave = bepaalGecombineerdeAgenda([], scholen, datum);

    expect(weergave.opGekozenDatum[0]).toMatchObject({ bron: "monday", geplandeActieTekst: null });
  });

  it("dedupliceert: een school met een lokale actie ÉN een Monday-datum op dezelfde dag toont uitsluitend de Sales-actie-kaart", () => {
    const datum = voegDagenToe(VANDAAG, 5);
    const acties = [salesActie({ schoolId: 7, dueDate: `${datum}T09:00:00.000Z` })];
    const scholen = [schoolMetPlanning({ id: 7, mondayVolgendeActieDatum: datum })];

    const weergave = bepaalGecombineerdeAgenda(acties, scholen, datum);

    expect(weergave.opGekozenDatum).toHaveLength(1);
    expect(weergave.opGekozenDatum[0]!.bron).toBe("sales");
  });

  it("een school met een lokale actie op een ANDERE dag dan haar Monday-datum verschijnt op BEIDE eigen dagen — dedup-sleutel is (school, datum), niet uitsluitend school", () => {
    const lokaleDatum = voegDagenToe(VANDAAG, 12);
    const mondayDatum = voegDagenToe(VANDAAG, 5);
    const acties = [salesActie({ schoolId: 9, dueDate: `${lokaleDatum}T09:00:00.000Z` })];
    const scholen = [schoolMetPlanning({ id: 9, mondayVolgendeActieDatum: mondayDatum })];

    const opMondayDatum = bepaalGecombineerdeAgenda(acties, scholen, mondayDatum);
    const opLokaleDatum = bepaalGecombineerdeAgenda(acties, scholen, lokaleDatum);

    expect(opMondayDatum.opGekozenDatum).toHaveLength(1);
    expect(opMondayDatum.opGekozenDatum[0]!.bron).toBe("monday");
    expect(opLokaleDatum.opGekozenDatum).toHaveLength(1);
    expect(opLokaleDatum.opGekozenDatum[0]!.bron).toBe("sales");
  });

  it("achterstallig blijft uitsluitend lokale Sales-acties — een Monday-planning verschijnt daar nooit, ook niet met een verlopen datum", () => {
    const verlopen = voegDagenToe(VANDAAG, -10);
    const acties = [salesActie({ schoolId: 1, dueDate: `${GISTEREN}T09:00:00.000Z` })];
    const scholen = [schoolMetPlanning({ id: 2, mondayVolgendeActieDatum: verlopen })];

    const weergave = bepaalGecombineerdeAgenda(acties, scholen, VANDAAG);

    expect(weergave.achterstallig).toHaveLength(1);
    expect(weergave.achterstallig[0]!.bron).toBe("sales");
  });

  it("achterstallig blijft leeg wanneer de gekozen datum niet vandaag is, ook als er lokale acties in het verleden liggen", () => {
    const acties = [salesActie({ schoolId: 1, dueDate: `${EERGISTEREN}T09:00:00.000Z` })];

    const weergave = bepaalGecombineerdeAgenda(acties, [], GISTEREN);

    expect(weergave.achterstallig).toEqual([]);
  });

  it("Inactief/Gestopt (actief: false) wordt nooit als Monday-kaart getoond, ook met een geldige datum op de gekozen dag", () => {
    const datum = voegDagenToe(VANDAAG, 4);
    const scholen = [schoolMetPlanning({ id: 1, mondayVolgendeActieDatum: datum, actief: false })];

    const weergave = bepaalGecombineerdeAgenda([], scholen, datum);

    expect(weergave.opGekozenDatum).toEqual([]);
  });

  it("meerdere scholen met een Monday-planning op dezelfde dag verschijnen allemaal, elk als eigen kaart", () => {
    const datum = voegDagenToe(VANDAAG, 6);
    const scholen = [
      schoolMetPlanning({ id: 1, schoolName: "School A", mondayVolgendeActieDatum: datum }),
      schoolMetPlanning({ id: 2, schoolName: "School B", mondayVolgendeActieDatum: datum }),
    ];

    const weergave = bepaalGecombineerdeAgenda([], scholen, datum);

    expect(weergave.opGekozenDatum).toHaveLength(2);
    expect(weergave.opGekozenDatum.map((i) => i.schoolId).sort()).toEqual([1, 2]);
  });

  it("een school met een Monday-datum op een ANDERE dag dan de gekozen datum verschijnt niet", () => {
    const scholen = [schoolMetPlanning({ id: 1, mondayVolgendeActieDatum: voegDagenToe(VANDAAG, 20) })];

    const weergave = bepaalGecombineerdeAgenda([], scholen, VANDAAG);

    expect(weergave.opGekozenDatum).toEqual([]);
  });

  it("maakt of muteert nooit sales-actions — puur een afgeleide weergave op basis van de meegegeven invoer", () => {
    const acties = [salesActie({ schoolId: 1, dueDate: `${VANDAAG}T09:00:00.000Z` })];
    const scholen = [schoolMetPlanning({ id: 2, mondayVolgendeActieDatum: VANDAAG })];
    const actiesKopie = [...acties];
    const scholenKopie = [...scholen];

    bepaalGecombineerdeAgenda(acties, scholen, VANDAAG);

    expect(acties).toEqual(actiesKopie);
    expect(scholen).toEqual(scholenKopie);
  });
});
