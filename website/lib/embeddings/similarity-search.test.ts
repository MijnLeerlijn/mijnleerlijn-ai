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
      { id: 1, title: "Wachtwoord resetten", status: "approved", embeddingStatus: "indexed", embedding: [1, 0, 0] },
      { id: 2, title: "Factuur exporteren als PDF", status: "approved", embeddingStatus: "indexed", embedding: [0, 1, 0] },
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
        { id: 1, title: "Nieuw, onbeoordeeld concept", status: "new", embeddingStatus: "indexed", embedding: [1, 0, 0] },
        { id: 2, title: "Afgekeurd concept", status: "rejected", embeddingStatus: "indexed", embedding: [1, 0, 0] },
        { id: 3, title: "Goedgekeurd concept", status: "approved", embeddingStatus: "indexed", embedding: [1, 0, 0] },
      ],
    });

    const hits = await searchKnowledge(payload, { query: "wachtwoord" });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: 3, type: "knowledge-draft" });
  });

  it("gebruikt ook een 'published' concept niet (dat is al apart als artikel geëmbed)", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [{ id: 1, title: "Al tot artikel verwerkt", status: "published", embeddingStatus: "indexed", embedding: [1, 0, 0] }],
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
