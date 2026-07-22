import { describe, it, expect } from "vitest";
import { mapArticle, mapBlock, mapCategory, mapSource, mapVariant } from "./payload";
import { zoekMedia } from "@/lib/data/media";
import { plainTextToLexical } from "@/payload/lexical";
import type {
  PayloadArticleDoc,
  PayloadCategoryDoc,
  PayloadContentBlockDoc,
  PayloadSourceDoc,
  PayloadVariantDoc,
} from "@/payload/types";

describe("mapBlock", () => {
  it("zet een tekst-blok om naar HTML via de Lexical-converter", () => {
    const doc: PayloadContentBlockDoc = {
      id: "b1",
      blockType: "tekst",
      body: plainTextToLexical("Hallo wereld"),
    };
    const blok = mapBlock(doc, 1, { n: 0 });
    expect(blok.type).toBe("tekst");
    if (blok.type === "tekst") expect(blok.content.body).toContain("Hallo wereld");
  });

  it("nummert genummerde_stap-blokken oplopend via de gedeelde teller", () => {
    const stapTeller = { n: 0 };
    const stap1 = mapBlock({ id: "b1", blockType: "genummerde_stap", body: "Eerste stap" }, 1, stapTeller);
    const stap2 = mapBlock({ id: "b2", blockType: "genummerde_stap", body: "Tweede stap" }, 2, stapTeller);
    expect(stap1.type === "genummerde_stap" && stap1.content.stepNumber).toBe(1);
    expect(stap2.type === "genummerde_stap" && stap2.content.stepNumber).toBe(2);
  });

  it("zet waarschuwing/tip/video/contact_doorverwijzing om zonder wijzigingen aan de tekst", () => {
    const waarschuwing = mapBlock({ id: "b1", blockType: "waarschuwing", body: "Let op" }, 1, { n: 0 });
    expect(waarschuwing.type === "waarschuwing" && waarschuwing.content.body).toBe("Let op");

    const video = mapBlock({ id: "b2", blockType: "video", url: "https://example.com/v.mp4" }, 1, { n: 0 });
    expect(video.type === "video" && video.content.url).toBe("https://example.com/v.mp4");

    const contact = mapBlock(
      { id: "b3", blockType: "contact_doorverwijzing", body: "Vraag?", prefilledSubject: "Onderwerp" },
      1,
      { n: 0 }
    );
    expect(contact.type === "contact_doorverwijzing" && contact.content.prefilledSubject).toBe("Onderwerp");
  });
});

describe("mapArticle", () => {
  const basisArtikel: PayloadArticleDoc = {
    id: 1,
    title: "Voorbeeldartikel",
    slug: "voorbeeldartikel",
    summary: "Een korte samenvatting.",
    category: { id: 10, slug: "starten", title: "Starten", icon: "Rocket", color: "blauw", description: "" },
    tags: ["a", "b"],
    knowledgeType: "product",
    articleStatus: "gepubliceerd",
    aiApprovalStatus: "n.v.t.",
    embeddingStatus: "indexed",
    lastContentUpdate: "2026-05-01",
    sources: [],
    relatedArticles: [],
    sections: [
      {
        id: "sec-1",
        title: "Eerste sectie",
        blocks: [
          { id: "b1", blockType: "genummerde_stap", body: "Stap één" },
          { id: "b2", blockType: "genummerde_stap", body: "Stap twee" },
        ],
      },
      {
        id: "sec-2",
        title: "Tweede sectie",
        blocks: [{ id: "b3", blockType: "genummerde_stap", body: "Stap één van sectie twee" }],
      },
    ],
    createdAt: "2026-05-01",
    updatedAt: "2026-05-01",
  };

  it("zet categorie, secties en samenvatting correct om", () => {
    const artikel = mapArticle(basisArtikel);
    expect(artikel.id).toBe("1");
    expect(artikel.categorySlug).toBe("starten");
    expect(artikel.categoryTitle).toBe("Starten");
    expect(artikel.summary).toBe("Een korte samenvatting.");
    expect(artikel.sections).toHaveLength(2);
    expect(artikel.sections[0]?.title).toBe("Eerste sectie");
  });

  it("begint de stapnummering opnieuw bij elke nieuwe sectie", () => {
    const artikel = mapArticle(basisArtikel);
    const eersteSectieStap2 = artikel.sections[0]?.blocks[1];
    const tweedeSectieStap1 = artikel.sections[1]?.blocks[0];
    expect(eersteSectieStap2?.type === "genummerde_stap" && eersteSectieStap2.content.stepNumber).toBe(2);
    expect(tweedeSectieStap1?.type === "genummerde_stap" && tweedeSectieStap1.content.stepNumber).toBe(1);
  });

  it("gaat om met een niet-opgehaalde (numerieke) categorie-relatie", () => {
    const artikel = mapArticle({ ...basisArtikel, category: 42 });
    expect(artikel.categorySlug).toBe("42");
  });

  it("registreert media van afbeelding/download-blokken zodat zoekMedia() ze kan vinden", () => {
    const metAfbeelding: PayloadArticleDoc = {
      ...basisArtikel,
      sections: [
        {
          id: "sec-1",
          title: "Sectie met afbeelding",
          blocks: [
            {
              id: "b1",
              blockType: "afbeelding",
              media: { id: 123, url: "https://cdn.test/afbeelding.png", altText: "Een afbeelding" },
            },
          ],
        },
      ],
    };
    mapArticle(metAfbeelding);
    const media = zoekMedia("123");
    expect(media?.url).toBe("https://cdn.test/afbeelding.png");
    expect(media?.altText).toBe("Een afbeelding");
  });
});

describe("mapVariant", () => {
  const basisVariant: PayloadVariantDoc = {
    id: 5,
    name: "MijnMonti",
    slug: "mijnmonti",
    status: "actief",
    educationType: "montessori",
    domain: { type: "slug_path", value: "mijnmonti", domainStatus: "slug_path" },
    branding: { accentColor: "#1588c9", productName: "MijnMonti", tagline: "Tagline", isPlaceholder: true },
  };

  it("valt terug op het standaardlogo wanneer er geen logo is geüpload", () => {
    const variant = mapVariant(basisVariant);
    expect(variant.id).toBe("5");
    expect(variant.branding.logoUrl).toBe("/brand/logo-kleur.svg");
  });

  it("geeft een lege terminologyDictionary terug wanneer die ontbreekt", () => {
    const variant = mapVariant(basisVariant);
    expect(variant.terminologyDictionary).toEqual([]);
  });
});

describe("mapCategory / mapSource", () => {
  it("mapt een categorie-document naar het Nederlandse veldnamenmodel", () => {
    const doc: PayloadCategoryDoc = {
      id: 10,
      title: "Doelen & Planning",
      slug: "doelen-planning",
      icon: "Target",
      color: "blauw",
      description: "Uitleg",
    };
    expect(mapCategory(doc)).toMatchObject({
      id: "10",
      titel: "Doelen & Planning",
      icoon: "Target",
      kleur: "blauw",
    });
  });

  it("mapt een bron-document inclusief betrouwbaarheid", () => {
    const doc: PayloadSourceDoc = {
      id: 7,
      title: "Handleiding X",
      type: "interne_handleiding",
      reliability: "hoog",
    };
    expect(mapSource(doc)).toMatchObject({ titel: "Handleiding X", betrouwbaarheid: "hoog" });
  });
});
