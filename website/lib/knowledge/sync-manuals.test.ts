import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncManuals } from "./sync-manuals";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { listManualBlobs, readManualBlob, type ManualBlob } from "./manuals-blob";
import { processKnowledgeSource } from "./process-source";
import { embedKnowledgeSource } from "@/lib/embeddings/process-embedding";

vi.mock("./manuals-blob", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./manuals-blob")>();
  return { ...echt, listManualBlobs: vi.fn(), readManualBlob: vi.fn() };
});
vi.mock("./process-source", () => ({ processKnowledgeSource: vi.fn() }));
vi.mock("@/lib/embeddings/process-embedding", () => ({ embedKnowledgeSource: vi.fn() }));

const mockList = vi.mocked(listManualBlobs);
const mockRead = vi.mocked(readManualBlob);
const mockIndex = vi.mocked(processKnowledgeSource);
const mockEmbed = vi.mocked(embedKnowledgeSource);

function maakBlob(relativePath: string, hash: string): ManualBlob {
  return {
    relativePath,
    hash,
    blobPathname: `${hash}__${relativePath.split("/").pop()}`,
    url: `https://blob.example/${relativePath}`,
    size: 1234,
  };
}

beforeEach(() => {
  mockList.mockReset();
  mockRead.mockReset();
  mockRead.mockResolvedValue(Buffer.from("%PDF-inhoud"));
  mockIndex.mockReset();
  mockEmbed.mockReset();
  mockIndex.mockResolvedValue({ type: "indexed" });
  mockEmbed.mockResolvedValue({ type: "embedded" });
});

describe("syncManuals — één nieuwe PDF", () => {
  it("maakt een media-doc + knowledge-source aan en indexeert/embedt die, zonder onnodig te downloaden", async () => {
    mockList.mockResolvedValue([maakBlob("handleidingen/Analyse.pdf", "hash-analyse".padEnd(64, "0"))]);
    const { payload, collection } = maakFakePayload({});

    const samenvatting = await syncManuals(payload);

    expect(samenvatting).toMatchObject({ gevonden: 1, nieuw: 1, geindexeerd: 1, geembed: 1, mislukt: 0 });
    const bronnen = collection("knowledge-sources");
    expect(bronnen).toHaveLength(1);
    expect(bronnen[0]).toMatchObject({
      title: "Analyse",
      type: "pdf",
      sourceFilePath: "handleidingen/Analyse.pdf",
      sourceFileHash: "hash-analyse".padEnd(64, "0"),
    });
    expect(collection("media")).toHaveLength(1);
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(mockIndex).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ type: "pdf", title: "Analyse" })
    );
    expect(mockEmbed).toHaveBeenCalledWith(payload, bronnen[0]!.id);
  });
});

describe("syncManuals — ongewijzigd opnieuw synchroniseren (herhaald uitvoeren)", () => {
  it("slaat een bron met identieke hash over, ZONDER te downloaden of de AI aan te roepen", async () => {
    const hash = "hash-analyse".padEnd(64, "0");
    mockList.mockResolvedValue([maakBlob("handleidingen/Analyse.pdf", hash)]);
    const { payload } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Analyse",
          type: "pdf",
          sourceFilePath: "handleidingen/Analyse.pdf",
          sourceFileHash: hash,
        },
      ],
    });

    const samenvatting = await syncManuals(payload);

    expect(samenvatting).toMatchObject({ ongewijzigdOvergeslagen: 1, nieuw: 0, bijgewerkt: 0 });
    expect(mockRead).not.toHaveBeenCalled();
    expect(mockIndex).not.toHaveBeenCalled();
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("blijft idempotent over twee volledige, opeenvolgende synchronisatierondes", async () => {
    const hash = "hash-analyse".padEnd(64, "0");
    mockList.mockResolvedValue([maakBlob("handleidingen/Analyse.pdf", hash)]);
    const { payload, collection } = maakFakePayload({});

    const eerste = await syncManuals(payload);
    mockIndex.mockClear();
    mockEmbed.mockClear();
    mockRead.mockClear();
    const tweede = await syncManuals(payload);

    expect(eerste.nieuw).toBe(1);
    expect(tweede).toMatchObject({ nieuw: 0, ongewijzigdOvergeslagen: 1 });
    expect(mockRead).not.toHaveBeenCalled();
    expect(mockIndex).not.toHaveBeenCalled();
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(collection("knowledge-sources")).toHaveLength(1);
  });
});

describe("syncManuals — gewijzigde PDF", () => {
  it("werkt een bestaande bron bij wanneer de hash afwijkt, en herindexeert/herembedt", async () => {
    const nieuweHash = "nieuwe-hash".padEnd(64, "0");
    mockList.mockResolvedValue([maakBlob("handleidingen/Analyse.pdf", nieuweHash)]);
    const { payload, collection } = maakFakePayload({
      "knowledge-sources": [
        {
          id: 1,
          title: "Analyse",
          type: "pdf",
          sourceFilePath: "handleidingen/Analyse.pdf",
          sourceFileHash: "oude-hash".padEnd(64, "0"),
        },
      ],
    });

    const samenvatting = await syncManuals(payload);

    expect(samenvatting).toMatchObject({ bijgewerkt: 1, nieuw: 0, geindexeerd: 1, geembed: 1 });
    expect(collection("knowledge-sources")[0]).toMatchObject({ sourceFileHash: nieuweHash });
    expect(collection("knowledge-sources")).toHaveLength(1);
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(mockIndex).toHaveBeenCalledWith(payload, expect.objectContaining({ id: 1 }));
  });
});

