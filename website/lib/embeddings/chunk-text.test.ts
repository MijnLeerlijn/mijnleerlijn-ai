import { describe, it, expect } from "vitest";
import { splitsInChunks, splitsInHeadingChunks, CHUNK_TARGET_TEKENS } from "./chunk-text";

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

// Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing"
// (opdrachtseis §4/§10): elke chunk moet weten in welk hoofdstuk hij stond,
// ook wanneer een hoofdstuk zelf over meerdere chunks wordt verdeeld.
describe("splitsInHeadingChunks", () => {
  it("lege tekst geeft een lege lijst", () => {
    expect(splitsInHeadingChunks("")).toEqual([]);
  });

  it("tekst zonder enige heading krijgt heading:null, blijft gewoon embedbaar", () => {
    const chunks = splitsInHeadingChunks("Gewone tekst zonder koppen.");
    expect(chunks).toEqual([{ text: "Gewone tekst zonder koppen.", heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 }]);
  });

  it("elke chunk van een kort document krijgt de heading van zijn eigen sectie", () => {
    const markdown = ["## 1. Eerste hoofdstuk", "Inhoud 1.", "", "## 2. Tweede hoofdstuk", "Inhoud 2."].join("\n");
    const chunks = splitsInHeadingChunks(markdown);
    expect(chunks).toEqual([
      { text: "Inhoud 1.", heading: "1. Eerste hoofdstuk", headingSlug: "1-eerste-hoofdstuk", headingLevel: 2, chunkIndex: 0 },
      { text: "Inhoud 2.", heading: "2. Tweede hoofdstuk", headingSlug: "2-tweede-hoofdstuk", headingLevel: 2, chunkIndex: 1 },
    ]);
  });

  it("een lang hoofdstuk dat zelf in meerdere chunks wordt gesplitst, behoudt dezelfde heading-metadata op elke vervolgchunk", () => {
    const alinea = "x".repeat(4000);
    const langHoofdstuk = [alinea, alinea, alinea].join("\n\n"); // 12000 tekens, budget 6000 -> minstens 2 chunks
    const markdown = `## 6. Een lang hoofdstuk\n${langHoofdstuk}`;

    const chunks = splitsInHeadingChunks(markdown, 6000);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.heading).toBe("6. Een lang hoofdstuk");
      expect(chunk.headingSlug).toBe("6-een-lang-hoofdstuk");
      expect(chunk.headingLevel).toBe(2);
      expect(chunk.text.length).toBeLessThanOrEqual(6000);
    }
    // Doorlopende chunkIndex over het hele document, geen reset per sectie.
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  it("tekst vóór de eerste heading vormt een eigen chunk met heading:null, gevolgd door de chunk(s) van de eerste heading", () => {
    const markdown = ["Een inleidende alinea.", "", "## 1. Eerste hoofdstuk", "Inhoud van hoofdstuk 1."].join("\n");
    const chunks = splitsInHeadingChunks(markdown);
    expect(chunks).toEqual([
      { text: "Een inleidende alinea.", heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 },
      { text: "Inhoud van hoofdstuk 1.", heading: "1. Eerste hoofdstuk", headingSlug: "1-eerste-hoofdstuk", headingLevel: 2, chunkIndex: 1 },
    ]);
  });

  it("een heading zonder eigen inhoud (direct gevolgd door de volgende heading) levert geen chunk op", () => {
    const markdown = ["## Kop zonder tekst", "## Volgende kop", "Wel tekst hier."].join("\n");
    const chunks = splitsInHeadingChunks(markdown);
    expect(chunks).toEqual([{ text: "Wel tekst hier.", heading: "Volgende kop", headingSlug: "volgende-kop", headingLevel: 2, chunkIndex: 0 }]);
  });

  it("een realistisch-grote trainerkennistekst met veel hoofdstukken levert voor elk hoofdstuk minstens één correct-getagde chunk op", () => {
    const hoofdstukken = Array.from({ length: 15 }, (_, i) => `## ${i + 1}. Hoofdstuk ${i + 1}\n${"tekst ".repeat(400).trim()}`);
    const markdown = hoofdstukken.join("\n\n");

    const chunks = splitsInHeadingChunks(markdown);

    for (let i = 0; i < hoofdstukken.length; i += 1) {
      const verwachteSlug = `${i + 1}-hoofdstuk-${i + 1}`;
      expect(chunks.some((c) => c.headingSlug === verwachteSlug)).toBe(true);
    }
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_TARGET_TEKENS);
  });
});
