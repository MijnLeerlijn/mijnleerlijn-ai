import { describe, it, expect, vi, beforeEach } from "vitest";
import { TrainerKennisversies } from "./TrainerKennisversies";
import { embedInChunksIfChanged } from "@/lib/embeddings/chunked-embed";

// Productiecontrole (2026-08-23) — dekt de beforeChange-hook rechtstreeks:
// dit is de PUBLICEER-kant van de Kennis-Q&A-fix (root cause: een mislukte
// embedding liet een record permanent "gepubliceerd" zonder embedding
// achter, zie het opleverrapport). De backfill-kant staat apart getest in
// lib/trainers/kennis-reindex.test.ts. Roept de hook-functie rechtstreeks
// aan (Payload-hooks zijn kale async functies, geen echte Payload-instantie
// nodig) — embedInChunksIfChanged zelf is al apart getest (lib/embeddings/
// chunked-embed.test.ts), hier dus gemockt.
//
// Vervolgronde (2026-08-23) — embedInChunksIfChanged (niet meer het vlakke
// embedIfChanged) vervangt het rechtstreekse AI-aanroeppad: embedding wordt
// number[][] (fix voor de HTTP 400 bij te lange trainerkennis, zie
// lib/embeddings/chunked-embed.ts/chunk-text.ts).

vi.mock("@/lib/embeddings/chunked-embed", () => ({ embedInChunksIfChanged: vi.fn() }));
const mockEmbedInChunksIfChanged = vi.mocked(embedInChunksIfChanged);

const hook = TrainerKennisversies.hooks!.beforeChange![0]!;

function draaiHook(data: Record<string, unknown>, originalDoc?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return hook({ data, originalDoc } as never) as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  mockEmbedInChunksIfChanged.mockReset();
});

