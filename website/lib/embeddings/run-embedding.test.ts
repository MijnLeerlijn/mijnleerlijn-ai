import { describe, it, expect, vi, beforeEach } from "vitest";
import { runKnowledgeEmbedding, STANDAARD_LIMIET } from "./run-embedding";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { embedKnowledgeSource, embedKnowledgeDraft, embedArticle } from "./process-embedding";

vi.mock("./process-embedding", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./process-embedding")>();
  return { ...echt, embedKnowledgeSource: vi.fn(), embedKnowledgeDraft: vi.fn(), embedArticle: vi.fn() };
});

const mockSource = vi.mocked(embedKnowledgeSource);
const mockDraft = vi.mocked(embedKnowledgeDraft);
const mockArticle = vi.mocked(embedArticle);

function maakBron(id: number, overrides: Record<string, unknown> = {}) {
  return { id, title: `Bron ${id}`, embeddingStatus: "pending", ...overrides };
}

beforeEach(() => {
  mockSource.mockReset();
  mockDraft.mockReset();
  mockArticle.mockReset();
});

describe("runKnowledgeEmbedding — selectie binnen één collectie", () => {
  it("kiest zonder ids automatisch tot STANDAARD_LIMIET pending/stale documenten binnen de opgegeven collectie", async () => {
    mockSource.mockResolvedValue({ type: "embedded" });
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        maakBron(1, { embeddingStatus: "indexed" }),
        ...Array.from({ length: 8 }, (_, i) => maakBron(100 + i)),
      ],
    });

    await runKnowledgeEmbedding(payload, { collection: "knowledge-sources" });

    expect(mockSource).toHaveBeenCalledTimes(STANDAARD_LIMIET);
    expect(mockDraft).not.toHaveBeenCalled();
    expect(mockArticle).not.toHaveBeenCalled();
  });

  it("verwerkt met expliciete ids + collection precies die selectie, ongeacht status", async () => {
    mockDraft.mockResolvedValue({ type: "embedded" });
    const { payload } = maakFakePayload({
      "knowledge-drafts": [maakBron(1, { embeddingStatus: "indexed" }), maakBron(2)],
    });

    await runKnowledgeEmbedding(payload, { collection: "knowledge-drafts", ids: [1, 2] });

    expect(mockDraft).toHaveBeenCalledTimes(2);
  });

  it("herembedt een reeds geïndexeerd document gewoon opnieuw wanneer expliciet geselecteerd", async () => {
    mockSource.mockResolvedValue({ type: "skipped" });
    const { payload } = maakFakePayload({
      "knowledge-sources": [maakBron(1, { embeddingStatus: "indexed" })],
    });

    const samenvatting = await runKnowledgeEmbedding(payload, { collection: "knowledge-sources", ids: [1] });

    expect(mockSource).toHaveBeenCalledTimes(1);
    expect(samenvatting.overgeslagen).toBe(1);
  });

  it("begrenst een expliciete ids-selectie op de harde veiligheidscap (25)", async () => {
    mockSource.mockResolvedValue({ type: "embedded" });
    const docs = Array.from({ length: 30 }, (_, i) => maakBron(i + 1));
    const { payload } = maakFakePayload({ "knowledge-sources": docs });

    await runKnowledgeEmbedding(payload, { collection: "knowledge-sources", ids: docs.map((d) => d.id) });

    expect(mockSource).toHaveBeenCalledTimes(25);
  });
});

describe("runKnowledgeEmbedding — zonder collection: alle drie verwerkt", () => {
  it("verwerkt elke collectie apart tot de limiet, zonder gedeeld budget", async () => {
    mockSource.mockResolvedValue({ type: "embedded" });
    mockDraft.mockResolvedValue({ type: "embedded" });
    mockArticle.mockResolvedValue({ type: "embedded" });
    const { payload } = maakFakePayload({
      "knowledge-sources": Array.from({ length: 3 }, (_, i) => maakBron(i + 1)),
      "knowledge-drafts": Array.from({ length: 2 }, (_, i) => maakBron(i + 1)),
      articles: [{ id: 1, title: "Artikel", articleStatus: "gepubliceerd", embeddingStatus: "pending" }],
    });

    const samenvatting = await runKnowledgeEmbedding(payload, {});

    expect(mockSource).toHaveBeenCalledTimes(3);
    expect(mockDraft).toHaveBeenCalledTimes(2);
    expect(mockArticle).toHaveBeenCalledTimes(1);
    expect(samenvatting.geembed).toBe(6);
  });
});

describe("runKnowledgeEmbedding — resultaattelling", () => {
  it("telt genegeerd (bv. ongepubliceerd artikel) apart van mislukt", async () => {
    mockArticle.mockResolvedValue({
      type: "ignored",
      reden: "Alleen gepubliceerde artikelen worden geëmbed.",
    });
    const { payload } = maakFakePayload({
      articles: [{ id: 1, title: "Concept", articleStatus: "concept", embeddingStatus: "pending" }],
    });

    const samenvatting = await runKnowledgeEmbedding(payload, { collection: "articles", ids: [1] });

    expect(samenvatting.genegeerd).toBe(1);
    expect(samenvatting.mislukt).toBe(0);
  });

  it("vangt een onverwachte fout op zonder de ronde te stoppen", async () => {
    mockSource
      .mockRejectedValueOnce(new Error("onverwachte crash"))
      .mockResolvedValueOnce({ type: "embedded" });
    const { payload } = maakFakePayload({ "knowledge-sources": [maakBron(1), maakBron(2)] });

    const samenvatting = await runKnowledgeEmbedding(payload, {
      collection: "knowledge-sources",
      ids: [1, 2],
    });

    expect(samenvatting.mislukt).toBe(1);
    expect(samenvatting.geembed).toBe(1);
  });
});