describe("syncManuals — dubbele bestanden (inhoudelijk identiek, andere naam)", () => {
  it("maakt geen tweede bron aan voor een content-duplicaat en rapporteert het als overgeslagen", async () => {
    const zelfdeHash = "zelfde-hash".padEnd(64, "0");
    mockList.mockResolvedValue([
      maakBlob("handleidingen/Analyse.pdf", zelfdeHash),
      maakBlob("handleidingen/Analyse (1).pdf", zelfdeHash),
    ]);
    const { payload, collection } = maakFakePayload({});

    const samenvatting = await syncManuals(payload);

    expect(samenvatting).toMatchObject({ gevonden: 2, nieuw: 1, duplicaatOvergeslagen: 1 });
    expect(collection("knowledge-sources")).toHaveLength(1);
  });
});

describe("syncManuals — lege/corrupte PDF, downloadfouten en AI-fouten", () => {
  it("telt een mislukte indexering (bv. lege PDF) mee zonder te embedden", async () => {
    mockList.mockResolvedValue([maakBlob("handleidingen/Leeg.pdf", "hash-leeg".padEnd(64, "0"))]);
    mockIndex.mockResolvedValue({ type: "failed", foutmelding: "PDF bevat geen leesbare tekst." });

    const { payload } = maakFakePayload({});
    const samenvatting = await syncManuals(payload);

    expect(samenvatting).toMatchObject({ mislukt: 1, geindexeerd: 0, geembed: 0 });
    expect(samenvatting.fouten[0]).toContain("PDF bevat geen leesbare tekst.");
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("vangt een crash tijdens indexeren (bv. een corrupte PDF) netjes af", async () => {
    mockList.mockResolvedValue([maakBlob("handleidingen/Corrupt.pdf", "hash-corrupt".padEnd(64, "0"))]);
    mockIndex.mockRejectedValue(new Error("Invalid PDF structure"));

    const { payload } = maakFakePayload({});
    const samenvatting = await syncManuals(payload);

    expect(samenvatting.mislukt).toBe(1);
    expect(samenvatting.fouten[0]).toContain("Invalid PDF structure");
  });

  it("vangt een mislukte download uit Blob netjes af, zonder te indexeren", async () => {
    mockList.mockResolvedValue([maakBlob("handleidingen/Weg.pdf", "hash-weg".padEnd(64, "0"))]);
    mockRead.mockRejectedValue(
      new Error("Kon handleiding niet downloaden uit Blob (HTTP 404): handleidingen/Weg.pdf")
    );

    const { payload } = maakFakePayload({});
    const samenvatting = await syncManuals(payload);

    expect(samenvatting.mislukt).toBe(1);
    expect(samenvatting.fouten[0]).toContain("niet downloaden uit Blob");
    expect(mockIndex).not.toHaveBeenCalled();
  });

  it("telt een AI-fout tijdens indexeren apart en netjes mee", async () => {
    mockList.mockResolvedValue([maakBlob("handleidingen/Handleiding.pdf", "hash-ai-fout".padEnd(64, "0"))]);
    mockIndex.mockResolvedValue({ type: "failed", foutmelding: "OpenAI: rate limit exceeded" });

    const { payload } = maakFakePayload({});
    const samenvatting = await syncManuals(payload);

    expect(samenvatting.mislukt).toBe(1);
    expect(samenvatting.fouten[0]).toContain("OpenAI: rate limit exceeded");
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("telt een embeddingfout apart, ook al is de indexering zelf gelukt", async () => {
    mockList.mockResolvedValue([
      maakBlob("handleidingen/Handleiding.pdf", "hash-embed-fout".padEnd(64, "0")),
    ]);
    mockEmbed.mockResolvedValue({
      type: "failed",
      foutmelding: "OpenAI: embeddings-eindpunt niet bereikbaar",
    });

    const { payload } = maakFakePayload({});
    const samenvatting = await syncManuals(payload);

    expect(samenvatting).toMatchObject({ geindexeerd: 1, geembed: 0, mislukt: 1 });
    expect(samenvatting.fouten[0]).toContain("embedden mislukt");
  });
});

describe("syncManuals — submap", () => {
  it("verwerkt een bestand uit een submap net zo goed als een bestand in de hoofdmap", async () => {
    mockList.mockResolvedValue([maakBlob("handleidingen/sub/Diep.pdf", "hash-diep".padEnd(64, "0"))]);
    const { payload, collection } = maakFakePayload({});

    const samenvatting = await syncManuals(payload);

    expect(samenvatting.nieuw).toBe(1);
    expect(collection("knowledge-sources")[0]).toMatchObject({
      sourceFilePath: "handleidingen/sub/Diep.pdf",
    });
  });
});

describe("syncManuals — limiet", () => {
  it("verwerkt niet meer dan de opgegeven limiet nieuwe/gewijzigde bestanden per aanroep, zonder de rest te downloaden", async () => {
    mockList.mockResolvedValue([
      maakBlob("handleidingen/A.pdf", "hash-a".padEnd(64, "0")),
      maakBlob("handleidingen/B.pdf", "hash-b".padEnd(64, "0")),
      maakBlob("handleidingen/C.pdf", "hash-c".padEnd(64, "0")),
    ]);
    const { payload, collection } = maakFakePayload({});

    const samenvatting = await syncManuals(payload, { limiet: 2 });

    expect(samenvatting.gevonden).toBe(3);
    expect(samenvatting.nieuw).toBe(2);
    expect(collection("knowledge-sources")).toHaveLength(2);
    expect(mockIndex).toHaveBeenCalledTimes(2);
    expect(mockRead).toHaveBeenCalledTimes(2); // het derde bestand wordt niet eens gedownload
  });
});
