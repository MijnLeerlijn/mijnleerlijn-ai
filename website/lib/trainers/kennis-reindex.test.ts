import { describe, it, expect, vi, beforeEach } from "vitest";
import { herindexeerTrainerKennisversies, haalKennisRetrievalDiagnose } from "./kennis-reindex";
import { embedIfChanged } from "@/lib/embeddings/embed-record";
import { maakFakePayload } from "@/lib/support/fake-payload";

// Productiecontrole (2026-08-23) — dekt de BACKFILL-kant van de Kennis-Q&A-
// fix: bestaande, al-gepubliceerde trainerversies die nooit (geldig) geëmbed
// werden, moeten zonder handmatig herpubliceren alsnog vindbaar worden. De
// PUBLICEER-kant (de hook zelf) staat apart getest in payload/collections/
// TrainerKennisversies.test.ts.

vi.mock("@/lib/embeddings/embed-record", () => ({ embedIfChanged: vi.fn() }));
const mockEmbedIfChanged = vi.mocked(embedIfChanged);

function versie(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    titel: "Periodevoorbereiding",
    tekst: "Een periode duurt zes weken.",
    status: "gepubliceerd",
    embeddingStatus: "indexed",
    embeddingTextHash: "hash-1",
    embedding: [1, 0],
    ...overrides,
  };
}

beforeEach(() => {
  mockEmbedIfChanged.mockReset();
});

describe("haalKennisRetrievalDiagnose — praktische diagnose, uitsluitend tellingen", () => {
  it("telt gepubliceerd/geïndexeerd/zonder-embedding correct, negeert concepten volledig", async () => {
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [
        versie({ id: 1, embeddingStatus: "indexed", embedding: [1, 0] }),
        versie({ id: 2, embeddingStatus: "pending", embedding: null }),
        versie({ id: 3, embeddingStatus: "pending", embedding: undefined }),
        versie({ id: 4, status: "concept", embeddingStatus: "pending", embedding: null }),
      ],
    });

    const diagnose = await haalKennisRetrievalDiagnose(payload);

    expect(diagnose).toEqual({ totaalGepubliceerd: 3, geindexeerd: 1, zonderEmbedding: 2 });
  });

  it("een leeg embedding-array telt ook als zonder embedding", async () => {
    const { payload } = maakFakePayload({ "trainer-kennisversies": [versie({ id: 1, embeddingStatus: "indexed", embedding: [] })] });
    const diagnose = await haalKennisRetrievalDiagnose(payload);
    expect(diagnose).toEqual({ totaalGepubliceerd: 1, geindexeerd: 0, zonderEmbedding: 1 });
  });
});

describe("herindexeerTrainerKennisversies — backfill voor bestaande gepubliceerde records zonder embedding", () => {
  it("laat een al-geldig-geïndexeerd record volledig met rust (geen embedIfChanged-aanroep, geen update)", async () => {
    const { payload, collection } = maakFakePayload({ "trainer-kennisversies": [versie({ id: 1 })] });
    const resultaat = await herindexeerTrainerKennisversies(payload);
    expect(resultaat).toEqual({ totaalGepubliceerd: 1, algGeindexeerd: 1, opnieuwGeindexeerd: 0, mislukt: 0 });
    expect(mockEmbedIfChanged).not.toHaveBeenCalled();
    expect(collection("trainer-kennisversies")[0]).toMatchObject({ embeddingTextHash: "hash-1" }); // ongewijzigd
  });

  it("herindexeert een gepubliceerd record zonder embedding, en schrijft het resultaat weg", async () => {
    mockEmbedIfChanged.mockResolvedValue({ type: "embedded", embedding: [0.3, 0.4], model: "test-model", hash: "nieuwe-hash" });
    const { payload, collection } = maakFakePayload({
      "trainer-kennisversies": [versie({ id: 1, embeddingStatus: "pending", embedding: null, embeddingTextHash: null })],
    });

    const resultaat = await herindexeerTrainerKennisversies(payload);

    expect(resultaat).toEqual({ totaalGepubliceerd: 1, algGeindexeerd: 0, opnieuwGeindexeerd: 1, mislukt: 0 });
    expect(collection("trainer-kennisversies")[0]).toMatchObject({ embedding: [0.3, 0.4], embeddingTextHash: "nieuwe-hash", embeddingStatus: "indexed" });
  });

  it("een record met embeddingStatus 'indexed' maar zonder daadwerkelijke embedding-array wordt ook herprobeerd (inconsistente staat)", async () => {
    mockEmbedIfChanged.mockResolvedValue({ type: "embedded", embedding: [1], model: "test", hash: "h" });
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [versie({ id: 1, embeddingStatus: "indexed", embedding: null })],
    });
    const resultaat = await herindexeerTrainerKennisversies(payload);
    expect(resultaat.opnieuwGeindexeerd).toBe(1);
  });

  it("een blijvend mislukkende embedding wordt geteld als 'mislukt', schrijft niets weg, blokkeert de rest niet", async () => {
    mockEmbedIfChanged.mockResolvedValue({ type: "failed", foutmelding: "AI-dienst tijdelijk niet bereikbaar" });
    const { payload, collection } = maakFakePayload({
      "trainer-kennisversies": [
        versie({ id: 1, embeddingStatus: "pending", embedding: null }),
        versie({ id: 2, embeddingStatus: "indexed", embedding: [1, 0] }),
      ],
    });

    const resultaat = await herindexeerTrainerKennisversies(payload);

    expect(resultaat).toEqual({ totaalGepubliceerd: 2, algGeindexeerd: 1, opnieuwGeindexeerd: 0, mislukt: 1 });
    expect(collection("trainer-kennisversies")[0]!.embeddingStatus).toBe("pending"); // ongewijzigd, geen halve schrijfactie
  });

  it("negeert concepten volledig — nooit embedIfChanged aangeroepen voor een niet-gepubliceerde versie", async () => {
    const { payload } = maakFakePayload({ "trainer-kennisversies": [versie({ id: 1, status: "concept", embeddingStatus: "pending", embedding: null })] });
    const resultaat = await herindexeerTrainerKennisversies(payload);
    expect(resultaat).toEqual({ totaalGepubliceerd: 0, algGeindexeerd: 0, opnieuwGeindexeerd: 0, mislukt: 0 });
    expect(mockEmbedIfChanged).not.toHaveBeenCalled();
  });

  it("geeft de bestaande hash/status door aan embedIfChanged (consistent met de publiceerhook)", async () => {
    mockEmbedIfChanged.mockResolvedValue({ type: "embedded", embedding: [1], model: "test", hash: "h" });
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [versie({ id: 1, embeddingStatus: "pending", embedding: null, embeddingTextHash: "oude-hash" })],
    });
    await herindexeerTrainerKennisversies(payload);
    expect(mockEmbedIfChanged).toHaveBeenCalledWith({
      text: "Periodevoorbereiding\n\nEen periode duurt zes weken.",
      storedHash: "oude-hash",
      storedStatus: "pending",
    });
  });
});
