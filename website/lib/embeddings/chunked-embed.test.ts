import { describe, it, expect, vi, beforeEach } from "vitest";
import { embedInChunksIfChanged } from "./chunked-embed";
import { generateEmbedding } from "@/services/ai-client";
import { hashText } from "./text-hash";
import { APICallError } from "ai";

// Productiecontrole, vervolgronde (2026-08-23) — dekt de fix voor de live
// HTTP 400: een lange trainerkennistekst moet in meerdere chunks embedden
// i.p.v. in één (te grote) aanroep, en een mislukte chunk moet een volledige,
// veilige diagnose opleveren (categorie/stap/HTTP-status/model/lengte/
// chunkindex) zonder ooit de tekst zelf te loggen/retourneren.

vi.mock("@/services/ai-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/services/ai-client")>();
  return { ...echt, generateEmbedding: vi.fn(), getEmbeddingModelId: () => "text-embedding-3-small-test" };
});

const mockGenerateEmbedding = vi.mocked(generateEmbedding);

beforeEach(() => {
  mockGenerateEmbedding.mockReset();
});

describe("embedInChunksIfChanged — skip/validatie", () => {
  it("slaat een onveranderde, al geïndexeerde tekst over, geen enkele AI-aanroep", async () => {
    const tekst = "Korte tekst.";
    const uitkomst = await embedInChunksIfChanged({ text: tekst, storedHash: hashText(tekst), storedStatus: "indexed" });
    expect(uitkomst).toEqual({ type: "skipped" });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("blanco tekst geeft een failed-uitkomst met de eigen categorie, geen AI-aanroep", async () => {
    const uitkomst = await embedInChunksIfChanged({ text: "   ", storedHash: null, storedStatus: null });
    expect(uitkomst).toEqual({
      type: "failed",
      diagnose: { categorie: "geen_tekst_om_te_embedden", stap: "onbekend", httpStatus: null, model: "text-embedding-3-small-test", inputTekens: 0, geschatTokens: 0, chunkIndex: 0, totaalChunks: 0 },
    });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });
});

describe("embedInChunksIfChanged — korte tekst (één chunk)", () => {
  it("embedt korte, gewijzigde tekst in exact één aanroep/chunk", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2]);
    const tekst = "Een periode duurt zes weken.";
    const uitkomst = await embedInChunksIfChanged({ text: tekst, storedHash: hashText("iets anders"), storedStatus: "indexed" });

    expect(uitkomst).toEqual({
      type: "embedded",
      embeddings: [[0.1, 0.2]],
      chunkMeta: [{ heading: null, headingSlug: null, headingLevel: null, chunkIndex: 0 }],
      model: "text-embedding-3-small-test",
      hash: hashText(tekst),
      aantalChunks: 1,
    });
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
    expect(mockGenerateEmbedding).toHaveBeenCalledWith(tekst);
  });

  it("embedt een document dat nog nooit geëmbed is (status 'pending')", async () => {
    mockGenerateEmbedding.mockResolvedValue([1, 0]);
    const uitkomst = await embedInChunksIfChanged({ text: "Nieuwe bron.", storedHash: null, storedStatus: "pending" });
    expect(uitkomst.type).toBe("embedded");
  });
});

