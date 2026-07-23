import { describe, it, expect, vi, beforeEach } from "vitest";
import { embedIfChanged } from "./embed-record";
import { generateEmbedding } from "@/services/ai-client";
import { hashText } from "./text-hash";

vi.mock("@/services/ai-client", () => ({
  generateEmbedding: vi.fn(),
  getEmbeddingModelId: () => "text-embedding-3-small-test",
}));

const mockGenerateEmbedding = vi.mocked(generateEmbedding);

beforeEach(() => {
  mockGenerateEmbedding.mockReset();
  mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
});

describe("embedIfChanged", () => {
  it("slaat een onveranderde, al geïndexeerde tekst over ('opnieuw embedden')", async () => {
    const tekst = "Hoofdprofiel aanmaken lukt niet.";
    const uitkomst = await embedIfChanged({
      text: tekst,
      storedHash: hashText(tekst),
      storedStatus: "indexed",
    });

    expect(uitkomst).toEqual({ type: "skipped" });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("embedt opnieuw wanneer de tekst is gewijzigd, ook al was de status 'indexed' ('gewijzigde PDF')", async () => {
    const uitkomst = await embedIfChanged({
      text: "Gewijzigde inhoud na een nieuwe PDF-upload.",
      storedHash: hashText("Oude inhoud."),
      storedStatus: "indexed",
    });

    expect(uitkomst.type).toBe("embedded");
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
  });

  it("embedt een document dat nog nooit geëmbed is (status 'pending')", async () => {
    const uitkomst = await embedIfChanged({
      text: "Nieuwe bron.",
      storedHash: null,
      storedStatus: "pending",
    });

    expect(uitkomst.type).toBe("embedded");
    if (uitkomst.type === "embedded") {
      expect(uitkomst.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(uitkomst.model).toBe("text-embedding-3-small-test");
      expect(uitkomst.hash).toBe(hashText("Nieuwe bron."));
    }
  });

  it("faalt netjes zonder tekst, zonder de AI aan te roepen", async () => {
    const uitkomst = await embedIfChanged({ text: "   ", storedHash: null, storedStatus: null });

    expect(uitkomst).toMatchObject({ type: "failed" });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("geeft een failed-uitkomst terug wanneer de embeddings-API zelf mislukt", async () => {
    mockGenerateEmbedding.mockRejectedValue(new Error("OpenAI: rate limit exceeded"));

    const uitkomst = await embedIfChanged({ text: "Tekst.", storedHash: null, storedStatus: "pending" });

    expect(uitkomst).toMatchObject({ type: "failed", foutmelding: "OpenAI: rate limit exceeded" });
  });
});
