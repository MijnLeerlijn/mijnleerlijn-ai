import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchKnowledge, searchKnowledgePhased } from "./similarity-search";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { generateEmbedding } from "@/services/ai-client";

vi.mock("@/services/ai-client", () => ({
  generateEmbedding: vi.fn(),
  getEmbeddingModelId: () => "text-embedding-3-small-test",
}));

const mockGenerateEmbedding = vi.mocked(generateEmbedding);

// We kunnen in tests geen echte OpenAI-embeddings aanroepen. In plaats
// daarvan geeft deze mock voor de ZOEKVRAAG een handgemaakte vector terug
// op basis van welk "onderwerp" erin voorkomt (met opzet ruim genoeg om
// vergelijkbare formuleringen, synoniemen én typo's te herkennen) — dit test
// de RANGSCHIKKINGS-/similarity-logica van onze eigen code (cosineSimilarity,
// sortering, drempel/redenopbouw), niet de daadwerkelijke semantische
// kwaliteit van OpenAI's model (dat is geen code die wij beheren). De
// OPGESLAGEN documentvectoren worden rechtstreeks als vaste testfixtures
// meegegeven, niet via deze mock.
function naarQueryVector(query: string): number[] {
  const q = query.toLowerCase();
  if (/wachtwoord|paswoord|wagtwoord|paswoerd|wachwoord/.test(q)) return [0.95, 0.05, 0];
  if (/factuur|rekening|betaling/.test(q)) return [0.05, 0.95, 0];
  return [0, 0, 1];
}

beforeEach(() => {
  mockGenerateEmbedding.mockReset();
  mockGenerateEmbedding.mockImplementation(async (query: string) => naarQueryVector(query));
});

describe("searchKnowledge — vergelijkbare formuleringen, synoniemen en typo's", () => {
  const seed = {
    "knowledge-drafts": [
      {
        id: 1,
        title: "Wachtwoord resetten",
        status: "approved",
        embeddingStatus: "indexed",
        embedding: [1, 0, 0],
      },
      {
        id: 2,
        title: "Factuur exporteren als PDF",
        status: "approved",
        embeddingStatus: "indexed",
        embedding: [0, 1, 0],
      },
    ],
  };

  it("vindt het juiste document bij de oorspronkelijke formulering", async () => {
    const { payload } = maakFakePayload(seed);
    const hits = await searchKnowledge(payload, { query: "Hoe reset ik mijn wachtwoord?" });
    expect(hits[0]).toMatchObject({ id: 1, title: "Wachtwoord resetten" });
    expect(hits[0]!.similarity).toBeGreaterThan(0.9);
  });

  it("vindt hetzelfde document bij een synoniem ('paswoord' i.p.v. 'wachtwoord')", async () => {
    const { payload } = maakFakePayload(seed);
    const hits = await searchKnowledge(payload, { query: "Ik ben mijn paswoord vergeten" });
    expect(hits[0]).toMatchObject({ id: 1, title: "Wachtwoord resetten" });
  });

  it("vindt hetzelfde document ondanks een typfout ('wagtwoord')", async () => {
    const { payload } = maakFakePayload(seed);
    const hits = await searchKnowledge(payload, { query: "wagtwoord opnieuw instellen" });
    expect(hits[0]).toMatchObject({ id: 1, title: "Wachtwoord resetten" });
  });

  it("rangschikt een ander document bovenaan bij een andere zoekvraag (factuur/rekening)", async () => {
    const { payload } = maakFakePayload(seed);
    const hits = await searchKnowledge(payload, { query: "Hoe betaal ik mijn rekening?" });
    expect(hits[0]).toMatchObject({ id: 2, title: "Factuur exporteren als PDF" });
  });
});

describe("searchKnowledge — dubbele documenten", () => {
  it("geeft beide bijna-identieke documenten terug, correct gerangschikt, zonder te crashen", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Wachtwoord resetten (handleiding)",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
        {
          id: 2,
          title: "Wachtwoord resetten (kopie)",
          embeddingStatus: "indexed",
          embedding: [0.99, 0.01, 0],
        },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "Hoe reset ik mijn wachtwoord?" });

    expect(hits).toHaveLength(2);
    expect(hits[0]!.similarity).toBeGreaterThanOrEqual(hits[1]!.similarity);
    expect(hits.map((h) => h.id).sort()).toEqual([1, 2]);
  });
});

describe("searchKnowledge — hoofdstuk-niveau treffers", () => {
  it("geeft het specifieke hoofdstuk terug wanneer dat de beste match is, niet alleen de bron", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Grote handleiding",
          embeddingStatus: "indexed",
          embedding: [0, 0, 1], // de bron zelf gaat over iets anders
          chapters: [
            { title: "Hoofdstuk 3: Wachtwoord resetten", summary: "...", order: 3, embedding: [1, 0, 0] },
          ],
        },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "Hoe reset ik mijn wachtwoord?" });

    expect(hits[0]).toMatchObject({
      type: "knowledge-source-chapter",
      id: 1,
      title: "Grote handleiding",
      chapterTitle: "Hoofdstuk 3: Wachtwoord resetten",
    });
    expect(hits[0]!.reason).toContain("Hoofdstuk 3: Wachtwoord resetten");
  });
});

