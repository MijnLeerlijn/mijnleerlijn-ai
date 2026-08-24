import { describe, it, expect, vi, beforeEach } from "vitest";
import { haalGepubliceerdeKennisversies, haalGepubliceerdeKennisversie, beantwoordTrainerKennisVraag } from "./kennis";
import { genereerTrainerKennisAntwoord } from "./kennis-antwoord";
import { generateEmbedding } from "@/services/ai-client";
import { maakFakePayload } from "@/lib/support/fake-payload";

// Vervolgronde (2026-08-22) — dekt lib/trainers/kennis.ts: uitsluitend de
// leeslaag (welke kennisversies zichtbaar zijn, hoe de zoekscore wordt
// opgebouwd), niet de antwoordlogica zelf (die staat los getest in
// kennis-antwoord.test.ts). cosineSimilarity zelf (uit de "ai"-package)
// draait hier ECHT, niet gemockt — het is een pure rekenfunctie zonder
// externe aanroep, dus een mock zou hier alleen ruis toevoegen.
//
// Vervolgronde (2026-08-23) — embedding is sindsdien number[][] (één vector
// per chunk, zie lib/embeddings/chunked-embed.ts — fix voor de HTTP 400 bij
// te lange trainerkennis): de fixtures hieronder gebruiken dus geneste
// vectoren (bv. [[1, 0]]), nooit meer een vlakke [1, 0]. generateEmbedding()
// zelf blijft één vlakke vector per aanroep teruggeven — dat is de
// QUERY-embedding, niet de documentopslag, dus die vorm verandert hier niet.
vi.mock("@/services/ai-client", () => ({ generateEmbedding: vi.fn() }));
vi.mock("./kennis-antwoord", () => ({ genereerTrainerKennisAntwoord: vi.fn() }));

const mockGenerateEmbedding = vi.mocked(generateEmbedding);
const mockGenereerAntwoord = vi.mocked(genereerTrainerKennisAntwoord);

function kennisversie(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    bron: { relationTo: "articles", value: 10 },
    titel: "Periodevoorbereiding",
    tekst: "Een periode duurt zes weken en start met een inleidend gesprek met de school.",
    status: "gepubliceerd",
    generatedByAi: true,
    embeddingStatus: "indexed",
    embedding: [[1, 0]],
    updatedAt: "2026-08-20T09:00:00.000Z",
    createdAt: "2026-08-20T09:00:00.000Z",
    ...overrides,
  };
}

const TRAINER_ID = 42;

beforeEach(() => {
  mockGenerateEmbedding.mockReset();
  mockGenereerAntwoord.mockReset();
});

describe("haalGepubliceerdeKennisversies — alleen gepubliceerde trainerversies zichtbaar", () => {
  it("toont een gepubliceerde kennisversie", async () => {
    const { payload } = maakFakePayload({ "trainer-kennisversies": [kennisversie()] });
    const lijst = await haalGepubliceerdeKennisversies(payload);
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatchObject({ id: 1, titel: "Periodevoorbereiding" });
  });

  it("een concept (nog niet gepubliceerd) verschijnt niet in de lijst", async () => {
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [kennisversie({ id: 1, status: "concept" }), kennisversie({ id: 2, status: "gepubliceerd" })],
    });
    const lijst = await haalGepubliceerdeKennisversies(payload);
    expect(lijst.map((k) => k.id)).toEqual([2]);
  });

  it("de samenvatting is begrensd (voor de zoekbare lijst) en nooit de volledige tekst als die lang is", async () => {
    const langeTekst = "a".repeat(300);
    const { payload } = maakFakePayload({ "trainer-kennisversies": [kennisversie({ tekst: langeTekst })] });
    const lijst = await haalGepubliceerdeKennisversies(payload);
    expect(lijst[0]!.samenvatting.length).toBeLessThan(langeTekst.length);
  });
});

describe("haalGepubliceerdeKennisversie — detail, concept niet zichtbaar", () => {
  it("geeft de volledige tekst terug voor een gepubliceerde versie", async () => {
    const { payload } = maakFakePayload({ "trainer-kennisversies": [kennisversie()] });
    const detail = await haalGepubliceerdeKennisversie(payload, 1);
    expect(detail).toMatchObject({ id: 1, titel: "Periodevoorbereiding" });
  });

  it("geeft null terug voor een concept — nooit de tekst van een niet-gepubliceerde versie lekken", async () => {
    const { payload } = maakFakePayload({ "trainer-kennisversies": [kennisversie({ status: "concept" })] });
    const detail = await haalGepubliceerdeKennisversie(payload, 1);
    expect(detail).toBeNull();
  });

  it("geeft null terug voor een niet-bestaand ID — geen fout", async () => {
    const { payload } = maakFakePayload({ "trainer-kennisversies": [] });
    const detail = await haalGepubliceerdeKennisversie(payload, 999);
    expect(detail).toBeNull();
  });
});

