import { describe, it, expect, vi, beforeEach } from "vitest";
import { privateBlobAdapter } from "./private-blob-adapter";
import { uploadMediaBestand, verwijderBijlage } from "@/services/storage";

vi.mock("@/services/storage", () => ({
  uploadMediaBestand: vi.fn(),
  verwijderBijlage: vi.fn(),
}));

const mockUpload = vi.mocked(uploadMediaBestand);
const mockVerwijder = vi.mocked(verwijderBijlage);

beforeEach(() => {
  mockUpload.mockReset();
  mockVerwijder.mockReset();
});

// Uniforme private-uploadarchitectuur (2026-07-31): deze adapter is de
// enige plek die @payloadcms/plugin-cloud-storage se raamwerk (multi-file-
// orchestratie, vervang-opruiming) koppelt aan services/storage.ts se
// private-uploadfuncties. Getest los van een echte Payload-collectie —
// alleen de adapter se eigen contract (handleUpload/handleDelete).
describe("privateBlobAdapter", () => {
  it("handleUpload uploadt de buffer via uploadMediaBestand en zet het resultaat als url", async () => {
    mockUpload.mockResolvedValue({
      storageKey: "media/uuid-logo.png",
      filename: "logo.png",
      mimeType: "image/png",
      sizeBytes: 1234,
      url: "https://xyz.private.blob.vercel-storage.com/media/uuid-logo.png",
    });

    const adapter = privateBlobAdapter({ collection: {} as never });
    const buffer = Buffer.from("fake-image-data");
    const result = await adapter.handleUpload({
      data: {},
      file: { buffer, filename: "logo.png", filesize: buffer.byteLength, mimeType: "image/png" },
      collection: {} as never,
      req: {} as never,
      clientUploadContext: undefined,
    });

    expect(mockUpload).toHaveBeenCalledWith(buffer, { filename: "logo.png", mimeType: "image/png" });
    expect(result).toEqual({ url: "https://xyz.private.blob.vercel-storage.com/media/uuid-logo.png" });
  });

  it("handleDelete verwijdert de blob wanneer de filename overeenkomt met het document se eigen private url", async () => {
    const adapter = privateBlobAdapter({ collection: {} as never });
    await adapter.handleDelete({
      collection: {} as never,
      req: {} as never,
      filename: "logo.png",
      doc: {
        id: 5,
        filename: "logo.png",
        url: "https://xyz.private.blob.vercel-storage.com/media/uuid-logo.png",
      } as never,
    });

    expect(mockVerwijder).toHaveBeenCalledWith("media/uuid-logo.png");
  });

  it("handleDelete doet niets wanneer de filename niet overeenkomt met het hoofdbestand (geen groottevarianten)", async () => {
    const adapter = privateBlobAdapter({ collection: {} as never });
    await adapter.handleDelete({
      collection: {} as never,
      req: {} as never,
      filename: "thumbnail-logo.png",
      doc: {
        id: 5,
        filename: "logo.png",
        url: "https://xyz.private.blob.vercel-storage.com/media/uuid-logo.png",
      } as never,
    });

    expect(mockVerwijder).not.toHaveBeenCalled();
  });

  it("handleDelete doet niets wanneer de opgeslagen url geen herkenbare private-Blob-URL is (bv. al verwijderd/extern)", async () => {
    const adapter = privateBlobAdapter({ collection: {} as never });
    await adapter.handleDelete({
      collection: {} as never,
      req: {} as never,
      filename: "logo.png",
      doc: { id: 5, filename: "logo.png", url: "https://example.com/niet-onze-store/logo.png" } as never,
    });

    expect(mockVerwijder).not.toHaveBeenCalled();
  });

  it("staticHandler geeft altijd 404 — geen tweede, ongecontroleerde leesroute", async () => {
    const adapter = privateBlobAdapter({ collection: {} as never });
    const response = await adapter.staticHandler({} as never, {
      params: { collection: "media", filename: "logo.png" },
    });
    expect(response.status).toBe(404);
  });
});
