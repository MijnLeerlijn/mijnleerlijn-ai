import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncManuals } from "./sync-manuals";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { scanManualsDirectory, readManualFile, type ManualFile } from "./manuals-scan";
import { processKnowledgeSource } from "./process-source";
import { embedKnowledgeSource } from "@/lib/embeddings/process-embedding";

vi.mock("./manuals-scan", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./manuals-scan")>();
  return { ...echt, scanManualsDirectory: vi.fn(), readManualFile: vi.fn() };
});
vi.mock("./process-source", () => ({ processKnowledgeSource: vi.fn() }));
vi.mock("@/lib/embeddings/process-embedding", () => ({ embedKnowledgeSource: vi.fn() }));

const mockScan = vi.mocked(scanManualsDirectory);
const mockRead = vi.mocked(readManualFile);
const mockIndex = vi.mocked(processKnowledgeSource);
const mockEmbed = vi.mocked(embedKnowledgeSource);

function maakBestand(relativePath: string): ManualFile {
  return { relativePath, absolutePath: `/repo/website/${relativePath}`, filename: relativePath.split("/").pop()! };
}

beforeEach(() => {
  mockScan.mockReset();
  mockRead.mockReset();
  mockIndex.mockReset();
  mockEmbed.mockReset();
  mockIndex.mockResolvedValue({ type: "indexed" });
  mockEmbed.mockResolvedValue({ type: "embedded" });
});

describe("syncManuals — één nieuwe PDF", () => {
  it("maakt een media-doc + knowledge-source aan en indexeert/embedt die", async () => {
    mockScan.mockResolvedValue([maakBestand("handleidingen/Analyse.pdf")]);
    mockRead.mockResolvedValue({ buffer: Buffer.from("%PDF-inhoud"), hash: "hash-analyse" });
    const { payload, collection } = maakFakePayload({});

    const samenvatting = await syncManuals(payload);

    expect(samenvatting).toMatchObject({ gevonden: 1, nieuw: 1, geindexeerd: 1, geembed: 1, mislukt: 0 });
    const bronnen = collection("knowledge-sources");
    expect(bronnen).toHaveLength(1);
    expect(bronnen[0]).toMatchObject({
      title: "Analyse",
      type: "pdf",
      sourceFilePath: "handleidingen/Analyse.pdf",
      sourceFileHash: "hash-analyse",
    });
    expect(collection("media")).toHaveLength(1);
    expect(mockIndex).toHaveBeenCalledWith(payload, expect.objectContaining({ type: "pdf", title: "Analyse" }));
    expect(mockEmbed).toHaveBeenCalledWith(payload, bronnen[0]!.id);
  });
});