describe("embedInChunksIfChanged — lange tekst (meerdere chunks), de kern van deze fix", () => {
  it("een tekst vergelijkbaar met de live Basiskennis-lengte wordt in meerdere chunks embed, elk apart aangeroepen", async () => {
    let volgnummer = 0;
    mockGenerateEmbedding.mockImplementation(async () => [volgnummer++, 0]);

    // Simuleert een lange, feitbehoudende AI-herschrijving van een
    // Kennisbasis-achtergronddocument — ruim boven de 8191-tokenlimiet van
    // text-embedding-3-small als één ongedeelde aanroep.
    const alineas = Array.from({ length: 60 }, (_, i) => `Onderwerp ${i}: ${"feitelijke informatie ".repeat(50).trim()}`);
    const langeTekst = alineas.join("\n\n");

    const uitkomst = await embedInChunksIfChanged({ text: langeTekst, storedHash: null, storedStatus: "pending" });

    expect(uitkomst.type).toBe("embedded");
    if (uitkomst.type === "embedded") {
      expect(uitkomst.aantalChunks).toBeGreaterThan(1);
      expect(uitkomst.embeddings).toHaveLength(uitkomst.aantalChunks);
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(uitkomst.aantalChunks);
      // Elke aanroep kreeg een tekst die zelf ruim onder de limiet blijft.
      for (const call of mockGenerateEmbedding.mock.calls) {
        expect((call[0] as string).length).toBeLessThanOrEqual(6000);
      }
    }
  });

  it("stopt bij de eerste mislukte chunk (geen verdere AI-aanroepen), geeft een volledige diagnose terug", async () => {
    mockGenerateEmbedding
      .mockResolvedValueOnce([1, 0])
      .mockRejectedValueOnce(new APICallError({ message: "te lang", url: "https://api.openai.com/v1/embeddings", requestBodyValues: {}, statusCode: 400 }));

    const alineas = Array.from({ length: 40 }, (_, i) => `Onderwerp ${i}: ${"tekst ".repeat(200).trim()}`);
    const langeTekst = alineas.join("\n\n");

    const uitkomst = await embedInChunksIfChanged({ text: langeTekst, storedHash: null, storedStatus: "pending" });

    expect(uitkomst.type).toBe("failed");
    if (uitkomst.type === "failed") {
      expect(uitkomst.diagnose.categorie).toBe("openai_verzoek_ongeldig");
      expect(uitkomst.diagnose.stap).toBe("aanroep");
      expect(uitkomst.diagnose.httpStatus).toBe(400);
      expect(uitkomst.diagnose.model).toBe("text-embedding-3-small-test");
      expect(uitkomst.diagnose.chunkIndex).toBe(1); // de tweede chunk (0-based index 1) faalde
      expect(uitkomst.diagnose.totaalChunks).toBeGreaterThan(1);
      expect(uitkomst.diagnose.inputTekens).toBeGreaterThan(0);
      expect(uitkomst.diagnose.geschatTokens).toBeGreaterThan(0);
    }
    // Geen derde aanroep na de mislukking bij chunk 2 — geen halve/verspilde verdere AI-aanroepen.
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(2);
  });

  it("geeft de heading-metadata per chunk terug (opdrachtseis §4), index-uitgelijnd met embeddings", async () => {
    mockGenerateEmbedding.mockResolvedValue([1, 0]);
    const tekst = ["## 1. Eerste hoofdstuk", "Inhoud 1.", "", "## 2. Tweede hoofdstuk", "Inhoud 2."].join("\n");

    const uitkomst = await embedInChunksIfChanged({ text: tekst, storedHash: null, storedStatus: "pending" });

    expect(uitkomst.type).toBe("embedded");
    if (uitkomst.type === "embedded") {
      expect(uitkomst.chunkMeta).toEqual([
        { heading: "1. Eerste hoofdstuk", headingSlug: "1-eerste-hoofdstuk", headingLevel: 2, chunkIndex: 0 },
        { heading: "2. Tweede hoofdstuk", headingSlug: "2-tweede-hoofdstuk", headingLevel: 2, chunkIndex: 1 },
      ]);
      expect(uitkomst.chunkMeta).toHaveLength(uitkomst.embeddings.length);
    }
  });

  it("de diagnose bevat nooit de inhoud van de (mislukte) chunk zelf", async () => {
    mockGenerateEmbedding.mockRejectedValue(
      new APICallError({ message: "fout", url: "https://api.openai.com/v1/embeddings", requestBodyValues: {}, statusCode: 400 })
    );
    const geheimeInhoud = "ZEER GEHEIME TRAINERKENNIS DIE NOOIT GELOGD MAG WORDEN";
    const uitkomst = await embedInChunksIfChanged({ text: geheimeInhoud, storedHash: null, storedStatus: "pending" });

    expect(uitkomst.type).toBe("failed");
    expect(JSON.stringify(uitkomst)).not.toContain(geheimeInhoud);
  });
});
