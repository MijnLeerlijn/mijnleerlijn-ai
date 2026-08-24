import { describe, it, expect } from "vitest";
import { haalHeadingsOp, parseerMarkdownSecties, slugifyHeading, maakUniekeSlug } from "./markdown-headings";

// Nieuw (2026-08-24) — "Trainer Kennis: hoofdstuknavigatie + bronverwijzing
// naar juiste hoofdstuk" (opdrachtseis §10): dekt de pure parse-/slugmodule
// die zowel de embedding-chunking (server) als de Kennis-lezer (client) van
// dezelfde hoofdstuk-slugs moet voorzien — een afwijking tussen die twee zou
// een "Bekijk hoofdstuk"-link naar een niet-bestaande anchor opleveren.

describe("slugifyHeading", () => {
  it("het exacte opdracht-voorbeeld: '6. Hoe is een curriculum opgebouwd?' -> '6-hoe-is-een-curriculum-opgebouwd'", () => {
    expect(slugifyHeading("6. Hoe is een curriculum opgebouwd?")).toBe("6-hoe-is-een-curriculum-opgebouwd");
  });

  it("maakt kleine letters en vervangt spaties door koppeltekens", () => {
    expect(slugifyHeading("De DOEL-aanpak")).toBe("de-doel-aanpak");
  });

  it("een reeks leestekens wordt precies één koppelteken, nooit een dubbele", () => {
    expect(slugifyHeading("Wat, wanneer & hoe?!")).toBe("wat-wanneer-hoe");
  });

  it("strippt diakrieten (bv. café -> cafe)", () => {
    expect(slugifyHeading("Café-cyclus")).toBe("cafe-cyclus");
  });

  it("een heading die uitsluitend uit leestekens bestaat geeft een lege string terug (fallback zit in maakUniekeSlug)", () => {
    expect(slugifyHeading("???")).toBe("");
  });
});

describe("maakUniekeSlug", () => {
  it("geeft de basisslug terug wanneer die nog niet bestaat, en registreert 'm", () => {
    const gezien = new Set<string>();
    expect(maakUniekeSlug("de-cyclus", gezien)).toBe("de-cyclus");
    expect(gezien.has("de-cyclus")).toBe(true);
  });

  it("bij een botsing krijgt de tweede/derde slug een -2/-3-suffix, nooit dezelfde slug tweemaal", () => {
    const gezien = new Set<string>();
    expect(maakUniekeSlug("de-cyclus", gezien)).toBe("de-cyclus");
    expect(maakUniekeSlug("de-cyclus", gezien)).toBe("de-cyclus-2");
    expect(maakUniekeSlug("de-cyclus", gezien)).toBe("de-cyclus-3");
  });

  it("een lege basisslug krijgt de nette fallback 'sectie'", () => {
    const gezien = new Set<string>();
    expect(maakUniekeSlug("", gezien)).toBe("sectie");
  });
});

describe("haalHeadingsOp — Markdown-headings worden correct geparsed", () => {
  it("herkent #, ## en ### met het juiste niveau en de juiste tekst", () => {
    const markdown = ["# Basiskennis", "", "## 1. Wat is MijnLeerlijn?", "Tekst.", "", "### 1.1 Een subvraag", "Meer tekst."].join("\n");
    const headings = haalHeadingsOp(markdown);
    expect(headings).toEqual([
      { level: 1, text: "Basiskennis", slug: "basiskennis" },
      { level: 2, text: "1. Wat is MijnLeerlijn?", slug: "1-wat-is-mijnleerlijn" },
      { level: 3, text: "1.1 Een subvraag", slug: "1-1-een-subvraag" },
    ]);
  });

  it("een #### (dieper dan opdrachtseis §2) wordt NIET als heading herkend, blijft gewone tekst", () => {
    const headings = haalHeadingsOp("#### Geen kop\n\nGewone tekst.");
    expect(headings).toEqual([]);
  });

  it("een '#' zonder spatie erna is geen geldige heading (hashtag-achtige tekst in een zin)", () => {
    const headings = haalHeadingsOp("Dit is #geen-heading in een zin.");
    expect(headings).toEqual([]);
  });

  it("negeert headings binnen een ```-codeblok", () => {
    const markdown = ["## Echte kop", "```", "# Dit is geen kop, dit staat in een codeblok", "```", "Tekst na het codeblok."].join("\n");
    const headings = haalHeadingsOp(markdown);
    expect(headings).toEqual([{ level: 2, text: "Echte kop", slug: "echte-kop" }]);
  });

  it("strippt vetgedrukte/cursieve markdown-tekens uit de headingtekst zelf, maar behoudt de leesbare tekst", () => {
    const headings = haalHeadingsOp("## **6. De cyclus**");
    expect(headings).toEqual([{ level: 2, text: "6. De cyclus", slug: "6-de-cyclus" }]);
  });

  it("dubbele headings met identieke tekst krijgen nooit dezelfde slug (stabiele unieke slugs)", () => {
    const markdown = ["## Periode voorbereiden", "Tekst A.", "", "## Periode voorbereiden", "Tekst B."].join("\n");
    const headings = haalHeadingsOp(markdown);
    expect(headings.map((h) => h.slug)).toEqual(["periode-voorbereiden", "periode-voorbereiden-2"]);
    expect(new Set(headings.map((h) => h.slug)).size).toBe(2);
  });

  it("lege tekst geeft een lege headinglijst, geen fout", () => {
    expect(haalHeadingsOp("")).toEqual([]);
  });
});

