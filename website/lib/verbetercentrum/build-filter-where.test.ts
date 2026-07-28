import { describe, it, expect } from "vitest";
import { buildFilterWhereParams, STANDAARD_FILTERS, type VerbetercentrumFilterState } from "./build-filter-where";

function metOverrides(overrides: Partial<VerbetercentrumFilterState>): VerbetercentrumFilterState {
  return { ...STANDAARD_FILTERS, intentieFilter: null, ...overrides };
}

describe("buildFilterWhereParams", () => {
  it("geeft een lege lijst terug als geen enkel filter actief is", () => {
    const params = buildFilterWhereParams(metOverrides({}));

    expect(params).toEqual([]);
  });

  it("bouwt een clause voor 'geen intentiematch'", () => {
    const params = buildFilterWhereParams(metOverrides({ intentieFilter: "geen-match" }));

    expect(params).toEqual([["where[and][0][intentieType][equals]", "geen-match"]]);
  });

  it("bouwt een clause voor 'verduidelijkingsvraag gesteld'", () => {
    const params = buildFilterWhereParams(metOverrides({ intentieFilter: "onduidelijk" }));

    expect(params).toEqual([["where[and][0][intentieType][equals]", "onduidelijk"]]);
  });

  it("bouwt een clause voor negatieve feedback", () => {
    const params = buildFilterWhereParams(metOverrides({ negatieveFeedback: true }));

    expect(params).toEqual([["where[and][0][feedbackRating][equals]", "niet_nuttig"]]);
  });

  it("bouwt een clause voor contactformulier gebruikt", () => {
    const params = buildFilterWhereParams(metOverrides({ contactformulierGebruikt: true }));

    expect(params).toEqual([["where[and][0][contactFormSubmitted][equals]", "true"]]);
  });

  it("bouwt een clause voor lage confidence met de opgegeven grens", () => {
    const params = buildFilterWhereParams(metOverrides({ lageConfidence: true, lageConfidenceGrens: 30 }));

    expect(params).toEqual([["where[and][0][confidence][less_than]", "30"]]);
  });

  it("bouwt een clause voor geen handleiding gevonden", () => {
    const params = buildFilterWhereParams(metOverrides({ geenHandleidingGevonden: true }));

    expect(params).toEqual([["where[and][0][geenHandleidingGevonden][equals]", "true"]]);
  });

  it("bouwt een clause voor nog niet beoordeeld", () => {
    const params = buildFilterWhereParams(metOverrides({ nogNietBeoordeeld: true }));

    expect(params).toEqual([["where[and][0][verbeterStatus][equals]", "nieuw"]]);
  });

  it("combineert meerdere onafhankelijke filters met oplopende and-indexen", () => {
    const params = buildFilterWhereParams(
      metOverrides({ negatieveFeedback: true, contactformulierGebruikt: true, nogNietBeoordeeld: true })
    );

    expect(params).toEqual([
      ["where[and][0][feedbackRating][equals]", "niet_nuttig"],
      ["where[and][1][contactFormSubmitted][equals]", "true"],
      ["where[and][2][verbeterStatus][equals]", "nieuw"],
    ]);
  });

  it("heeft 'geen intentiematch' als standaardfilter (het primaire werkscherm)", () => {
    const params = buildFilterWhereParams(STANDAARD_FILTERS);

    expect(params).toEqual([["where[and][0][intentieType][equals]", "geen-match"]]);
  });

  it("bouwt een 'exists'-clause voor tegenstrijdigheid gedetecteerd (Fase 4)", () => {
    const params = buildFilterWhereParams(metOverrides({ tegenstrijdigheidGedetecteerd: true }));

    expect(params).toEqual([["where[and][0][tegenstrijdigheid][exists]", "true"]]);
  });
});
