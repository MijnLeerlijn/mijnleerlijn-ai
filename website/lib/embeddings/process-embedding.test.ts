import { describe, it, expect, vi, beforeEach } from "vitest";
import { embedKnowledgeSource, embedKnowledgeDraft, embedArticle } from "./process-embedding";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { generateEmbedding } from "@/services/ai-client";

vi.mock("@/services/ai-client", () => ({
  generateEmbedding: vi.fn(),
  getEmbeddingModelId: () => "text-embedding-3-small-test",
}));

const mockGenerateEmbedding = vi.mocked(generateEmbedding);

beforeEach(() => {
  mockGenerateEmbedding.mockReset();
  mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
});

describe("embedKnowledgeSource", () => {
  it("embedt een bron zonder hoofdstukken en schrijft alle embeddingvelden weg", async () => {
    const { payload, collection } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Release notes juli",
          aiSummary: "Samenvatting.",
          aiCategory: "release",
          aiKeywords: [],
          embeddingStatus: "pending",
        },
      ],
    });

    const uitkomst = await embedKnowledgeSource(payload, 1);

    expect(uitkomst).toEqual({ type: "embedded" });
    const doc = collection("knowledge-sources")[0]!;
    expect(doc.embeddingStatus).toBe("indexed");
    expect(doc.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(doc.embeddingModel).toBe("text-embedding-3-small-test");
    expect(doc.embeddedAt).toBeTruthy();
  });

  it("embedt elk hoofdstuk apart naast de bron zelf", async () => {
    const { payload, collection } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Handleiding",
          aiSummary: "Samenvatting.",
          embeddingStatus: "pending",
          chapters: [
            { id: "c1", title: "Hoofdstuk 1", summary: "Inleiding.", order: 1 },
            { id: "c2", title: "Hoofdstuk 2", summary: "Aan de slag.", order: 2 },
          ],
        },
      ],
    });

    await embedKnowledgeSource(payload, 1);

    const doc = collection("knowledge-sources")[0]!;
    const chapters = doc.chapters as { embedding: number[]; embeddingTextHash: string }[];
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(chapters[1]!.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(3); // bron zelf + 2 hoofdstukken
  });

  it("slaat een ongewijzigde, al geïndexeerde bron over bij herembedden ('opnieuw embedden')", async () => {
    const { payload } = maakFakePayload({
      "knowledge-sources": [{ id: 1, title: "Bron", aiSummary: "Samenvatting.", embeddingStatus: "pending" }],
    });

    const eerste = await embedKnowledgeSource(payload, 1);
    mockGenerateEmbedding.mockClear();
    const tweede = await embedKnowledgeSource(payload, 1);

    expect(eerste).toEqual({ type: "embedded" });
    expect(tweede).toEqual({ type: "skipped" });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("embedt opnieuw wanneer de AI-samenvatting is gewijzigd ('gewijzigde PDF')", async () => {
    const { payload, collection } = maakFakePayload({
      "knowledge-sources": [
        { id: 1, title: "Bron", aiSummary: "Oude samenvatting.", embeddingStatus: "pending" },
      ],
    });

    await embedKnowledgeSource(payload, 1);
    // Simuleert een herindexering na een gewijzigde PDF (Sprint 3): nieuwe aiSummary.
    collection("knowledge-sources")[0]!.aiSummary = "Nieuwe samenvatting na gewijzigde PDF.";
    mockGenerateEmbedding.mockClear();

    const uitkomst = await embedKnowledgeSource(payload, 1);

    expect(uitkomst).toEqual({ type: "embedded" });
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
  });
});

describe("embedKnowledgeDraft", () => {
  it("embedt een conceptkennisartikel", async () => {
    const { payload, collection } = maakFakePayload({
      "knowledge-drafts": [
        {
          id: 1,
          title: "Wachtwoord resetten",
          question: "Hoe?",
          shortAnswer: "Zo.",
          embeddingStatus: "pending",
        },
      ],
    });

    const uitkomst = await embedKnowledgeDraft(payload, 1);

    expect(uitkomst).toEqual({ type: "embedded" });
    expect(collection("knowledge-drafts")[0]!.embeddingStatus).toBe("indexed");
  });

  it("slaat een ongewijzigd concept over bij herembedden", async () => {
    const { payload } = maakFakePayload({
      "knowledge-drafts": [{ id: 1, title: "Concept", question: "Vraag?", embeddingStatus: "pending" }],
    });

    await embedKnowledgeDraft(payload, 1);
    mockGenerateEmbedding.mockClear();
    const uitkomst = await embedKnowledgeDraft(payload, 1);

    expect(uitkomst).toEqual({ type: "skipped" });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });
});

describe("embedArticle", () => {
  it("embedt een gepubliceerd product-artikel", async () => {
    const { payload, collection } = maakFakePayload({
      articles: [
        {
          id: 1,
          title: "Rapportage exporteren",
          summary: "Uitleg.",
          articleStatus: "gepubliceerd",
          knowledgeType: "product",
          embeddingStatus: "pending",
        },
      ],
    });

    const uitkomst = await embedArticle(payload, 1);

    expect(uitkomst).toEqual({ type: "embedded" });
    expect(collection("articles")[0]!.embeddingStatus).toBe("indexed");
  });

  it("negeert een niet-gepubliceerd artikel (concept)", async () => {
    const { payload } = maakFakePayload({
      articles: [
        {
          id: 1,
          title: "Nog concept",
          summary: "Uitleg.",
          articleStatus: "concept",
          knowledgeType: "product",
          embeddingStatus: "pending",
        },
      ],
    });

    const uitkomst = await embedArticle(payload, 1);

    expect(uitkomst).toMatchObject({ type: "ignored" });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("negeert pedagogische content zonder AI-goedkeuring", async () => {
    const { payload } = maakFakePayload({
      articles: [
        {
          id: 1,
          title: "Montessori-implementatie",
          summary: "Uitleg.",
          articleStatus: "gepubliceerd",
          knowledgeType: "pedagogisch",
          aiApprovalStatus: "in_afwachting",
          embeddingStatus: "pending",
        },
      ],
    });

    const uitkomst = await embedArticle(payload, 1);

    expect(uitkomst).toMatchObject({ type: "ignored" });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("embedt goedgekeurde pedagogische content wel", async () => {
    const { payload } = maakFakePayload({
      articles: [
        {
          id: 1,
          title: "Montessori-implementatie",
          summary: "Uitleg.",
          articleStatus: "gepubliceerd",
          knowledgeType: "pedagogisch",
          aiApprovalStatus: "goedgekeurd",
          embeddingStatus: "pending",
        },
      ],
    });

    const uitkomst = await embedArticle(payload, 1);

    expect(uitkomst).toEqual({ type: "embedded" });
  });
});