describe("beantwoordTrainerKennisVraag — retrieve't alleen gepubliceerde trainerkennis", () => {
  it("neemt uitsluitend gepubliceerde, geëmbedde versies mee in de zoekscore — concepten en niet-geëmbedde versies nooit", async () => {
    mockGenerateEmbedding.mockResolvedValue([1, 0]);
    mockGenereerAntwoord.mockImplementation(async (_vraag, bronnen) => ({
      type: "answered",
      answer: "Antwoord",
      reasoning: "Reden",
      confidence: 100,
      model: "test",
      bronnen,
    }));
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [
        kennisversie({ id: 1, titel: "Gepubliceerd + geëmbed", status: "gepubliceerd", embedding: [[1, 0]] }),
        kennisversie({ id: 2, titel: "Concept", status: "concept", embedding: [[1, 0]] }),
        kennisversie({ id: 3, titel: "Gepubliceerd zonder embedding", status: "gepubliceerd", embedding: null }),
      ],
    });

    const uitkomst = await beantwoordTrainerKennisVraag(payload, TRAINER_ID, "Een vraag");

    expect(uitkomst.type).toBe("answered");
    if (uitkomst.type === "answered") {
      expect(uitkomst.bronnen.map((b) => b.id)).toEqual([1]);
    }
  });

  it("rangschikt bronnen op cosine similarity, hoogste eerst", async () => {
    mockGenerateEmbedding.mockResolvedValue([1, 0]); // query-embedding
    mockGenereerAntwoord.mockImplementation(async (_vraag, bronnen) => ({
      type: "answered",
      answer: "Antwoord",
      reasoning: "Reden",
      confidence: 100,
      model: "test",
      bronnen,
    }));
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [
        kennisversie({ id: 1, titel: "Loodrecht (orthogonaal)", embedding: [[0, 1]] }), // similarity 0
        kennisversie({ id: 2, titel: "Identiek", embedding: [[1, 0]] }), // similarity 1
      ],
    });

    const uitkomst = await beantwoordTrainerKennisVraag(payload, TRAINER_ID, "Vraag");

    expect(uitkomst.type).toBe("answered");
    if (uitkomst.type === "answered") {
      expect(uitkomst.bronnen.map((b) => b.id)).toEqual([2, 1]);
      expect(uitkomst.bronnen[0]!.similarity).toBeCloseTo(1);
      expect(uitkomst.bronnen[1]!.similarity).toBeCloseTo(0);
    }
  });

  // Vervolgronde (2026-08-23) — de kern van de chunking-fix aan de
  // retrieval-kant: een document met meerdere chunks (embedding: number[][])
  // scoort op zijn BESTE chunk, niet op de eerste/gemiddelde. De volledige,
  // ongewijzigde tekst blijft de bron/LLM-context, ongeacht welke chunk won.
  it("een document met meerdere chunk-embeddings scoort op de best passende chunk", async () => {
    mockGenerateEmbedding.mockResolvedValue([1, 0]); // query-embedding
    mockGenereerAntwoord.mockImplementation(async (_vraag, bronnen) => ({
      type: "answered",
      answer: "Antwoord",
      reasoning: "Reden",
      confidence: 100,
      model: "test",
      bronnen,
    }));
    const { payload } = maakFakePayload({
      "trainer-kennisversies": [
        // Eerste chunk loodrecht (similarity 0), tweede chunk identiek (similarity 1) — de BESTE chunk moet winnen.
        kennisversie({
          id: 1,
          titel: "Basiskennis (meerdere chunks)",
          tekst: "De volledige, ongewijzigde tekst blijft de LLM-context.",
          embedding: [
            [0, 1],
            [1, 0],
          ],
        }),
      ],
    });

    const uitkomst = await beantwoordTrainerKennisVraag(payload, TRAINER_ID, "Vraag");

    expect(uitkomst.type).toBe("answered");
    if (uitkomst.type === "answered") {
      expect(uitkomst.bronnen[0]!.similarity).toBeCloseTo(1);
      expect(uitkomst.bronnen[0]!.tekst).toBe("De volledige, ongewijzigde tekst blijft de LLM-context.");
    }
  });

  // Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing"
  // (opdrachtseis §4/§5/§10): retrieval moet niet alleen document-ID/titel/
  // score teruggeven, maar ook het hoofdstuk (heading/headingSlug) van de
  // best passende chunk — en dat per (document, hoofdstuk) maar één keer.
  describe("hoofdstuk-citaties (embeddingChunks)", () => {
    it("geeft de heading + headingSlug van de best passende chunk terug", async () => {
      mockGenerateEmbedding.mockResolvedValue([1, 0]); // query-embedding
      mockGenereerAntwoord.mockImplementation(async (_vraag, bronnen) => ({
        type: "answered",
        answer: "Antwoord",
        reasoning: "Reden",
        confidence: 100,
        model: "test",
        bronnen,
      }));
      const { payload } = maakFakePayload({
        "trainer-kennisversies": [
          kennisversie({
            id: 1,
            embedding: [
              [0, 1],
              [1, 0],
            ],
            embeddingChunks: [
              { heading: "1. Loodrecht hoofdstuk", headingSlug: "1-loodrecht-hoofdstuk", headingLevel: 2, chunkIndex: 0 },
              { heading: "2. Identiek hoofdstuk", headingSlug: "2-identiek-hoofdstuk", headingLevel: 2, chunkIndex: 1 },
            ],
          }),
        ],
      });

      const uitkomst = await beantwoordTrainerKennisVraag(payload, TRAINER_ID, "Vraag");

      expect(uitkomst.type).toBe("answered");
      if (uitkomst.type === "answered") {
        expect(uitkomst.bronnen[0]).toMatchObject({ heading: "2. Identiek hoofdstuk", headingSlug: "2-identiek-hoofdstuk" });
        expect(uitkomst.bronnen[0]!.similarity).toBeCloseTo(1);
      }
    });

    it("meerdere chunks uit HETZELFDE hoofdstuk leveren maar één citatie op (de best scorende)", async () => {
      mockGenerateEmbedding.mockResolvedValue([1, 0]);
      mockGenereerAntwoord.mockImplementation(async (_vraag, bronnen) => ({ type: "answered", answer: "A", reasoning: "R", confidence: 100, model: "test", bronnen }));
      const { payload } = maakFakePayload({
        "trainer-kennisversies": [
          kennisversie({
            id: 1,
            embedding: [
              [0.9, 0.1],
              [1, 0],
            ],
            embeddingChunks: [
              { heading: "1. Eén hoofdstuk", headingSlug: "1-een-hoofdstuk", headingLevel: 2, chunkIndex: 0 },
              { heading: "1. Eén hoofdstuk", headingSlug: "1-een-hoofdstuk", headingLevel: 2, chunkIndex: 1 }, // zelfde hoofdstuk, 2e chunk (lang hoofdstuk over meerdere chunks verdeeld)
            ],
          }),
        ],
      });

      const uitkomst = await beantwoordTrainerKennisVraag(payload, TRAINER_ID, "Vraag");

      expect(uitkomst.type).toBe("answered");
      if (uitkomst.type === "answered") {
        expect(uitkomst.bronnen).toHaveLength(1);
        expect(uitkomst.bronnen[0]!.similarity).toBeCloseTo(1); // de beste van de 2 chunks
      }
    });

    it("meerdere ECHT verschillende hoofdstukken (ook binnen hetzelfde document) leveren allebei een aparte citatie op", async () => {
      mockGenerateEmbedding.mockResolvedValue([1, 0]);
      mockGenereerAntwoord.mockImplementation(async (_vraag, bronnen) => ({ type: "answered", answer: "A", reasoning: "R", confidence: 100, model: "test", bronnen }));
      const { payload } = maakFakePayload({
        "trainer-kennisversies": [
          kennisversie({
            id: 1,
            embedding: [
              [1, 0],
              [0.95, 0.05],
            ],
            embeddingChunks: [
              { heading: "1. Hoofdstuk A", headingSlug: "1-hoofdstuk-a", headingLevel: 2, chunkIndex: 0 },
              { heading: "2. Hoofdstuk B", headingSlug: "2-hoofdstuk-b", headingLevel: 2, chunkIndex: 1 },
            ],
          }),
        ],
      });

      const uitkomst = await beantwoordTrainerKennisVraag(payload, TRAINER_ID, "Vraag");

      expect(uitkomst.type).toBe("answered");
      if (uitkomst.type === "answered") {
        expect(uitkomst.bronnen.map((b) => b.headingSlug).sort()).toEqual(["1-hoofdstuk-a", "2-hoofdstuk-b"]);
        expect(uitkomst.bronnen.every((b) => b.tekst === kennisversie().tekst)).toBe(true); // volledige documenttekst blijft ongewijzigd de LLM-context, ongeacht het hoofdstuk
      }
    });

    it("een document zonder embeddingChunks (trainerkennis van vóór deze functionaliteit) geeft heading:null, gedraagt zich verder exact als voorheen", async () => {
      mockGenerateEmbedding.mockResolvedValue([1, 0]);
      mockGenereerAntwoord.mockImplementation(async (_vraag, bronnen) => ({ type: "answered", answer: "A", reasoning: "R", confidence: 100, model: "test", bronnen }));
      const { payload } = maakFakePayload({ "trainer-kennisversies": [kennisversie({ id: 1, embedding: [[1, 0]] })] }); // geen embeddingChunks

      const uitkomst = await beantwoordTrainerKennisVraag(payload, TRAINER_ID, "Vraag");

      expect(uitkomst.type).toBe("answered");
      if (uitkomst.type === "answered") {
        expect(uitkomst.bronnen).toHaveLength(1);
        expect(uitkomst.bronnen[0]!.heading).toBeNull();
        expect(uitkomst.bronnen[0]!.headingSlug).toBeNull();
      }
    });
  });

  it("geen gepubliceerde/geëmbedde kennis -> lege bronnenlijst, het embedding-model wordt dan nog wel voor de vraag zelf aangeroepen maar er is niets om tegen te vergelijken", async () => {
    mockGenerateEmbedding.mockResolvedValue([1, 0]);
    mockGenereerAntwoord.mockImplementation(async (_vraag, bronnen) => ({
      type: "no-answer",
      answer: "Daarover heb ik in de beschikbare trainerkennis nog onvoldoende informatie.",
      reasoning: "Geen bronnen.",
      confidence: 0,
      model: "test",
      bronnen,
    }));
    const { payload } = maakFakePayload({ "trainer-kennisversies": [] });

    const uitkomst = await beantwoordTrainerKennisVraag(payload, TRAINER_ID, "Vraag");

    expect(mockGenereerAntwoord).toHaveBeenCalledWith("Vraag", []);
    expect(uitkomst.type).toBe("no-answer");
  });
});

