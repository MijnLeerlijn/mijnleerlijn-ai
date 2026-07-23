import { describe, it, expect } from "vitest";
import { findSimilarArticle, findSimilarDraft } from "./dedup";
import { maakFakePayload } from "./fake-payload";

describe("findSimilarDraft", () => {
  it("vindt een bestaand concept bij voldoende trefwoordoverlap", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [
        {
          id: 1,
          title: "Hoofdprofiel aanmaken lukt niet",
          question: "Hoe maak ik een nieuw hoofdprofiel aan?",
          category: "profielen",
          keywords: ["hoofdprofiel", "aanmaken"],
        },
      ],
    });

    const gevonden = await findSimilarDraft(payload, {
      title: "Nieuw hoofdprofiel toevoegen",
      question: "Hoe voeg ik een hoofdprofiel toe aan mijn account?",
      category: "profielen",
      keywords: ["hoofdprofiel"],
    });

    expect(gevonden).toEqual({ id: 1, title: "Hoofdprofiel aanmaken lukt niet" });
  });

  it("geeft null terug bij onvoldoende overlap (ander onderwerp)", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [
        {
          id: 1,
          title: "Wachtwoord resetten",
          question: "Hoe reset ik mijn wachtwoord?",
          category: "account",
          keywords: ["wachtwoord"],
        },
      ],
    });

    const gevonden = await findSimilarDraft(payload, {
      title: "Rapportage exporteren als PDF",
      question: "Hoe exporteer ik een rapportage naar PDF?",
      category: "rapportages",
      keywords: ["export", "pdf"],
    });

    expect(gevonden).toBeNull();
  });

  it("geeft null terug wanneer er nog geen concepten bestaan", async () => {
    const { payload } = maakFakePayload({});
    const gevonden = await findSimilarDraft(payload, {
      title: "Iets",
      question: "Iets vraag",
      category: "cat",
      keywords: [],
    });
    expect(gevonden).toBeNull();
  });
});

describe("findSimilarArticle", () => {
  it("vindt alleen gepubliceerde artikelen met voldoende overlap", async () => {
    const { payload } = maakFakePayload({
      articles: [
        {
          id: 5,
          title: "Hoofdprofiel aanmaken",
          slug: "hoofdprofiel-aanmaken",
          summary: "Uitleg over het aanmaken van een hoofdprofiel",
          tags: ["profielen"],
          articleStatus: "gepubliceerd",
        },
        {
          id: 6,
          title: "Hoofdprofiel verwijderen (concept)",
          slug: "hoofdprofiel-verwijderen",
          summary: "Nog niet gepubliceerd",
          tags: ["profielen"],
          articleStatus: "concept",
        },
      ],
    });

    const gevonden = await findSimilarArticle(payload, {
      title: "Hoofdprofiel toevoegen",
      question: "Hoe maak ik een hoofdprofiel aan?",
      category: "profielen",
      keywords: ["hoofdprofiel"],
    });

    expect(gevonden).toEqual({ id: 5, title: "Hoofdprofiel aanmaken", slug: "hoofdprofiel-aanmaken" });
  });
});
