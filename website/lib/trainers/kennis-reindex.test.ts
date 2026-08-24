import { describe, it, expect, vi, beforeEach } from "vitest";
import { herindexeerTrainerKennisversies, haalKennisRetrievalDiagnose } from "./kennis-reindex";
import { embedInChunksIfChanged } from "@/lib/embeddings/chunked-embed";
import { maakFakePayload } from "@/lib/support/fake-payload";

// Productiecontrole (2026-08-23) — dekt de BACKFILL-kant van de Kennis-Q&A-
// fix: bestaande, al-gepubliceerde trainerversies die nooit (geldig) geëmbed
// werden, moeten zonder handmatig herpubliceren alsnog vindbaar worden. De
// PUBLICEER-kant (de hook zelf) staat apart getest in payload/collections/
// TrainerKennisversies.test.ts.
//
// Vervolgronde (2026-08-23) — embedding is sindsdien number[][] (één vector
// per chunk, zie lib/embeddings/chunked-embed.ts — fix voor de HTTP 400 bij
// te lange trainerkennis), en herindexeerTrainerKennisversies roept
// embedInChunksIfChanged aan (niet meer het vlakke embedIfChanged).

vi.mock("@/lib/embeddings/chunked-embed", () => ({ embedInChunksIfChanged: vi.fn() }));
const mockEmbedInChunksIfChanged = vi.mocked(embedInChunksIfChanged);

function versie(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    titel: "Periodevoorbereiding",
    tekst: "Een periode duurt zes weken.",
    status: "gepubliceerd",
    embeddingStatus: "indexed",
    embeddingTextHash: "hash-1",
    embedding: [[1, 0]],
    // Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing":
    // een default-versie() is nu pas ECHT "al volledig geïndexeerd" mét
    // bijpassende (lege) hoofdstuk-metadata, index-uitgelijnd met de
    // default embedding hierboven. Een test die specifiek het OUDE-vorm-
    // scenario (embedding zonder embeddingChunks) wil nabootsen, geeft
    // expliciet `embeddingChunks: undefined` mee.
    embeddingChunks: [{ heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 }],
    ...overrides,
  };
}

beforeEach(() => {
  mockEmbedInChunksIfChanged.mockReset();
});