describe("syncManuals — ongewijzigd opnieuw synchroniseren (herhaald uitvoeren)", () => {
  it("slaat een bron met identieke hash over, zonder de AI aan te roepen", async () => {
    mockScan.mockResolvedValue([maakBestand("handleidingen/Analyse.pdf")]);
    mockRead.mockResolvedValue({ buffer: Buffer.from("inhoud"), hash: "hash-analyse" });
    const { payload } = maakFakePayload({
      "knowledge-sources": [{ id: 1, title: "Analyse", type: "pdf", sourceFilePath: "handleidingen/Analyse.pdf", sourceFileHash: "hash-analyse" }],
    });

    const samenvatting = await syncManuals(payload);

    expect(samenvatting).toMatchObject({ ongewijzigdOvergeslagen: 1, nieuw: 0, bijgewerkt: 0 });
    expect(mockIndex).not.toHaveBeenCalled();
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("blijft idempotent over twee volledige, opeenvolgende synchronisatierondes", async () => {
    mockScan.mockResolvedValue([maakBestand("handleidingen/Analyse.pdf")]);
    mockRead.mockResolvedValue({ buffer: Buffer.from("inhoud"), hash: "hash-analyse" });
    const { payload, collection } = maakFakePayload({});

    const eerste = await syncManuals(payload);
    mockIndex.mockClear();
    mockEmbed.mockClear();
    const tweede = await syncManuals(payload);

    expect(eerste.nieuw).toBe(1);
    expect(tweede).toMatchObject({ nieuw: 0, ongewijzigdOvergeslagen: 1 });
    expect(mockIndex).not.toHaveBeenCalled();
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(collection("knowledge-sources")).toHaveLength(1);
  });
});

describe("syncManuals — gewijzigde PDF", () => {
  it("werkt een bestaande bron bij wanneer de hash afwijkt, en herindexeert/herembedt", async () => {
    mockScan.mockResolvedValue([maakBestand("handleidingen/Analyse.pdf")]);
    mockRead.mockResolvedValue({ buffer: Buffer.from("nieuwe inhoud"), hash: "nieuwe-hash" });
    const { payload, collection } = maakFakePayload({
      "knowledge-sources": [{ id: 1, title: "Analyse", type: "pdf", sourceFilePath: "handleidingen/Analyse.pdf", sourceFileHash: "oude-hash" }],
    });

    const samenvatting = await syncManuals(payload);

    expect(samenvatting).toMatchObject({ bijgewerkt: 1, nieuw: 0, geindexeerd: 1, geembed: 1 });
    expect(collection("knowledge-sources")[0]).toMatchObject({ sourceFileHash: "nieuwe-hash" });
    expect(collection("knowledge-sources")).toHaveLength(1);
    expect(mockIndex).toHaveBeenCalledWith(payload, expect.objectContaining({ id: 1 }));
  });
});

describe("syncManuals — dubbele bestanden (inhoudelijk identiek, andere naam)", () => {
  it("maakt geen tweede bron aan voor een content-duplicaat en rapporteert het als overgeslagen", async () => {
    mockScan.mockResolvedValue([maakBestand("handleidingen/Analyse.pdf"), maakBestand("handleidingen/Analyse (1).pdf")]);
    mockRead.mockResolvedValue({ buffer: Buffer.from("identieke inhoud"), hash: "zelfde-hash" });
    const { payload, collection } = maakFakePayload({});

    const samenvatting = await syncManuals(payload);

    expect(samenvatting).toMatchObject({ gevonden: 2, nieuw: 1, duplicaatOvergeslagen: 1 });
    expect(collection("knowledge-sources")).toHaveLength(1);
  });
});

describe("syncManuals — lege/corrupte PDF en AI-fouten", () => {
  it("telt een mislukte indexering (bv. lege PDF) mee zonder te embedden", async () => {
    mockScan.mockResolvedValue([maakBestand("handleidingen/Leeg.pdf")]);
    mockRead.mockResolvedValue({ buffer: Buffer.from(""), hash: "hash-leeg" });
    mockIndex.mockResolvedValue({ type: "failed", foutmelding: "PDF bevat geen leesbare tekst." });

    const { payload } = maakFakePayload({});
    const samenvatting = await syncManuals(payload);

    expect(samenvatting).toMatchObject({ mislukt: 1, geindexeerd: 0, geembed: 0 });
    expect(samenvatting.fouten[0]).toContain("PDF bevat geen leesbare tekst.");
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("vangt een crash tijdens indexeren (bv. een corrupte PDF) netjes af", async () => {
    mockScan.mockResolvedValue([maakBestand("handleidingen/Corrupt.pdf")]);
    mockRead.mockResolvedValue({ buffer: Buffer.from("geen geldige pdf"), hash: "hash-corrupt" });
    mockIndex.mockRejectedValue(new Error("Invalid PDF structure"));

    const { payload } = maakFakePayload({});
    const samenvatting = await syncManuals(payload);

    expect(samenvatting.mislukt).toBe(1);
    expect(samenvatting.fouten[0]).toContain("Invalid PDF structure");
  });

  it("telt een AI-fout tijdens indexeren apart en netjes mee", async () => {
    mockScan.mockResolvedValue([maakBestand("handleidingen/Handleiding.pdf")]);
    mockRead.mockResolvedValue({ buffer: Buffer.from("inhoud"), hash: "hash-ai-fout" });
    mockIndex.mockResolvedValue({ type: "failed", foutmelding: "OpenAI: rate limit exceeded" });

    const { payload } = maakFakePayload({});
    const samenvatting = await syncManuals(payload);

    expect(samenvatting.mislukt).toBe(1);
    expect(samenvatting.fouten[0]).toContain("OpenAI: rate limit exceeded");
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("telt een embeddingfout apart, ook al is de indexering zelf gelukt", async () => {
    mockScan.mockResolvedValue([maakBestand("handleidingen/Handleiding.pdf")]);
    mockRead.mockResolvedValue({ buffer: Buffer.from("inhoud"), hash: "hash-embed-fout" });
    mockEmbed.mockResolvedValue({ type: "failed", foutmelding: "OpenAI: embeddings-eindpunt niet bereikbaar" });

    const { payload } = maakFakePayload({});
    const samenvatting = await syncManuals(payload);

    expect(samenvatting).toMatchObject({ geindexeerd: 1, geembed: 0, mislukt: 1 });
    expect(samenvatting.fouten[0]).toContain("embedden mislukt");
  });
});

describe("syncManuals — submap", () => {
  it("verwerkt een bestand uit een submap net zo goed als een bestand in de hoofdmap", async () => {
    mockScan.mockResolvedValue([maakBestand("handleidingen/sub/Diep.pdf")]);
    mockRead.mockResolvedValue({ buffer: Buffer.from("inhoud"), hash: "hash-diep" });
    const { payload, collection } = maakFakePayload({});

    const samenvatting = await syncManuals(payload);

    expect(samenvatting.nieuw).toBe(1);
    expect(collection("knowledge-sources")[0]).toMatchObject({ sourceFilePath: "handleidingen/sub/Diep.pdf" });
  });
});

describe("syncManuals — limiet", () => {
  it("verwerkt niet meer dan de opgegeven limiet nieuwe/gewijzigde bestanden per aanroep", async () => {
    mockScan.mockResolvedValue([
      maakBestand("handleidingen/A.pdf"),
      maakBestand("handleidingen/B.pdf"),
      maakBestand("handleidingen/C.pdf"),
    ]);
    mockRead.mockImplementation(async (bestand) => ({ buffer: Buffer.from(bestand.filename), hash: `hash-${bestand.filename}` }));
    const { payload, collection } = maakFakePayload({});

    const samenvatting = await syncManuals(payload, { limiet: 2 });

    expect(samenvatting.gevonden).toBe(3);
    expect(samenvatting.nieuw).toBe(2);
    expect(collection("knowledge-sources")).toHaveLength(2);
    expect(mockIndex).toHaveBeenCalledTimes(2);
  });
});