describe("beantwoordTrainerKennisVraag — vraaglog (opdrachtseis §3), geen vraag-/antwoordtekst", () => {
  it("logt een gevonden antwoord met de hoogste score en gebruikte bron-ID's, nooit vraag-/antwoordtekst", async () => {
    mockGenerateEmbedding.mockResolvedValue([1, 0]);
    mockGenereerAntwoord.mockImplementation(async (_vraag, bronnen) => ({
      type: "answered",
      answer: "Een heel specifiek antwoord met details",
      reasoning: "Reden",
      confidence: 100,
      model: "test",
      bronnen,
    }));
    const { payload, collection } = maakFakePayload({
      "trainer-kennisversies": [kennisversie({ id: 1, embedding: [[1, 0]] })],
    });

    await beantwoordTrainerKennisVraag(payload, TRAINER_ID, "Hoe lang duurt een periode?");

    const logs = collection("trainer-kennisvragen");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ trainer: TRAINER_ID, antwoordGevonden: true, hoogsteSimilarity: 1, gebruikteBronnen: [1] });
    expect(JSON.stringify(logs[0])).not.toContain("Hoe lang duurt een periode");
    expect(JSON.stringify(logs[0])).not.toContain("Een heel specifiek antwoord");
  });

  it("logt een geweigerd antwoord (onvoldoende kennis) met antwoordGevonden:false en lege bronnenlijst", async () => {
    mockGenerateEmbedding.mockResolvedValue([1, 0]);
    mockGenereerAntwoord.mockResolvedValue({
      type: "no-answer",
      answer: "Daarover heb ik in de beschikbare trainerkennis nog onvoldoende informatie.",
      reasoning: "Geen bronnen.",
      confidence: 0,
      model: "test",
      bronnen: [],
    });
    const { payload, collection } = maakFakePayload({ "trainer-kennisversies": [] });

    await beantwoordTrainerKennisVraag(payload, TRAINER_ID, "Een onbeantwoordbare vraag");

    const logs = collection("trainer-kennisvragen");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ trainer: TRAINER_ID, antwoordGevonden: false, hoogsteSimilarity: null, gebruikteBronnen: [] });
  });

  it("een mislukte vraaglog blokkeert het antwoord aan de trainer niet", async () => {
    mockGenerateEmbedding.mockResolvedValue([1, 0]);
    mockGenereerAntwoord.mockImplementation(async (_vraag, bronnen) => ({
      type: "answered",
      answer: "Antwoord",
      reasoning: "Reden",
      confidence: 100,
      model: "test",
      bronnen,
    }));
    const { payload } = maakFakePayload({ "trainer-kennisversies": [kennisversie({ id: 1, embedding: [[1, 0]] })] });
    const stukPayload = { ...payload, create: async () => { throw new Error("db weg"); } } as unknown as typeof payload;

    const uitkomst = await beantwoordTrainerKennisVraag(stukPayload, TRAINER_ID, "Vraag");

    expect(uitkomst.type).toBe("answered");
  });
});
