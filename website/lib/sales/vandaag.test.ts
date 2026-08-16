import { describe, it, expect } from "vitest";
import { bepaalVandaagWeergave } from "./vandaag";
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