describe("haalKennisRetrievalDiagnose — praktische diagnose, uitsluitend tellingen", () => {
  it("telt gepubliceerd/geïndexeerd/zonder-embedding correct, negeert concepten volledig", async () => {
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [
        versie({ id: 1, embeddingStatus: "indexed", embedding: [[1, 0]] }),
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

  it("een chunk-array met een lege chunk erin telt ook als zonder embedding (inconsistente staat)", async () => {
    const { payload } = maakFakePayload({ "trainer-kennisversies": [versie({ id: 1, embeddingStatus: "indexed", embedding: [[1, 0], []] })] });
    const diagnose = await haalKennisRetrievalDiagnose(payload);
    expect(diagnose).toEqual({ totaalGepubliceerd: 1, geindexeerd: 0, zonderEmbedding: 1 });
  });
});

describe("herindexeerTrainerKennisversies — backfill voor bestaande gepubliceerde records zonder embedding", () => {
  it("laat een al-geldig-geïndexeerd record volledig met rust (geen embedInChunksIfChanged-aanroep, geen update)", async () => {
    const { payload, collection } = maakFakePayload({ "trainer-kennisversies": [versie({ id: 1 })] });
    const resultaat = await herindexeerTrainerKennisversies(payload);
    expect(resultaat).toEqual({ totaalGepubliceerd: 1, algGeindexeerd: 1, opnieuwGeindexeerd: 0, mislukt: 0, mislukteDetails: [] });
    expect(mockEmbedInChunksIfChanged).not.toHaveBeenCalled();
    expect(collection("trainer-kennisversies")[0]).toMatchObject({ embeddingTextHash: "hash-1" }); // ongewijzigd
  });

  it("herindexeert een gepubliceerd record zonder embedding, en schrijft het resultaat (number[][]) weg", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "embedded",
      embeddings: [
        [0.3, 0.4],
        [0.5, 0.6],
      ],
      chunkMeta: [
        { heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 },
        { heading: null, headingSlug: null, headingLevel: null, chunkIndex: 1 },
      ],
      model: "test-model",
      hash: "nieuwe-hash",
      aantalChunks: 2,
    });
    const { payload, collection } = maakFakePayload({
      "trainer-kennisversies": [versie({ id: 1, embeddingStatus: "pending", embedding: null, embeddingTextHash: null })],
    });

    const resultaat = await herindexeerTrainerKennisversies(payload);

    expect(resultaat).toEqual({ totaalGepubliceerd: 1, algGeindexeerd: 0, opnieuwGeindexeerd: 1, mislukt: 0, mislukteDetails: [] });
    expect(collection("trainer-kennisversies")[0]).toMatchObject({
      embedding: [
        [0.3, 0.4],
        [0.5, 0.6],
      ],
      embeddingChunks: [
        { heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 },
        { heading: null, headingSlug: null, headingLevel: null, chunkIndex: 1 },
      ],
      embeddingTextHash: "nieuwe-hash",
      embeddingStatus: "indexed",
    });
  });

  // Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing"
  // (opdrachtseis §8): de kern van de backfill voor bestaande content — de
  // live Basiskennis had al een geldige embedding van vóór deze
  // functionaliteit, maar nog geen embeddingChunks. Zonder speciale
  // behandeling zou de (ongewijzigde) tekst-hash nog matchen en
  // embedInChunksIfChanged dus stil overslaan, en zou dit record voor altijd
  // zonder hoofdstuk-metadata blijven — deze test bewijst dat dat niet
  // gebeurt: een volledige herberekening wordt geforceerd.
  it("een record met een AL geldige embedding maar zonder embeddingChunks wordt herindexeerd (bestaande Basiskennis krijgt alsnog hoofdstuk-metadata)", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "embedded",
      embeddings: [[0.1, 0.2]],
      chunkMeta: [{ heading: "1. Wat is MijnLeerlijn?", headingSlug: "1-wat-is-mijnleerlijn", headingLevel: 2, chunkIndex: 0 }],
      model: "test-model",
      hash: "hash-1", // zelfde hash als al opgeslagen — de tekst is NIET gewijzigd
      aantalChunks: 1,
    });
    const { payload, collection } = maakFakePayload({
      "trainer-kennisversies": [
        versie({ id: 1, embeddingStatus: "indexed", embedding: [[1, 0]], embeddingTextHash: "hash-1", embeddingChunks: undefined }), // simuleert een record van vóór deze functionaliteit
      ],
    });

    const resultaat = await herindexeerTrainerKennisversies(payload);

    expect(resultaat).toEqual({ totaalGepubliceerd: 1, algGeindexeerd: 0, opnieuwGeindexeerd: 1, mislukt: 0, mislukteDetails: [] });
    // De skip-logica werd bewust GEEN kans gegeven (storedHash niet doorgegeven) — anders was dit "algGeindexeerd" gebleven, zonder embeddingChunks.
    expect(mockEmbedInChunksIfChanged).toHaveBeenCalledWith({ text: "Periodevoorbereiding\n\nEen periode duurt zes weken.", storedHash: null, storedStatus: null });
    expect(collection("trainer-kennisversies")[0]).toMatchObject({
      embeddingChunks: [{ heading: "1. Wat is MijnLeerlijn?", headingSlug: "1-wat-is-mijnleerlijn", headingLevel: 2, chunkIndex: 0 }],
    });
  });

  it("een record met zowel geldige embedding als geldige embeddingChunks wordt met rust gelaten (geen onnodige AI-aanroep)", async () => {
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [
        versie({ id: 1, embedding: [[1, 0]], embeddingChunks: [{ heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 }] }),
      ],
    });
    const resultaat = await herindexeerTrainerKennisversies(payload);
    expect(resultaat).toEqual({ totaalGepubliceerd: 1, algGeindexeerd: 1, opnieuwGeindexeerd: 0, mislukt: 0, mislukteDetails: [] });
    expect(mockEmbedInChunksIfChanged).not.toHaveBeenCalled();
  });

  it("embeddingChunks met een ander aantal items dan embedding (inconsistente staat) telt ook als 'moet herindexeren'", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "embedded",
      embeddings: [[0.1, 0.2]],
      chunkMeta: [{ heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 }],
      model: "test-model",
      hash: "hash-1",
      aantalChunks: 1,
    });
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [
        versie({
          id: 1,
          embedding: [
            [1, 0],
            [0, 1],
          ],
          embeddingChunks: [{ heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 }], // 1 item, embedding heeft er 2
        }),
      ],
    });
    const resultaat = await herindexeerTrainerKennisversies(payload);
    expect(resultaat.opnieuwGeindexeerd).toBe(1);
  });

  it("een record met embeddingStatus 'indexed' maar zonder daadwerkelijke embedding-array wordt ook herprobeerd (inconsistente staat)", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "embedded",
      embeddings: [[1]],
      chunkMeta: [{ heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 }],
      model: "test",
      hash: "h",
      aantalChunks: 1,
    });
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [versie({ id: 1, embeddingStatus: "indexed", embedding: null })],
    });
    const resultaat = await herindexeerTrainerKennisversies(payload);
    expect(resultaat.opnieuwGeindexeerd).toBe(1);
  });

  // Vervolgronde (2026-08-23), 1e diagnoseronde — de live herindexering liet
  // 1 mislukking zien zonder verder detail; herindexeerTrainerKennisversies
  // geeft dit nu terug via mislukteDetails, veilig genoeg om rechtstreeks
  // aan een beheerder te tonen.
  it("een blijvend mislukkende embedding wordt geteld als 'mislukt', geeft een veilige diagnose terug, schrijft niets weg", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "failed",
      diagnose: { categorie: "openai_rate_limited", stap: "aanroep", httpStatus: 429, model: "text-embedding-3-small", inputTekens: 40, geschatTokens: 10, chunkIndex: 0, totaalChunks: 1 },
    });
    const { payload, collection } = maakFakePayload({
      "trainer-kennisversies": [
        versie({ id: 1, embeddingStatus: "pending", embedding: null }),
        versie({ id: 2, embeddingStatus: "indexed", embedding: [[1, 0]] }),
      ],
    });

    const resultaat = await herindexeerTrainerKennisversies(payload);

    expect(resultaat).toEqual({
      totaalGepubliceerd: 2,
      algGeindexeerd: 1,
      opnieuwGeindexeerd: 0,
      mislukt: 1,
      mislukteDetails: [
        { id: 1, categorie: "openai_rate_limited", stap: "aanroep", httpStatus: 429, model: "text-embedding-3-small", inputTekens: 40, geschatTokens: 10, chunkIndex: 0, totaalChunks: 1 },
      ],
    });
    expect(collection("trainer-kennisversies")[0]!.embeddingStatus).toBe("pending"); // ongewijzigd, geen halve schrijfactie
  });

  // Vervolgronde (2026-08-23), 2e diagnoseronde — de root cause van de
  // mislukking bleek HTTP 400 (te lange brontekst voor één embed()-aanroep,
  // zie lib/embeddings/chunked-embed.ts/chunk-text.ts). Deze test bewijst
  // dat de fix het bestaande record daadwerkelijk succesvol herindexeert.
  it("een lang trainerkennisdocument (vergelijkbaar met de live Basiskennis) wordt na de chunking-fix succesvol herindexeerd: opnieuwGeindexeerd 1, mislukt 0", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "embedded",
      embeddings: [
        [0.1, 0.1],
        [0.2, 0.2],
        [0.3, 0.3],
        [0.4, 0.4],
      ],
      chunkMeta: [
        { heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 },
        { heading: null, headingSlug: null, headingLevel: null, chunkIndex: 1 },
        { heading: null, headingSlug: null, headingLevel: null, chunkIndex: 2 },
        { heading: null, headingSlug: null, headingLevel: null, chunkIndex: 3 },
      ],
      model: "text-embedding-3-small",
      hash: "hash-lange-basiskennis",
      aantalChunks: 4,
    });
    const langeTekst = Array.from({ length: 60 }, (_, i) => `Onderwerp ${i}: ${"feitelijke informatie ".repeat(50).trim()}`).join("\n\n");
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [versie({ id: 1, titel: "Basiskennis", tekst: langeTekst, embeddingStatus: "pending", embedding: null, embeddingTextHash: null })],
    });

    const resultaat = await herindexeerTrainerKennisversies(payload);

    expect(resultaat.opnieuwGeindexeerd).toBe(1);
    expect(resultaat.mislukt).toBe(0);
    expect(resultaat.mislukteDetails).toEqual([]);
  });

  it("de mislukteDetails bevatten nooit vraag-/antwoordinhoud of de titel/tekst van het record", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "failed",
      diagnose: { categorie: "openai_server_fout", stap: "aanroep", httpStatus: 500, model: "text-embedding-3-small", inputTekens: 5000, geschatTokens: 1250, chunkIndex: 3, totaalChunks: 6 },
    });
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [versie({ id: 1, titel: "Zeer geheime titel", tekst: "Zeer geheime tekst", embeddingStatus: "pending", embedding: null })],
    });

    const resultaat = await herindexeerTrainerKennisversies(payload);

    const gezien = JSON.stringify(resultaat.mislukteDetails);
    expect(gezien).not.toContain("Zeer geheime");
  });

  it("negeert concepten volledig — nooit embedInChunksIfChanged aangeroepen voor een niet-gepubliceerde versie", async () => {
    const { payload } = maakFakePayload({ "trainer-kennisversies": [versie({ id: 1, status: "concept", embeddingStatus: "pending", embedding: null })] });
    const resultaat = await herindexeerTrainerKennisversies(payload);
    expect(resultaat).toEqual({ totaalGepubliceerd: 0, algGeindexeerd: 0, opnieuwGeindexeerd: 0, mislukt: 0, mislukteDetails: [] });
    expect(mockEmbedInChunksIfChanged).not.toHaveBeenCalled();
  });

  it("geeft de bestaande hash/status door aan embedInChunksIfChanged (consistent met de publiceerhook)", async () => {
    mockEmbedInChunksIfChanged.mockResolvedValue({
      type: "embedded",
      embeddings: [[1]],
      chunkMeta: [{ heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 }],
      model: "test",
      hash: "h",
      aantalChunks: 1,
    });
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [versie({ id: 1, embeddingStatus: "pending", embedding: null, embeddingTextHash: "oude-hash" })],
    });
    await herindexeerTrainerKennisversies(payload);
    expect(mockEmbedInChunksIfChanged).toHaveBeenCalledWith({
      text: "Periodevoorbereiding\n\nEen periode duurt zes weken.",
      storedHash: "oude-hash",
      storedStatus: "pending",
    });
  });
});
