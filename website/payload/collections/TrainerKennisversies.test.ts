import { describe, it, expect, vi, beforeEach } from "vitest";
import { TrainerKennisversies } from "./TrainerKennisversies";
import { embedIfChanged } from "@/lib/embeddings/embed-record";

// Productiecontrole (2026-08-23) — dekt de beforeChange-hook rechtstreeks:
// dit is de PUBLICEER-kant van de Kennis-Q&A-fix (root cause: een mislukte
// embedding liet een record permanent "gepubliceerd" zonder embedding
// achter, zie het opleverrapport). De backfill-kant staat apart getest in
// lib/trainers/kennis-reindex.test.ts. Roept de hook-functie rechtstreeks
// aan (Payload-hooks zijn kale async functies, geen echte Payload-instantie
// nodig) — embedIfChanged zelf is al apart getest (lib/embeddings/
// embed-record.test.ts), hier dus gemockt.

vi.mock("@/lib/embeddings/embed-record", () => ({ embedIfChanged: vi.fn() }));
const mockEmbedIfChanged = vi.mocked(embedIfChanged);

const hook = TrainerKennisversies.hooks!.beforeChange![0]!;

function draaiHook(data: Record<string, unknown>, originalDoc?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return hook({ data, originalDoc } as never) as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  mockEmbedIfChanged.mockReset();
});

describe("TrainerKennisversies beforeChange-hook — embedding bij publiceren", () => {
  it("embedt een nieuwe versie die direct als 'gepubliceerd' wordt aangemaakt", async () => {
    mockEmbedIfChanged.mockResolvedValue({ type: "embedded", embedding: [0.1, 0.2], model: "test-model", hash: "h1" });

    const resultaat = await draaiHook({ status: "gepubliceerd", titel: "Periodevoorbereiding", tekst: "Een periode duurt zes weken." });

    expect(resultaat.embedding).toEqual([0.1, 0.2]);
    expect(resultaat.embeddingTextHash).toBe("h1");
    expect(resultaat.embeddingStatus).toBe("indexed");
    expect(typeof resultaat.publishedAt).toBe("string");
    expect(mockEmbedIfChanged).toHaveBeenCalledWith({
      text: "Periodevoorbereiding\n\nEen periode duurt zes weken.",
      storedHash: undefined,
      storedStatus: undefined,
    });
  });

  it("een concept wordt nooit geëmbed", async () => {
    await draaiHook({ status: "concept", titel: "T", tekst: "X" });
    expect(mockEmbedIfChanged).not.toHaveBeenCalled();
  });

  it("publishedAt wordt niet opnieuw gezet bij een latere bewerking van een al-gepubliceerde versie", async () => {
    mockEmbedIfChanged.mockResolvedValue({ type: "skipped" });
    const resultaat = await draaiHook(
      { status: "gepubliceerd", titel: "T", tekst: "X" },
      { publishedAt: "2026-01-01T00:00:00.000Z", embeddingTextHash: "al-actueel", embeddingStatus: "indexed" }
    );
    expect(resultaat.publishedAt).toBeUndefined(); // hook zet 'm niet opnieuw — de bestaande waarde op originalDoc blijft ongemoeid
  });

  // Root cause Kennis-Q&A: dit pad liet voorheen embeddingStatus op "pending"
  // staan zonder dat er ooit iets naar keek — de trainerversie zelf bleef wél
  // "gepubliceerd" (opslaan mag nooit blokkeren op een AI-storing).
  it("bij een mislukte embedding blijft publiceren gewoon doorgaan, met embeddingStatus 'pending' en geen embedding", async () => {
    mockEmbedIfChanged.mockResolvedValue({ type: "failed", foutmelding: "AI-dienst tijdelijk niet bereikbaar" });
    const resultaat = await draaiHook({ status: "gepubliceerd", titel: "T", tekst: "X" });
    expect(resultaat.status).toBe("gepubliceerd");
    expect(resultaat.embeddingStatus).toBe("pending");
    expect(resultaat.embedding).toBeUndefined();
  });

  it("geeft de opgeslagen hash/status door aan embedIfChanged, zodat ongewijzigde tekst wordt overgeslagen", async () => {
    mockEmbedIfChanged.mockResolvedValue({ type: "skipped" });
    await draaiHook(
      { status: "gepubliceerd", titel: "T" },
      { tekst: "Bestaande tekst", embeddingTextHash: "hash-al-actueel", embeddingStatus: "indexed", publishedAt: "2026-01-01T00:00:00.000Z" }
    );
    expect(mockEmbedIfChanged).toHaveBeenCalledWith({ text: "T\n\nBestaande tekst", storedHash: "hash-al-actueel", storedStatus: "indexed" });
  });

  it("bron articles versus knowledge-sources wordt identiek behandeld — de hook embedt uitsluitend titel+tekst, leest 'bron' nooit", async () => {
    mockEmbedIfChanged.mockResolvedValue({ type: "embedded", embedding: [1], model: "test", hash: "h" });
    await draaiHook({ status: "gepubliceerd", titel: "T", tekst: "X", bron: { relationTo: "articles", value: 1 } });
    await draaiHook({ status: "gepubliceerd", titel: "T", tekst: "X", bron: { relationTo: "knowledge-sources", value: 2 } });
    expect(mockEmbedIfChanged).toHaveBeenNthCalledWith(1, { text: "T\n\nX", storedHash: undefined, storedStatus: undefined });
    expect(mockEmbedIfChanged).toHaveBeenNthCalledWith(2, { text: "T\n\nX", storedHash: undefined, storedStatus: undefined });
  });
});
