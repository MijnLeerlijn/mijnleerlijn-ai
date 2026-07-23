import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchKnowledge } from "./similarity-search";
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
      { id: 1, title: "Wachtwoord resetten", embeddingStatus: "indexed", embedding: [1, 0, 0] },
      { id: 2, title: "Factuur exporteren als PDF", embeddingStatus: "indexed", embedding: [0, 1, 0] },
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
        { id: 1, title: "Nog niet geëmbed", embeddingStatus: "pending" },
        { id: 2, title: "Verouderd", embeddingStatus: "stale", embedding: [1, 0, 0] },
        { id: 3, title: "Wel geëmbed", embeddingStatus: "indexed", embedding: [1, 0, 0] },
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
        embeddingStatus: "indexed",
        embedding: [1, 0, 0],
      })),
    });

    const hits = await searchKnowledge(payload, { query: "wachtwoord", limiet: 2 });

    expect(hits).toHaveLength(2);
  });
});