describe("TrainerKennisversies beforeChange-hook — embedding bij publiceren", () => {
  it("embedt een nieuwe versie die direct als 'gepubliceerd' wordt aangemaakt", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "embedded",
      embeddings: [[0.1, 0.2]],
      chunkMeta: [{ heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 }],
      model: "test-model",
      hash: "h1",
      aantalChunks: 1,
    });

    const resultaat = await draaiHook({ status: "gepubliceerd", titel: "Periodevoorbereiding", tekst: "Een periode duurt zes weken." });

    expect(resultaat.embedding).toEqual([[0.1, 0.2]]);
    expect(resultaat.embeddingChunks).toEqual([{ heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 }]);
    expect(resultaat.embeddingTextHash).toBe("h1");
    expect(resultaat.embeddingStatus).toBe("indexed");
    expect(typeof resultaat.publishedAt).toBe("string");
    expect(mockEmbedInChunksIfChanged).toHaveBeenCalledWith({
      text: "Periodevoorbereiding\n\nEen periode duurt zes weken.",
      storedHash: undefined,
      storedStatus: undefined,
    });
  });

  it("een concept wordt nooit geëmbed", async () => {
    await draaiHook({ status: "concept", titel: "T", tekst: "X" });
    expect(mockEmbedInChunksIfChanged).not.toHaveBeenCalled();
  });

  it("publishedAt wordt niet opnieuw gezet bij een latere bewerking van een al-gepubliceerde versie", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({ type: "skipped" });
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
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "failed",
      diagnose: { categorie: "openai_verzoek_ongeldig", stap: "aanroep", httpStatus: 400, model: "text-embedding-3-small", inputTekens: 6000, geschatTokens: 1500, chunkIndex: 2, totaalChunks: 5 },
    });
    const resultaat = await draaiHook({ status: "gepubliceerd", titel: "T", tekst: "X" });
    expect(resultaat.status).toBe("gepubliceerd");
    expect(resultaat.embeddingStatus).toBe("pending");
    expect(resultaat.embedding).toBeUndefined();
  });

  it("geeft de opgeslagen hash/status door aan embedInChunksIfChanged, zodat ongewijzigde tekst wordt overgeslagen", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({ type: "skipped" });
    await draaiHook(
      { status: "gepubliceerd", titel: "T" },
      { tekst: "Bestaande tekst", embeddingTextHash: "hash-al-actueel", embeddingStatus: "indexed", publishedAt: "2026-01-01T00:00:00.000Z" }
    );
    expect(mockEmbedInChunksIfChanged).toHaveBeenCalledWith({ text: "T\n\nBestaande tekst", storedHash: "hash-al-actueel", storedStatus: "indexed" });
  });

  it("bron articles versus knowledge-sources wordt identiek behandeld — de hook embedt uitsluitend titel+tekst, leest 'bron' nooit", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "embedded",
      embeddings: [[1]],
      chunkMeta: [{ heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 }],
      model: "test",
      hash: "h",
      aantalChunks: 1,
    });
    await draaiHook({ status: "gepubliceerd", titel: "T", tekst: "X", bron: { relationTo: "articles", value: 1 } });
    await draaiHook({ status: "gepubliceerd", titel: "T", tekst: "X", bron: { relationTo: "knowledge-sources", value: 2 } });
    expect(mockEmbedInChunksIfChanged).toHaveBeenNthCalledWith(1, { text: "T\n\nX", storedHash: undefined, storedStatus: undefined });
    expect(mockEmbedInChunksIfChanged).toHaveBeenNthCalledWith(2, { text: "T\n\nX", storedHash: undefined, storedStatus: undefined });
  });

  // Vervolgronde (2026-08-23), 2e diagnoseronde — bewijst de daadwerkelijke
  // fix op hook-niveau: een trainerkennistekst van vergelijkbare lengte als
  // de live Basiskennis (die eerder HTTP 400 gaf) publiceert nu met een
  // geslaagde, meerdelige embedding.
  it("een lange trainerkennistekst (vergelijkbaar met de live Basiskennis) wordt succesvol in meerdere chunks geëmbed", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "embedded",
      embeddings: [
        [0.1, 0.1],
        [0.2, 0.2],
        [0.3, 0.3],
      ],
      chunkMeta: [
        { heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 },
        { heading: null, headingSlug: null, headingLevel: null, chunkIndex: 1 },
        { heading: null, headingSlug: null, headingLevel: null, chunkIndex: 2 },
      ],
      model: "text-embedding-3-small",
      hash: "hash-lang",
      aantalChunks: 3,
    });
    const langeTekst = Array.from({ length: 60 }, (_, i) => `Onderwerp ${i}: ${"feitelijke informatie ".repeat(50).trim()}`).join("\n\n");

    const resultaat = await draaiHook({ status: "gepubliceerd", titel: "Basiskennis", tekst: langeTekst });

    expect(resultaat.embeddingStatus).toBe("indexed");
    expect(Array.isArray(resultaat.embedding)).toBe(true);
    expect((resultaat.embedding as unknown[]).length).toBe(3);
    expect((resultaat.embeddingChunks as unknown[]).length).toBe(3);
  });

  // Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing": bewijst
  // dat de hook de chunkMeta van embedInChunksIfChanged ONGEWIJZIGD doorgeeft
  // aan het nieuwe embeddingChunks-veld, index-uitgelijnd met embedding.
  it("schrijft de hoofdstuk-metadata (chunkMeta) weg naar het nieuwe veld embeddingChunks, index-uitgelijnd met embedding", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "embedded",
      embeddings: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
      chunkMeta: [
        { heading: "1. Eerste hoofdstuk", headingSlug: "1-eerste-hoofdstuk", headingLevel: 2, chunkIndex: 0 },
        { heading: "2. Tweede hoofdstuk", headingSlug: "2-tweede-hoofdstuk", headingLevel: 2, chunkIndex: 1 },
      ],
      model: "test-model",
      hash: "h-headings",
      aantalChunks: 2,
    });

    const resultaat = await draaiHook({ status: "gepubliceerd", titel: "Basiskennis", tekst: "## 1. Eerste hoofdstuk\nA.\n\n## 2. Tweede hoofdstuk\nB." });

    expect(resultaat.embeddingChunks).toEqual([
      { heading: "1. Eerste hoofdstuk", headingSlug: "1-eerste-hoofdstuk", headingLevel: 2, chunkIndex: 0 },
      { heading: "2. Tweede hoofdstuk", headingSlug: "2-tweede-hoofdstuk", headingLevel: 2, chunkIndex: 1 },
    ]);
  });
});