describe("searchKnowledge — algemeen", () => {
  it("negeert documenten zonder embedding (nog niet geëmbed) en documenten met status anders dan 'indexed'", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [
        { id: 1, title: "Nog niet geëmbed", status: "approved", embeddingStatus: "pending" },
        { id: 2, title: "Verouderd", status: "approved", embeddingStatus: "stale", embedding: [1, 0, 0] },
        { id: 3, title: "Wel geëmbed", status: "approved", embeddingStatus: "indexed", embedding: [1, 0, 0] },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "wachtwoord" });

    expect(hits).toHaveLength(1);
    expect(hits[0]!.id).toBe(3);
  });

  it("respecteert de opgegeven limiet", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        title: `Concept ${i + 1}`,
        status: "approved",
        embeddingStatus: "indexed",
        embedding: [1, 0, 0],
      })),
    });

    const hits = await searchKnowledge(payload, { query: "wachtwoord", limiet: 2 });

    expect(hits).toHaveLength(2);
  });
});

describe("searchKnowledge — Sprint 6: alleen goedgekeurde Knowledge Drafts", () => {
  it("gebruikt een 'approved' concept als bron, maar niet een 'new' (nog niet beoordeeld) of 'rejected' concept", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [
        {
          id: 1,
          title: "Nieuw, onbeoordeeld concept",
          status: "new",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
        {
          id: 2,
          title: "Afgekeurd concept",
          status: "rejected",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
        {
          id: 3,
          title: "Goedgekeurd concept",
          status: "approved",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "wachtwoord" });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: 3, type: "knowledge-draft" });
  });

  it("gebruikt ook een 'published' concept niet (dat is al apart als artikel geëmbed)", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [
        {
          id: 1,
          title: "Al tot artikel verwerkt",
          status: "published",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "wachtwoord" });

    expect(hits).toHaveLength(0);
  });

  it("vindt na synchronisatie zowel een relevante handleiding (knowledge-source) als een bruikbare Knowledge Draft samen, correct gerangschikt", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Handleiding: wachtwoord resetten",
          type: "pdf",
          embeddingStatus: "indexed",
          embedding: [1, 0, 0],
        },
      ],
      "knowledge-drafts": [
        {
          id: 2,
          title: "Support-antwoord: wachtwoord vergeten",
          status: "approved",
          embeddingStatus: "indexed",
          embedding: [0.9, 0.1, 0],
        },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "wachtwoord" });

    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.type).sort()).toEqual(["knowledge-draft", "knowledge-source"]);
    // De handleiding heeft de hogere similarity en staat dus vooraan.
    expect(hits[0]).toMatchObject({ type: "knowledge-source", id: 1 });
    expect(hits[1]).toMatchObject({ type: "knowledge-draft", id: 2 });
  });
});

