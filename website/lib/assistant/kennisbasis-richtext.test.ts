import { describe, it, expect } from "vitest";
import {
  tekstNaarRichText,
  richTextNaarGestructureerdeTekst,
  normaliseerVoorVergelijking,
} from "./kennisbasis-richtext";

describe("tekstNaarRichText", () => {
  it("zet een **kop**-regel om naar een h2-koptekstnode", () => {
    const richText = tekstNaarRichText("**Doel van dit document**\nGewone alinea.");
    expect(richText.root.children[0]).toMatchObject({ type: "heading", tag: "h2" });
    expect((richText.root.children[0] as { children: { text: string }[] }).children[0]?.text).toBe(
      "Doel van dit document"
    );
  });

  it("zet een *subkop*-regel om naar een h3-koptekstnode", () => {
    const richText = tekstNaarRichText("*De DOEL-aanpak*\nUitleg.");
    expect(richText.root.children[0]).toMatchObject({ type: "heading", tag: "h3" });
  });

  it("bundelt opeenvolgende '- item'-regels tot één lijst", () => {
    const richText = tekstNaarRichText("- Eerste\n- Tweede\n- Derde");
    expect(richText.root.children).toHaveLength(1);
    expect(richText.root.children[0]).toMatchObject({ type: "list" });
    const lijst = richText.root.children[0] as { children: { children: { text: string }[] }[] };
    expect(lijst.children.map((item) => item.children[0]?.text)).toEqual(["Eerste", "Tweede", "Derde"]);
  });

  it("zet een gewone regel om naar een paragraafnode", () => {
    const richText = tekstNaarRichText("Gewone tekst zonder opmaak.");
    expect(richText.root.children[0]).toMatchObject({ type: "paragraph" });
  });

  it("negeert lege regels tussen blokken", () => {
    const richText = tekstNaarRichText("**Kop**\n\nAlinea.\n\n- Item");
    expect(richText.root.children.map((n) => (n as { type: string }).type)).toEqual([
      "heading",
      "paragraph",
      "list",
    ]);
  });
});

describe("richTextNaarGestructureerdeTekst", () => {
  it("zet koppen om naar '## '/'### '-regels en lijsten naar '- '-regels", () => {
    const richText = tekstNaarRichText("**Hoofdkop**\n*Subkop*\nAlinea.\n- Een\n- Twee");
    const tekst = richTextNaarGestructureerdeTekst(richText);
    expect(tekst).toContain("## Hoofdkop");
    expect(tekst).toContain("### Subkop");
    expect(tekst).toContain("- Een\n- Twee");
    expect(tekst).toContain("Alinea.");
  });

  it("geeft lege string terug voor null/ongeldige input", () => {
    expect(richTextNaarGestructureerdeTekst(null)).toBe("");
    expect(richTextNaarGestructureerdeTekst(undefined)).toBe("");
    expect(richTextNaarGestructureerdeTekst({})).toBe("");
  });
});

describe("round-trip: tekstNaarRichText → richTextNaarGestructureerdeTekst → normaliseerVoorVergelijking", () => {
  it("is inhoudelijk verliesvrij voor een representatief, gemengd document", () => {
    const bron = [
      "**Kennisbasis MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI**",
      "",
      "**Doel van dit document**",
      "Dit document is geen handleiding op zich.",
      "Gebruik dit document als mentaal model.",
      "",
      "*De DOEL-aanpak (implementatiemethodiek van MijnLeerlijn zelf)*",
      "Dit is niet een schermfunctie maar de begeleidingsmethodiek.",
      "- D – Doel: wat willen we samen bereiken?",
      "- O – Organisatie: wat gebeurt er al?",
      "- E – Eigenaarschap: vakmanschap van de leerkracht versterken.",
      "",
      "Een losse afsluitende alinea zonder opmaak.",
    ].join("\n");

    const richText = tekstNaarRichText(bron);
    const teruggeconverteerd = richTextNaarGestructureerdeTekst(richText);

    expect(normaliseerVoorVergelijking(teruggeconverteerd)).toBe(normaliseerVoorVergelijking(bron));
  });

  it("blijft verliesvrij ongeacht de gebruikte opmaakstijl (** vs ##)", () => {
    const bron = "**Kop**\n- item een\n- item twee";
    const richText = tekstNaarRichText(bron);
    const teruggeconverteerd = richTextNaarGestructureerdeTekst(richText);

    // De teruggeconverteerde tekst gebruikt "## Kop", de bron "**Kop**" —
    // genormaliseerd moeten beide uitkomen op dezelfde kale inhoud.
    expect(teruggeconverteerd).toContain("## Kop");
    expect(normaliseerVoorVergelijking(teruggeconverteerd)).toBe(normaliseerVoorVergelijking(bron));
  });
});

describe("normaliseerVoorVergelijking", () => {
  it("verwijdert kop-/lijstmarkeringen en lege regels", () => {
    expect(normaliseerVoorVergelijking("**Kop**\n\n- item\n\nGewoon.")).toBe("Kop\nitem\nGewoon.");
  });
});
