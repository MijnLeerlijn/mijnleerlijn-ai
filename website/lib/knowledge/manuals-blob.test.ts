import { describe, it, expect, vi, beforeEach } from "vitest";
import { list } from "@vercel/blob";
import { listManualBlobs, readManualBlob, blobPathnameVoor, titleFromFilename } from "./manuals-blob";

vi.mock("@vercel/blob", () => ({ list: vi.fn() }));
vi.mock("@/services/storage", () => ({ blobAuthOptions: () => ({}) }));

const mockList = vi.mocked(list);

function maakBlob(pathname: string, size = 1234) {
  return {
    url: `https://blob.example/${pathname}`,
    downloadUrl: `https://blob.example/${pathname}?download=1`,
    pathname,
    size,
    uploadedAt: new Date(),
    etag: "irrelevant",
  };
}

beforeEach(() => {
  mockList.mockReset();
});

describe("blobPathnameVoor", () => {
  it("codeert de hash in de bestandsnaam, structuur van submappen blijft behouden", () => {
    expect(blobPathnameVoor("handleidingen/Analyse.pdf", "ABCDEF")).toBe("handleidingen/abcdef__Analyse.pdf");
    expect(blobPathnameVoor("handleidingen/sub/Diep.pdf", "abc123")).toBe(
      "handleidingen/sub/abc123__Diep.pdf"
    );
  });
});

describe("listManualBlobs", () => {
  it("herleidt relativePath en hash uit de Blob-bestandsnaam, zonder download", async () => {
    const hash = "a".repeat(64);
    mockList.mockResolvedValue({
      blobs: [maakBlob(`handleidingen/${hash}__Analyse.pdf`, 5000)],
      hasMore: false,
    } as never);

    const resultaat = await listManualBlobs();

    expect(resultaat).toHaveLength(1);
    expect(resultaat[0]).toMatchObject({
      relativePath: "handleidingen/Analyse.pdf",
      hash,
      size: 5000,
    });
  });

  it("negeert bestanden zonder het verwachte hash-patroon en niet-PDF's", async () => {
    const hash = "b".repeat(64);
    mockList.mockResolvedValue({
      blobs: [
        maakBlob(`handleidingen/${hash}__Video.mp4`), // geen .pdf
        maakBlob("handleidingen/zonder-hash-patroon.pdf"), // geen sha256-prefix
        maakBlob(`handleidingen/${hash}__Analyse.pdf`),
      ],
      hasMore: false,
    } as never);

    const resultaat = await listManualBlobs();

    expect(resultaat).toHaveLength(1);
    expect(resultaat[0]!.relativePath).toBe("handleidingen/Analyse.pdf");
  });

  it("vindt bestanden uit een submap (recursief via de Blob-prefix)", async () => {
    const hash = "c".repeat(64);
    mockList.mockResolvedValue({
      blobs: [maakBlob(`handleidingen/sub/${hash}__Diep.pdf`)],
      hasMore: false,
    } as never);

    const resultaat = await listManualBlobs();

    expect(resultaat[0]!.relativePath).toBe("handleidingen/sub/Diep.pdf");
  });

  it("doorloopt alle paginas via de cursor", async () => {
    const hashA = "1".repeat(64);
    const hashB = "2".repeat(64);
    mockList
      .mockResolvedValueOnce({
        blobs: [maakBlob(`handleidingen/${hashA}__A.pdf`)],
        hasMore: true,
        cursor: "volgende-pagina",
      } as never)
      .mockResolvedValueOnce({
        blobs: [maakBlob(`handleidingen/${hashB}__B.pdf`)],
        hasMore: false,
      } as never);

    const resultaat = await listManualBlobs();

    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockList).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "volgende-pagina" }));
    expect(resultaat.map((b) => b.relativePath).sort()).toEqual([
      "handleidingen/A.pdf",
      "handleidingen/B.pdf",
    ]);
  });

  it("geeft een lege lijst terug wanneer Blob geen bestanden onder de prefix heeft", async () => {
    mockList.mockResolvedValue({ blobs: [], hasMore: false } as never);

    expect(await listManualBlobs()).toEqual([]);
  });
});

describe("readManualBlob", () => {
  it("downloadt de inhoud via de blob-url", async () => {
    const inhoud = Buffer.from("%PDF-inhoud");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => inhoud.buffer.slice(inhoud.byteOffset, inhoud.byteOffset + inhoud.byteLength),
    }) as unknown as typeof fetch;

    const buffer = await readManualBlob({
      relativePath: "handleidingen/Analyse.pdf",
      hash: "a".repeat(64),
      blobPathname: `handleidingen/${"a".repeat(64)}__Analyse.pdf`,
      url: "https://blob.example/analyse",
      size: 11,
    });

    expect(buffer.toString()).toBe("%PDF-inhoud");
  });

  it("gooit een duidelijke fout bij een mislukte download", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;

    await expect(
      readManualBlob({
        relativePath: "handleidingen/Weg.pdf",
        hash: "a".repeat(64),
        blobPathname: "handleidingen/weg",
        url: "https://blob.example/weg",
        size: 0,
      })
    ).rejects.toThrow(/404/);
  });
});

describe("titleFromFilename", () => {
  it("zet streepjes/underscores om naar spaties en verwijdert de extensie", () => {
    expect(titleFromFilename("Hoe-maak-je-een-hoofdprofiel-aan.pdf")).toBe(
      "Hoe maak je een hoofdprofiel aan"
    );
    expect(titleFromFilename("Admin_Statussets_1.PDF")).toBe("Admin Statussets 1");
  });
});
