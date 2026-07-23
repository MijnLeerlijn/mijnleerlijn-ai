import { describe, it, expect } from "vitest";
import {
  buildKnowledgeSourceText,
  buildChapterText,
  buildKnowledgeDraftText,
  buildArticleText,
} from "./embeddable-text";

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
