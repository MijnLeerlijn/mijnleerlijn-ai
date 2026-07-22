import { describe, it, expect } from "vitest";
import { samenvoegContent } from "./merge";
import type { Article, Section, ContentBlock, VariantOverride } from "@/types/content";

function maakArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "1",
    slug: "voorbeeld-artikel",
    title: "Voorbeeldartikel",
    summary: "Een korte samenvatting.",
    category: "starten",
    tags: [],
    knowledgeType: "product",
    status: "gepubliceerd",
    aiApprovalStatus: "n.v.t.",
    currentVersionId: null,
    lastContentUpdate: "2026-01-01",
    embeddingStatus: "pending",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

function maakSectie(id: string, order: number, title: string): Section {
  return { id, articleId: "1", order, title };
}

function maakTekstBlok(id: string, sectionId: string, order: number, body: string): ContentBlock {
  return { id, sectionId, order, type: "tekst", content: { body } };
}

function maakOverride(overrides: Partial<VariantOverride> = {}): VariantOverride {
  return {
    id: "ov-1",
    variantId: "monti",
    targetType: "block",
    targetId: "blok-1",
    action: "onveranderd",
    payload: null,
    termOverridesApplied: true,
    status: "gepubliceerd",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    editedBy: "user-1",
    ...overrides,
  };
}

const basisSecties = [
  {
    sectie: maakSectie("sectie-1", 1, "Stap 1: koppelen"),
    blokken: [maakTekstBlok("blok-1", "sectie-1", 1, "Koppel een doelenset aan een groep.")],
  },
];

describe("samenvoegContent — geen overrides", () => {
  it("geeft de centrale boom ongewijzigd terug", () => {
    const result = samenvoegContent(maakArticle(), basisSecties, []);
    expect(result).not.toBeNull();
    expect(result!.secties).toHaveLength(1);
    expect(result!.secties[0]!.blokken).toHaveLength(1);
    expect(result!.secties[0]!.blokken[0]!).toMatchObject({
      type: "tekst",
      content: { body: "Koppel een doelenset aan een groep." },
    });
  });

  it("is deterministisch — twee aanroepen met dezelfde input geven identieke output (pariteitswaarborg)", () => {
    const a = samenvoegContent(maakArticle(), basisSecties, []);
    const b = samenvoegContent(maakArticle(), basisSecties, []);
    expect(a).toEqual(b);
  });
});

describe("samenvoegContent — blokniveau", () => {
  it("verbergen: het blok verdwijnt volledig", () => {
    const override = maakOverride({ action: "verbergen", targetType: "block", targetId: "blok-1" });
    const result = samenvoegContent(maakArticle(), basisSecties, [override]);
    expect(result!.secties[0]!.blokken).toHaveLength(0);
  });

  it("vervangen: de blokinhoud wordt vervangen, positie blijft gelijk", () => {
    const override = maakOverride({
      action: "vervangen",
      targetType: "block",
      targetId: "blok-1",
      payload: { type: "tekst", content: { body: "Montessori-specifieke uitleg." } },
    });
    const result = samenvoegContent(maakArticle(), basisSecties, [override]);
    expect(result!.secties[0]!.blokken).toHaveLength(1);
    expect(result!.secties[0]!.blokken[0]!.content).toMatchObject({ body: "Montessori-specifieke uitleg." });
  });

  it("aanvullen: centrale tekst blijft staan, aanvulling verschijnt direct erna", () => {
    const override = maakOverride({
      action: "aanvullen",
      targetType: "block",
      targetId: "blok-1",
      payload: { type: "tekst", content: { body: "Aanvullende Montessori-context." } },
    });
    const result = samenvoegContent(maakArticle(), basisSecties, [override]);
    expect(result!.secties[0]!.blokken).toHaveLength(2);
    expect(result!.secties[0]!.blokken[0]!.content).toMatchObject({
      body: "Koppel een doelenset aan een groep.",
    });
    expect(result!.secties[0]!.blokken[1]!.content).toMatchObject({
      body: "Aanvullende Montessori-context.",
    });
  });

  it("invoegen_voor / invoegen_na: het centrale blok wordt niet aangeraakt", () => {
    const voor = maakOverride({
      action: "invoegen_voor",
      targetType: "block",
      targetId: "blok-1",
      payload: { type: "tip", content: { body: "Context vooraf." } },
    });
    const resultaatVoor = samenvoegContent(maakArticle(), basisSecties, [voor]);
    expect(resultaatVoor!.secties[0]!.blokken.map((b) => b.type)).toEqual(["tip", "tekst"]);

    const na = maakOverride({
      id: "ov-2",
      action: "invoegen_na",
      targetType: "block",
      targetId: "blok-1",
      payload: { type: "tip", content: { body: "Context achteraf." } },
    });
    const resultaatNa = samenvoegContent(maakArticle(), basisSecties, [na]);
    expect(resultaatNa!.secties[0]!.blokken.map((b) => b.type)).toEqual(["tekst", "tip"]);
  });

  it("ander_medium: alleen de media-referentie wijzigt, niet de tekst", () => {
    const secties = [
      {
        sectie: maakSectie("sectie-1", 1, "Sectie"),
        blokken: [
          {
            id: "blok-img",
            sectionId: "sectie-1",
            order: 1,
            type: "afbeelding" as const,
            content: { mediaId: "central-media", caption: "Origineel bijschrift" },
          },
        ],
      },
    ];
    const override = maakOverride({
      action: "ander_medium",
      targetType: "block",
      targetId: "blok-img",
      payload: { mediaId: "monti-media" },
    });
    const result = samenvoegContent(maakArticle(), secties, [override]);
    expect(result!.secties[0]!.blokken[0]!.content).toMatchObject({
      mediaId: "monti-media",
      caption: "Origineel bijschrift",
    });
  });
});

