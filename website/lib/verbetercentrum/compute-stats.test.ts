import { describe, it, expect } from "vitest";
import { computeStats, type ConversatieVoorStats } from "./compute-stats";

const NU = new Date("2026-07-27T12:00:00.000Z");

function maakDoc(overrides: Partial<ConversatieVoorStats> = {}): ConversatieVoorStats {
  return {
    id: 1,
    question: "Hoe koppel ik doelen?",
    hasAnswer: true,
    confidence: 80,
    feedbackRating: "geen",
    contactFormSubmitted: false,
    intentieType: "opgelost",
    kennisbasisOnderwerp: null,
    gebruikteSynoniem: null,
    steps: [],
    createdAt: NU.toISOString(),
    ...overrides,
  };
}

describe("computeStats — lege invoer", () => {
  it("geeft nullen/lege lijsten terug zonder te crashen bij geen enkele conversatie", () => {
    const stats = computeStats([], NU);

    expect(stats.totaal).toBe(0);
    expect(stats.vandaag).toBe(0);
    expect(stats.percentageDirectOpgelost).toBe(0);
    expect(stats.gemiddeldeConfidence).toBe(0);
    expect(stats.meestGesteldeVragen).toEqual([]);
  });
});

describe("computeStats — tijdvensters", () => {
  it("telt alleen vragen van vandaag mee bij 'vandaag'", () => {
    const docs = [
      maakDoc({ createdAt: NU.toISOString() }),
      maakDoc({ createdAt: new Date(NU.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() }),
    ];

    const stats = computeStats(docs, NU);

    expect(stats.vandaag).toBe(1);
    expect(stats.dezeWeek).toBe(2);
  });

  it("telt een vraag van 10 dagen geleden niet mee bij 'deze week'", () => {
    const docs = [maakDoc({ createdAt: new Date(NU.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() })];

    const stats = computeStats(docs, NU);

    expect(stats.dezeWeek).toBe(0);
  });
});

describe("computeStats — percentages per intentietype en feedback", () => {
  it("berekent de percentages opgelost/onduidelijk/geen-match correct", () => {
    const docs = [
      maakDoc({ intentieType: "opgelost" }),
      maakDoc({ intentieType: "opgelost" }),
      maakDoc({ intentieType: "onduidelijk" }),
      maakDoc({ intentieType: "geen-match" }),
    ];

    const stats = computeStats(docs, NU);

    expect(stats.percentageDirectOpgelost).toBe(50);
    expect(stats.percentageVerduidelijkingsvragen).toBe(25);
    expect(stats.percentageGeenMatch).toBe(25);
  });

  it("berekent het percentage negatieve feedback en contactformuliergebruik", () => {
    const docs = [
      maakDoc({ feedbackRating: "niet_nuttig", contactFormSubmitted: true }),
      maakDoc({ feedbackRating: "nuttig", contactFormSubmitted: false }),
      maakDoc({ feedbackRating: "geen", contactFormSubmitted: false }),
      maakDoc({ feedbackRating: "geen", contactFormSubmitted: false }),
    ];

    const stats = computeStats(docs, NU);

    expect(stats.percentageNegatieveFeedback).toBe(25);
    expect(stats.percentageContactformulierGebruikt).toBe(25);
  });

  it("berekent het percentage gedetecteerde tegenstrijdigheden (Fase 4)", () => {
    const docs = [
      maakDoc({ tegenstrijdigheid: "De kennisbasis en de handleiding spreken elkaar tegen." }),
      maakDoc({ tegenstrijdigheid: null }),
      maakDoc({ tegenstrijdigheid: "   " }), // whitespace-only telt niet mee
      maakDoc({ tegenstrijdigheid: undefined }),
    ];

    const stats = computeStats(docs, NU);

    expect(stats.percentageTegenstrijdigheden).toBe(25);
  });
});

describe("computeStats — gemiddelde confidence", () => {
  it("telt alleen conversaties met hasAnswer mee, niet clarifications/mislukkingen (confidence 0)", () => {
    const docs = [
      maakDoc({ hasAnswer: true, confidence: 90 }),
      maakDoc({ hasAnswer: true, confidence: 70 }),
      maakDoc({ hasAnswer: false, confidence: 0 }),
    ];

    const stats = computeStats(docs, NU);

    expect(stats.gemiddeldeConfidence).toBe(80);
  });

  it("geeft 0 terug als geen enkele conversatie hasAnswer heeft", () => {
    const docs = [maakDoc({ hasAnswer: false, confidence: 0 })];

    const stats = computeStats(docs, NU);

    expect(stats.gemiddeldeConfidence).toBe(0);
  });
});

describe("computeStats — top-N-lijsten", () => {
  it("groepeert meest gestelde vragen case-insensitief en op aantal aflopend", () => {
    const docs = [
      maakDoc({ question: "Hoe koppel ik doelen?" }),
      maakDoc({ question: "hoe koppel ik doelen?" }),
      maakDoc({ question: "Hoe maak ik een doelenset?" }),
    ];

    const stats = computeStats(docs, NU);

    expect(stats.meestGesteldeVragen[0]).toEqual({ label: "Hoe koppel ik doelen?", aantal: 2 });
    expect(stats.meestGesteldeVragen[1]).toEqual({ label: "Hoe maak ik een doelenset?", aantal: 1 });
  });

  it("groepeert meest gebruikte kennisbasis-onderwerpen op id, met titel indien bepopuleerd", () => {
    const docs = [
      maakDoc({ kennisbasisOnderwerp: { id: 3, onderwerp: "Doelen koppelen aan één leerling" } }),
      maakDoc({ kennisbasisOnderwerp: { id: 3, onderwerp: "Doelen koppelen aan één leerling" } }),
      maakDoc({ kennisbasisOnderwerp: 4 }),
      maakDoc({ kennisbasisOnderwerp: null }),
    ];

    const stats = computeStats(docs, NU);

    expect(stats.meestGebruikteOnderwerpen[0]).toEqual({
      label: "Doelen koppelen aan één leerling",
      aantal: 2,
    });
    expect(stats.meestGebruikteOnderwerpen[1]).toEqual({ label: "Onderwerp #4", aantal: 1 });
  });

  it("telt een handleiding met meerdere stappen in dezelfde conversatie maar één keer", () => {
    const docs = [
      maakDoc({
        steps: [
          { handleidingId: 10 },
          { handleidingId: 10 },
          { handleidingId: 11 },
        ],
      }),
    ];

    const stats = computeStats(docs, NU);

    const handleiding10 = stats.meestGebruikteHandleidingen.find((h) => h.label === "Handleiding #10");
    expect(handleiding10?.aantal).toBe(1);
  });

  it("negeert lege/ontbrekende gebruikteSynoniem-waarden in de synoniemenlijst", () => {
    const docs = [
      maakDoc({ gebruikteSynoniem: "leerdoelen" }),
      maakDoc({ gebruikteSynoniem: "Leerdoelen" }),
      maakDoc({ gebruikteSynoniem: null }),
      maakDoc({ gebruikteSynoniem: "  " }),
    ];

    const stats = computeStats(docs, NU);

    expect(stats.meestGebruikteSynoniemen).toEqual([{ label: "leerdoelen", aantal: 2 }]);
  });
});