describe("parseerMarkdownSecties — tekst vóór eerste heading krijgt een nette fallback", () => {
  it("tekst zonder enige heading wordt één sectie met heading:null (nooit weggegooid)", () => {
    const secties = parseerMarkdownSecties("Gewoon een alinea zonder koppen.");
    expect(secties).toEqual([{ heading: null, content: "Gewoon een alinea zonder koppen." }]);
  });

  it("tekst vóór de eerste heading krijgt heading:null, de rest hoort bij de juiste heading", () => {
    const markdown = ["Inleidende tekst vooraf.", "", "## 1. Eerste hoofdstuk", "Inhoud van hoofdstuk 1."].join("\n");
    const secties = parseerMarkdownSecties(markdown);
    expect(secties).toEqual([
      { heading: null, content: "Inleidende tekst vooraf." },
      { heading: { level: 2, text: "1. Eerste hoofdstuk", slug: "1-eerste-hoofdstuk" }, content: "Inhoud van hoofdstuk 1." },
    ]);
  });

  it("begint het document meteen met een heading, dan is er geen heading:null-sectie", () => {
    const secties = parseerMarkdownSecties("## Meteen een kop\nInhoud.");
    expect(secties).toHaveLength(1);
    expect(secties[0]!.heading).not.toBeNull();
  });

  it("elke heading — ongeacht niveau — start een eigen sectie (een ### valt niet 'binnen' de laatste ##)", () => {
    const markdown = ["## 4. De cyclus", "Overzichtstekst.", "", "### 4.1 Periode voorbereiden", "Subtekst."].join("\n");
    const secties = parseerMarkdownSecties(markdown);
    expect(secties).toHaveLength(2);
    expect(secties[0]).toEqual({ heading: { level: 2, text: "4. De cyclus", slug: "4-de-cyclus" }, content: "Overzichtstekst." });
    expect(secties[1]).toEqual({ heading: { level: 3, text: "4.1 Periode voorbereiden", slug: "4-1-periode-voorbereiden" }, content: "Subtekst." });
  });

  it("een heading direct gevolgd door een volgende heading levert een sectie met lege content op (nog steeds zichtbaar voor de TOC)", () => {
    const markdown = ["## Kop zonder eigen tekst", "### Meteen een subkop", "Inhoud."].join("\n");
    const secties = parseerMarkdownSecties(markdown);
    expect(secties[0]).toEqual({ heading: { level: 2, text: "Kop zonder eigen tekst", slug: "kop-zonder-eigen-tekst" }, content: "" });
  });

  it("lege tekst geeft een lege sectielijst, geen fout", () => {
    expect(parseerMarkdownSecties("")).toEqual([]);
  });

  it("de slugs uit parseerMarkdownSecties komen exact overeen met haalHeadingsOp voor hetzelfde document (gedeelde bron van waarheid)", () => {
    const markdown = ["## Periode voorbereiden", "A.", "", "## Periode voorbereiden", "B.", "", "### Een detail", "C."].join("\n");
    const headings = haalHeadingsOp(markdown);
    const secties = parseerMarkdownSecties(markdown);
    const sectieSlugs = secties.filter((s) => s.heading !== null).map((s) => s.heading!.slug);
    expect(sectieSlugs).toEqual(headings.map((h) => h.slug));
  });
});
