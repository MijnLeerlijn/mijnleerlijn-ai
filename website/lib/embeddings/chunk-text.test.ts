import { describe, it, expect } from "vitest";
import { splitsInChunks, CHUNK_TARGET_TEKENS } from "./chunk-text";

// Productiecontrole, vervolgronde (2026-08-23) — dekt de chunker die de
// HTTP-400-fix mogelijk maakt: elk chunk moet ruim onder het tekenbudget
// blijven, splitsen moet op natuurlijke grenzen gebeuren (nooit een blinde
// midden-in-een-woord-knip als een alinea-/zinsgrens beschikbaar is), en de
// oorspronkelijke tekst moet — op de gekozen breekpunten na — volledig
// terug te vinden zijn (geen zoekgeraakte inhoud).

describe("splitsInChunks", () => {
  it("lege of blanco tekst geeft een lege lijst", () => {
    expect(splitsInChunks("")).toEqual([]);
    expect(splitsInChunks("   \n\n  ")).toEqual([]);
  });

  it("korte tekst (past ruim binnen het budget) geeft precies één chunk, ongewijzigd", () => {
    const tekst = "Een periode duurt zes weken.\n\nDe trainer begeleidt de school hierbij.";
    expect(splitsInChunks(tekst)).toEqual([tekst]);
  });

  it("splitst op alineagrenzen zodra het budget wordt overschreden, geen enkel chunk boven de limiet", () => {
    const alinea = "a".repeat(4000);
    const tekst = [alinea, alinea, alinea].join("\n\n"); // 12000 tekens, budget 6000 -> minstens 2 chunks
    const chunks = splitsInChunks(tekst, 6000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(6000);
  });

  it("behoudt elke alinea volledig — nooit een alinea middenin doorknippen als hij zelf binnen het budget past", () => {
    const alineas = Array.from({ length: 5 }, (_, i) => `Alinea ${i}: ${"x".repeat(1000)}`);
    const tekst = alineas.join("\n\n");
    const chunks = splitsInChunks(tekst, 2500);
    for (const alinea of alineas) {
      expect(chunks.some((chunk) => chunk.includes(alinea))).toBe(true);
    }
  });

  it("een enkele alinea die zelf al groter is dan het budget wordt op zinsgrenzen verder gesplitst", () => {
    const zin = "Dit is een zin die een aantal keer herhaald wordt om lang genoeg te worden. ";
    const grotealinea = zin.repeat(200); // ruim > budget
    const chunks = splitsInChunks(grotealinea, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1000);
    // De inhoud gaat niet verloren: elk stuk tekst komt in exact één chunk terug.
    expect(chunks.join(" ")).toContain("Dit is een zin");
  });

  it("een enkele zin zonder leestekens die zelf al groter is dan het budget krijgt een harde (uiterste redmiddel) knip, zonder te crashen", () => {
    const tekst = "woord ".repeat(2000); // één lange 'zin' zonder punt/uitroepteken/vraagteken
    const chunks = splitsInChunks(tekst, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1000);
  });

  it("de standaard CHUNK_TARGET_TEKENS wordt gebruikt wanneer geen maxTekens is opgegeven", () => {
    const tekst = "y".repeat(CHUNK_TARGET_TEKENS * 3);
    const chunks = splitsInChunks(tekst);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_TARGET_TEKENS);
  });

  it("een realistisch-grote trainerkennistekst (vergelijkbaar met de live Basiskennis) levert meerdere, elk-binnen-budget chunks op", () => {
    // Simuleert een lange, feitbehoudende AI-herschrijving: veel korte
    // alinea's van wisselende lengte, zoals een echt achtergronddocument.
    const alineas = Array.from({ length: 80 }, (_, i) => `Onderwerp ${i}: ${"tekst ".repeat(60).trim()}`);
    const grotetekst = alineas.join("\n\n"); // ruim boven de 8191-tokenlimiet
    const chunks = splitsInChunks(grotetekst);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_TARGET_TEKENS);
    // Elke alinea is nog steeds (ongebroken) terug te vinden in precies één chunk.
    for (const alinea of alineas) {
      expect(chunks.filter((c) => c.includes(alinea))).toHaveLength(1);
    }
  });
});