describe("searchKnowledgePhased — gefaseerd zoeken op Knowledge Source-prioriteit", () => {
  const DREMPEL = 0.5; // exact MIN_SIMILARITY_VOOR_ANTWOORD uit lib/assistant/answer.ts, hier als letterlijk getal om geen cross-import (zie similarity-search.ts) nodig te hebben.

  // query = [1, 0, 0] (unit vector) — een kandidaat-embedding [x, sqrt(1-x²), 0]
  // (ook unit-lengte) geeft dan cosineSimilarity === x, exact. Zo kunnen scores
  // precies op de drempel/vergelijkbaarheid afgestemd worden zonder gokken.
  function embeddingVoorScore(score: number): number[] {
    return [score, Math.sqrt(1 - score * score), 0];
  }

  beforeEach(() => {
    mockGenerateEmbedding.mockResolvedValue([1, 0, 0]);
  });

  it("1. Voldoende goede core-resultaten: secondary en reference worden niet geselecteerd", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Core A",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.9),
        },
        {
          id: 2,
          title: "Core B",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.8),
        },
        {
          id: 3,
          title: "Secondary (hogere score dan beide core-resultaten)",
          priority: "secondary",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.95),
        },
        {
          id: 4,
          title: "Reference (hoogste score van allemaal)",
          priority: "reference",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.99),
        },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 2,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.fase).toBe("core");
    expect(resultaat.hits.map((h) => h.id).sort()).toEqual([1, 2]);
    expect(resultaat.hits.some((h) => h.id === 3 || h.id === 4)).toBe(false);
    expect(resultaat.aantalVoldoendePerPrioriteit).toEqual({ core: 2, secondary: 1, reference: 1 });
  });

  it("2. Onvoldoende core-resultaten: secondary wordt toegevoegd, reference niet", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Core (enige)",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.9),
        },
        {
          id: 2,
          title: "Secondary A",
          priority: "secondary",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.8),
        },
        {
          id: 3,
          title: "Secondary B",
          priority: "secondary",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.7),
        },
        {
          id: 4,
          title: "Reference (zou ook meetellen als 'ie nodig was)",
          priority: "reference",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.99),
        },
      ],
    });

    // limiet 3: core alleen (1 voldoende resultaat) is te weinig, core+secondary (1+2=3) is precies genoeg.
    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 3,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.fase).toBe("core+secondary");
    expect(resultaat.hits.map((h) => h.id).sort()).toEqual([1, 2, 3]);
    expect(resultaat.hits.some((h) => h.id === 4)).toBe(false);
  });

  it("3. Onvoldoende core én secondary: reference wordt toegevoegd", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Core (enige)",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.9),
        },
        {
          id: 2,
          title: "Secondary (enige)",
          priority: "secondary",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.8),
        },
        {
          id: 3,
          title: "Reference A",
          priority: "reference",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.7),
        },
        {
          id: 4,
          title: "Reference B",
          priority: "reference",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.6),
        },
      ],
    });

    // limiet 5: core (1) en core+secondary (2) zijn allebei te weinig, pas core+secondary+reference (4) is genoeg.
    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 5,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.fase).toBe("core+secondary+reference");
    expect(resultaat.hits.map((h) => h.id).sort()).toEqual([1, 2, 3, 4]);
  });

  it("4. Vergelijkbare scores: core wint van secondary, secondary wint van reference", async () => {
    const gedeeldeScore = embeddingVoorScore(0.8); // exact dezelfde score voor alle drie
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Reference",
          priority: "reference",
          embeddingStatus: "indexed",
          embedding: gedeeldeScore,
        },
        { id: 2, title: "Core", priority: "core", embeddingStatus: "indexed", embedding: gedeeldeScore },
        {
          id: 3,
          title: "Secondary",
          priority: "secondary",
          embeddingStatus: "indexed",
          embedding: gedeeldeScore,
        },
      ],
    });

    // limiet ruim hoger dan het totaal aantal kandidaten (3): dwingt volledige
    // escalatie af (core+secondary+reference), zodat alle drie meedoen en de
    // tie-break-sortering op prioriteit puur getest wordt, los van fasering.
    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 10,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.fase).toBe("core+secondary+reference");
    expect(resultaat.hits.map((h) => h.id)).toEqual([2, 3, 1]); // core (2) > secondary (3) > reference (1)
  });

  it("5. Geen regressie: Articles en Knowledge Drafts blijven vindbaar, ongeacht de fasering op Knowledge Sources", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Core A",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.9),
        },
        {
          id: 2,
          title: "Core B",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.8),
        },
      ],
      "knowledge-drafts": [
        {
          id: 3,
          title: "Support-antwoord",
          status: "approved",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.6),
        },
      ],
      articles: [
        {
          id: 4,
          title: "Gepubliceerd artikel",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.55),
        },
      ],
    });

    // limiet 4 (= precies het totaal aantal kandidaten): niemand valt buiten
    // de uiteindelijke top-N door afkappen — dit test specifiek dat drafts/
    // articles nooit door de fase-logica zelf uit de kandidatenpool worden
    // gefilterd (ze horen niet bij een prioriteitstier en doen dus ALTIJD
    // mee, ongeacht welke fase op de knowledge-sources wordt gekozen).
    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 4,
      drempelVoorVoldoende: DREMPEL,
    });

    const idsInResultaat = resultaat.hits.map((h) => h.id);
    expect(idsInResultaat.sort()).toEqual([1, 2, 3, 4]);
    expect(resultaat.hits.find((h) => h.id === 3)).toMatchObject({ type: "knowledge-draft" });
    expect(resultaat.hits.find((h) => h.id === 4)).toMatchObject({ type: "article" });
  });

  it("negeert geen kandidaat en telt niets dubbel (deduplicatie): elke bron komt precies één keer voor", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Core",
          priority: "core",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.9),
        },
        {
          id: 2,
          title: "Secondary",
          priority: "secondary",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.6),
        },
        {
          id: 3,
          title: "Reference",
          priority: "reference",
          embeddingStatus: "indexed",
          embedding: embeddingVoorScore(0.55),
        },
      ],
    });

    const resultaat = await searchKnowledgePhased(payload, {
      query: "iets",
      limiet: 10,
      drempelVoorVoldoende: DREMPEL,
    });

    expect(resultaat.fase).toBe("core+secondary+reference");
    const ids = resultaat.hits.map((h) => h.id);
    expect(ids).toHaveLength(new Set(ids).size);
  });
});