describe("samenvoegContent — sectieniveau", () => {
  it("verbergen op sectieniveau cascadeert naar alle onderliggende blokken", () => {
    const override = maakOverride({ action: "verbergen", targetType: "section", targetId: "sectie-1" });
    const result = samenvoegContent(maakArticle(), basisSecties, [override]);
    expect(result!.secties).toHaveLength(0);
  });

  it("vervangen op sectieniveau vervangt titel en blokken", () => {
    const override = maakOverride({
      action: "vervangen",
      targetType: "section",
      targetId: "sectie-1",
      payload: {
        title: "Montessori-versie",
        blocks: [{ type: "tekst", content: { body: "Andere aanpak." } }],
      },
    });
    const result = samenvoegContent(maakArticle(), basisSecties, [override]);
    expect(result!.secties[0]!.sectie.title).toBe("Montessori-versie");
    expect(result!.secties[0]!.blokken[0]!.content).toMatchObject({ body: "Andere aanpak." });
  });
});

describe("samenvoegContent — artikelniveau", () => {
  it("verbergen op artikelniveau geeft null (artikel bestaat niet voor deze variant)", () => {
    const override = maakOverride({ action: "verbergen", targetType: "article", targetId: "1" });
    const result = samenvoegContent(maakArticle(), basisSecties, [override]);
    expect(result).toBeNull();
  });

  it("vervangen op artikelniveau vervangt alleen de opgegeven velden", () => {
    const override = maakOverride({
      action: "vervangen",
      targetType: "article",
      targetId: "1",
      payload: { title: "MijnMonti-titel" },
    });
    const result = samenvoegContent(maakArticle(), basisSecties, [override]);
    expect(result!.article.title).toBe("MijnMonti-titel");
    expect(result!.article.summary).toBe("Een korte samenvatting.");
  });
});

describe("samenvoegContent — terminologiesubstitutie", () => {
  const woordenboek = [{ centralTerm: "doelenset", variantTerm: "leerlijnset" }];

  it("is standaard aan voor alle ongewijzigde centrale tekst", () => {
    const result = samenvoegContent(maakArticle(), basisSecties, [], woordenboek);
    expect(result!.secties[0]!.blokken[0]!.content).toMatchObject({
      body: "Koppel een leerlijnset aan een groep.",
    });
  });

  it("vervangt alleen hele woorden, geen substrings", () => {
    const secties = [
      {
        sectie: maakSectie("sectie-1", 1, "Sectie"),
        blokken: [maakTekstBlok("blok-1", "sectie-1", 1, "Een doelensetoverzicht is geen doelenset.")],
      },
    ];
    const result = samenvoegContent(maakArticle(), secties, [], woordenboek);
    expect(result!.secties[0]!.blokken[0]!.content).toMatchObject({
      body: "Een doelensetoverzicht is geen leerlijnset.",
    });
  });

  it("wordt overgeslagen voor override-content met termOverridesApplied = false", () => {
    const override = maakOverride({
      action: "vervangen",
      targetType: "block",
      targetId: "blok-1",
      termOverridesApplied: false,
      payload: { type: "tekst", content: { body: "Deze tekst noemt bewust een doelenset." } },
    });
    const result = samenvoegContent(maakArticle(), basisSecties, [override], woordenboek);
    expect(result!.secties[0]!.blokken[0]!.content).toMatchObject({
      body: "Deze tekst noemt bewust een doelenset.",
    });
  });
});
