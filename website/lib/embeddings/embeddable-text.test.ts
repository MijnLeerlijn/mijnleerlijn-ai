import { describe, it, expect } from "vitest";
import {
  buildKnowledgeSourceText,
  buildChapterText,
  buildKnowledgeDraftText,
  buildArticleText,
  buildHandleidingText,
  buildStapText,
  richTextNaarPlatteTekst,
} from "./embeddable-text";

// Minimale, geldige Lexical SerializedEditorState — convertLexicalToPlaintext
// valt zonder eigen `converters` terug op een generieke heuristiek (tekst-
// property gebruiken, anders children doorlopen), dus dit hoeft geen
// volledige/echte Lexical-node-typering te zijn.
function lexicalMet(...paragrafen: string[]): unknown {
  return {
    root: {
      type: "root",
      children: paragrafen.map((tekst) => ({
        type: "paragraph",
        children: [{ type: "text", text: tekst, format: 0 }],
      })),
    },
  };
}

describe("buildKnowledgeSourceText", () => {
  it("combineert titel, samenvatting, categorie en trefwoorden", () => {
    const tekst = buildKnowledgeSourceText({
      title: "Hoofdprofiel aanmaken",
      aiSummary: "Uitleg over het aanmaken van een hoofdprofiel.",
      aiCategory: "profielen",
      aiKeywords: ["hoofdprofiel", "aanmaken"],
    });
    expect(tekst).toContain("Hoofdprofiel aanmaken");
    expect(tekst).toContain("Uitleg over het aanmaken");
    expect(tekst).toContain("profielen");
    expect(tekst).toContain("hoofdprofiel, aanmaken");
  });

  it("laat lege/ontbrekende velden gewoon weg zonder fouten", () => {
    expect(buildKnowledgeSourceText({ title: "Alleen titel" })).toBe("Alleen titel");
  });
});

describe("buildChapterText", () => {
  it("combineert hoofdstuktitel en samenvatting", () => {
    expect(buildChapterText({ title: "Hoofdstuk 1", summary: "Korte samenvatting." })).toBe(
      "Hoofdstuk 1\n\nKorte samenvatting."
    );
  });
});

describe("buildKnowledgeDraftText", () => {
  it("combineert alle relevante velden van een conceptkennisartikel", () => {
    const tekst = buildKnowledgeDraftText({
      title: "Wachtwoord resetten",
      question: "Hoe reset ik mijn wachtwoord?",
      shortAnswer: "Ga naar Inloggen > Wachtwoord vergeten.",
      fullAnswer: "Klik op Inloggen en kies Wachtwoord vergeten.",
      category: "account",
      keywords: ["wachtwoord", "resetten"],
    });
    expect(tekst).toContain("Wachtwoord resetten");
    expect(tekst).toContain("Hoe reset ik mijn wachtwoord?");
    expect(tekst).toContain("account");
  });
});

describe("buildArticleText", () => {
  it("combineert titel, samenvatting, categorie en tags", () => {
    const tekst = buildArticleText({
      title: "Rapportage exporteren",
      summary: "Hoe je een rapportage naar PDF exporteert.",
      tags: ["rapportage", "pdf"],
      categoryTitle: "Rapportages",
    });
    expect(tekst).toContain("Rapportage exporteren");
    expect(tekst).toContain("Rapportages");
    expect(tekst).toContain("rapportage, pdf");
  });
});

describe("richTextNaarPlatteTekst", () => {
  it("zet Lexical richText om naar platte tekst", () => {
    const tekst = richTextNaarPlatteTekst(lexicalMet("Ga naar Beheer.", "Kies Hoofdgebiedprofielen."));
    expect(tekst).toContain("Ga naar Beheer.");
    expect(tekst).toContain("Kies Hoofdgebiedprofielen.");
  });

  it("geeft een lege string bij een lege/ontbrekende waarde, gooit geen fout", () => {
    expect(richTextNaarPlatteTekst(null)).toBe("");
    expect(richTextNaarPlatteTekst(undefined)).toBe("");
    expect(richTextNaarPlatteTekst("geen-object")).toBe("");
  });

  it("faalt niet hard op een onverwachte/kapotte structuur", () => {
    expect(richTextNaarPlatteTekst({ onverwacht: true })).toBe("");
  });
});

describe("buildHandleidingText", () => {
  it("combineert titel, korte omschrijving en zoekwoorden", () => {
    const tekst = buildHandleidingText({
      titel: "Hoofdgebiedprofiel aanmaken",
      korteOmschrijving: "Stap voor stap een nieuw profiel instellen.",
      zoekwoorden: ["profiel", "hoofdgebied"],
    });
    expect(tekst).toContain("Hoofdgebiedprofiel aanmaken");
    expect(tekst).toContain("Stap voor stap");
    expect(tekst).toContain("profiel, hoofdgebied");
  });
});

describe("buildStapText", () => {
  it("combineert staptitel, platte uitlegtekst, knop/schermnaam en zoekwoorden", () => {
    const tekst = buildStapText({
      titel: "Open Hoofdgebiedprofielen",
      uitleg: lexicalMet("Ga naar Beheer en kies Hoofdgebiedprofielen."),
      knopOfSchermnaam: "Beheer > Hoofdgebiedprofielen",
      zoekwoorden: ["hoofdgebied"],
    });
    expect(tekst).toContain("Open Hoofdgebiedprofielen");
    expect(tekst).toContain("Ga naar Beheer en kies Hoofdgebiedprofielen.");
    expect(tekst).toContain("Beheer > Hoofdgebiedprofielen");
    expect(tekst).toContain("hoofdgebied");
  });

  it("bevat nooit een interneNotitie (dat veld bestaat hier bewust niet)", () => {
    const tekst = buildStapText({ titel: "Stap", uitleg: lexicalMet("Tekst.") });
    expect(tekst).not.toContain("interneNotitie");
  });
});
