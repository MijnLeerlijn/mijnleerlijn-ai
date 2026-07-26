import { describe, it, expect, vi, beforeEach } from "vitest";
import { del } from "@vercel/blob";
import { ruimKnowledgeSourceBijlagenOp } from "./delete-source";

vi.mock("@vercel/blob", () => ({ del: vi.fn() }));
vi.mock("@/services/storage", () => ({ blobAuthOptions: () => ({}) }));

const mockDel = vi.mocked(del);

function maakPayloadMock(deleteImpl: (...args: unknown[]) => unknown = vi.fn()) {
  return { delete: vi.fn(deleteImpl) } as unknown as Parameters<typeof ruimKnowledgeSourceBijlagenOp>[0];
}

beforeEach(() => {
  mockDel.mockReset();
});

describe("ruimKnowledgeSourceBijlagenOp", () => {
  it("verwijdert zowel de Blob (op basis van sourceFilePath+hash) als het gekoppelde Media-document", async () => {
    mockDel.mockResolvedValue(undefined);
    const payload = maakPayloadMock();

    const resultaat = await ruimKnowledgeSourceBijlagenOp(payload, {
      file: { id: 42 },
      sourceFilePath: "handleidingen/Analyse.pdf",
      sourceFileHash: "ABCDEF",
    });

    expect(mockDel).toHaveBeenCalledWith("handleidingen/abcdef__Analyse.pdf", {});
    expect(payload.delete).toHaveBeenCalledWith({ collection: "media", id: 42, overrideAccess: true, req: undefined });
    expect(resultaat).toEqual({ mediaVerwijderd: true, blobVerwijderd: true });
  });

  it("geeft `req` door aan de geneste payload.delete() — zonder req deadlockt dit tegen de nog-open buitenste transactie (live geverifieerd)", async () => {
    mockDel.mockResolvedValue(undefined);
    const payload = maakPayloadMock();
    const nepReq = { transactionID: "test-tx" } as Parameters<typeof ruimKnowledgeSourceBijlagenOp>[2];

    await ruimKnowledgeSourceBijlagenOp(payload, { file: { id: 42 } }, nepReq);

    expect(payload.delete).toHaveBeenCalledWith({ collection: "media", id: 42, overrideAccess: true, req: nepReq });
  });

  it("accepteert `file` ook als kaal id (niet-gepopuleerde relatie)", async () => {
    mockDel.mockResolvedValue(undefined);
    const payload = maakPayloadMock();

    await ruimKnowledgeSourceBijlagenOp(payload, {
      file: 7,
      sourceFilePath: "handleidingen/Analyse.pdf",
      sourceFileHash: "abc",
    });

    expect(payload.delete).toHaveBeenCalledWith({ collection: "media", id: 7, overrideAccess: true, req: undefined });
  });

  it("slaat de Blob-verwijdering over zonder fout wanneer sourceFilePath/hash ontbreken (bv. handmatig aangemaakte bron)", async () => {
    const payload = maakPayloadMock();

    const resultaat = await ruimKnowledgeSourceBijlagenOp(payload, { file: { id: 1 } });

    expect(mockDel).not.toHaveBeenCalled();
    expect(resultaat.blobVerwijderd).toBe(false);
    expect(resultaat.mediaVerwijderd).toBe(true);
  });

  it("slaat het opruimen van Media over zonder fout wanneer er geen bestand gekoppeld is", async () => {
    const payload = maakPayloadMock();

    const resultaat = await ruimKnowledgeSourceBijlagenOp(payload, {});

    expect(payload.delete).not.toHaveBeenCalled();
    expect(resultaat.mediaVerwijderd).toBe(false);
  });

  it("faalt niet hard wanneer de Blob al verwijderd is (del() gooit een fout)", async () => {
    mockDel.mockRejectedValue(new Error("blob not found"));
    const payload = maakPayloadMock();

    const resultaat = await ruimKnowledgeSourceBijlagenOp(payload, {
      file: { id: 1 },
      sourceFilePath: "handleidingen/Analyse.pdf",
      sourceFileHash: "abc",
    });

    expect(resultaat.blobVerwijderd).toBe(false);
    expect(resultaat.mediaVerwijderd).toBe(true);
  });

  it("faalt niet hard wanneer het Media-document al verwijderd is (payload.delete gooit een fout)", async () => {
    mockDel.mockResolvedValue(undefined);
    const payload = maakPayloadMock(() => {
      throw new Error("not found");
    });

    const resultaat = await ruimKnowledgeSourceBijlagenOp(payload, {
      file: { id: 1 },
      sourceFilePath: "handleidingen/Analyse.pdf",
      sourceFileHash: "abc",
    });

    expect(resultaat.mediaVerwijderd).toBe(false);
    expect(resultaat.blobVerwijderd).toBe(true);
  });
});
