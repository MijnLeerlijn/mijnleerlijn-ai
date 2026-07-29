import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { uploadDownloadBestand, verwijderBijlage } from "@/services/storage";

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFindByID = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    findByID: (...args: unknown[]) => mockFindByID(...args),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/services/storage", () => ({
  uploadDownloadBestand: vi.fn(),
  verwijderBijlage: vi.fn(),
}));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockUpload = vi.mocked(uploadDownloadBestand);
const mockVerwijder = vi.mocked(verwijderBijlage);

function maakPdf(naam = "handleiding.pdf", inhoud = "%PDF-1.4 test") {
  return new File([inhoud], naam, { type: "application/pdf" });
}

// Bewust GEEN echte NextRequest met een multipart-FormData-body: jsdom's
// File-implementatie (de testomgeving) is niet compatibel met undici's
// eigen multipart-serialisatie/-parsing (Node gooit dan een interne
// webidl-assertion, los van onze routecode). We testen hier de
// routelogica zelf, dus een minimale nepaanvraag met dezelfde
// `cookies.get`/`formData`-vorm als een echte NextRequest volstaat.
function maakRequest(opties: { cookie?: string; formData?: FormData }): NextRequest {
  return {
    cookies: {
      get: (naam: string) =>
        opties.cookie && naam === "payload-token" ? { value: opties.cookie } : undefined,
    },
    formData: async () => opties.formData ?? new FormData(),
  } as unknown as NextRequest;
}

const GEUPLOAD = {
  storageKey: "downloads/uuid-1-handleiding.pdf",
  filename: "handleiding.pdf",
  mimeType: "application/pdf",
  sizeBytes: 13,
  url: "https://storeid.private.blob.vercel-storage.com/downloads/uuid-1-handleiding.pdf",
};

const GEUPLOAD_VERVANGING = {
  storageKey: "downloads/uuid-2-vervanging.pdf",
  filename: "vervanging.pdf",
  mimeType: "application/pdf",
  sizeBytes: 13,
  url: "https://storeid.private.blob.vercel-storage.com/downloads/uuid-2-vervanging.pdf",
};

beforeEach(() => {
  mockVerify.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockFindByID.mockReset();
  mockUpload.mockReset();
  mockVerwijder.mockReset();
  mockVerwijder.mockResolvedValue(undefined);
});

// Downloadbeheer — PDF direct uploaden/vervangen, herzien 2026-07-29: de
// productie-Blob-store is private, dus deze route uploadt rechtstreeks via
// @vercel/blob (services/storage.ts, uploadDownloadBestand) i.p.v. via de
// vercelBlobStorage-plugin (die alleen 'public' ondersteunt). Zie
// app/api/knowledge-sources/upload-file/route.ts voor de volledige analyse.
describe("POST /api/knowledge-sources/upload-file", () => {
  it("weigert een aanvraag zonder ingelogde admin/editor met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const formData = new FormData();
    formData.set("file", maakPdf());
    formData.set("title", "Nieuwe handleiding");

    const response = await POST(maakRequest({ formData }));

    expect(response.status).toBe(403);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag zonder bestand", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const formData = new FormData();
    formData.set("title", "Nieuwe handleiding");

    const response = await POST(maakRequest({ cookie: "geldig", formData }));

    expect(response.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("weigert een niet-PDF-bestand", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const formData = new FormData();
    formData.set("file", new File(["hoi"], "notitie.txt", { type: "text/plain" }));
    formData.set("title", "Nieuwe handleiding");

    const response = await POST(maakRequest({ cookie: "geldig", formData }));

    expect(response.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  describe("nieuw downloaditem", () => {
    it("uploadt privé naar Blob en maakt daarna een media-document + knowledge-source aan", async () => {
      mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
      mockUpload.mockResolvedValue(GEUPLOAD);
      mockCreate.mockResolvedValueOnce({ id: 501 }); // media
      mockCreate.mockResolvedValueOnce({ id: 77 }); // knowledge-source

      const formData = new FormData();
      formData.set("file", maakPdf());
      formData.set("title", "Nieuwe handleiding");

      const response = await POST(maakRequest({ cookie: "geldig", formData }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ ok: true, id: 77, mediaId: 501 });

      expect(mockUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "handleiding.pdf" }));
      expect(mockCreate).toHaveBeenNthCalledWith(1, {
        collection: "media",
        overrideAccess: true,
        data: {
          altText: "Downloadbestand: Nieuwe handleiding",
          mediaType: "download",
          filename: GEUPLOAD.filename,
          mimeType: GEUPLOAD.mimeType,
          filesize: GEUPLOAD.sizeBytes,
          url: GEUPLOAD.url,
        },
      });
      expect(mockCreate).toHaveBeenNthCalledWith(2, {
        collection: "knowledge-sources",
        overrideAccess: true,
        data: {
          title: "Nieuwe handleiding",
          type: "pdf",
          priority: "core",
          file: 501,
          zichtbaar: false,
          status: "new",
          embeddingStatus: "pending",
        },
      });
      // Geen enkel Payload-`file`-optie meer meegegeven — dat zou opnieuw de
      // (op 'public' vastgezette) vercelBlobStorage-plugin triggeren.
      expect(mockCreate.mock.calls[0]?.[0]).not.toHaveProperty("file");
    });

    it("weigert een nieuw downloaditem zonder titel, zonder te uploaden", async () => {
      mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

      const formData = new FormData();
      formData.set("file", maakPdf());

      const response = await POST(maakRequest({ cookie: "geldig", formData }));

      expect(response.status).toBe(400);
      expect(mockUpload).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("laat niets achter als de Blob-upload zelf al mislukt", async () => {
      mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
      mockUpload.mockRejectedValue(new Error("Blob-upload mislukt"));

      const formData = new FormData();
      formData.set("file", maakPdf());
      formData.set("title", "Nieuwe handleiding");

      const response = await POST(maakRequest({ cookie: "geldig", formData }));

      expect(response.status).toBe(500);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockVerwijder).not.toHaveBeenCalled();
    });

    it("ruimt de verweesde blob op als het aanmaken van het media-document mislukt", async () => {
      mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
      mockUpload.mockResolvedValue(GEUPLOAD);
      mockCreate.mockRejectedValueOnce(new Error("DB-fout"));

      const formData = new FormData();
      formData.set("file", maakPdf());
      formData.set("title", "Nieuwe handleiding");

      const response = await POST(maakRequest({ cookie: "geldig", formData }));

      expect(response.status).toBe(500);
      expect(mockVerwijder).toHaveBeenCalledWith(GEUPLOAD.storageKey);
      expect(mockDelete).not.toHaveBeenCalled(); // er was nog geen media-document om te verwijderen
    });

    it("ruimt zowel het nieuwe media-document als de nieuwe blob op als het aanmaken van de knowledge-source mislukt", async () => {
      mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
      mockUpload.mockResolvedValue(GEUPLOAD);
      mockCreate.mockResolvedValueOnce({ id: 501 }); // media lukt
      mockCreate.mockRejectedValueOnce(new Error("DB-fout bij knowledge-source")); // knowledge-source niet
      mockDelete.mockResolvedValue({});

      const formData = new FormData();
      formData.set("file", maakPdf());
      formData.set("title", "Nieuwe handleiding");

      const response = await POST(maakRequest({ cookie: "geldig", formData }));

      expect(response.status).toBe(500);
      expect(mockDelete).toHaveBeenCalledWith({ collection: "media", id: 501, overrideAccess: true });
      expect(mockVerwijder).toHaveBeenCalledWith(GEUPLOAD.storageKey);
    });
  });

  describe("bestaand downloaditem vervangen", () => {
    it("uploadt en koppelt het nieuwe bestand vóórdat het oude wordt opgeruimd", async () => {
      mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
      mockFindByID.mockImplementation(({ collection, id }: { collection: string; id: number }) => {
        if (collection === "knowledge-sources") {
          return Promise.resolve({ id: 12, title: "Bestaande handleiding", file: 900 });
        }
        if (collection === "media" && id === 900) {
          return Promise.resolve({
            id: 900,
            url: "https://storeid.private.blob.vercel-storage.com/downloads/oud-bestand.pdf",
          });
        }
        return Promise.resolve(null);
      });
      mockUpload.mockResolvedValue(GEUPLOAD_VERVANGING);
      mockCreate.mockResolvedValue({ id: 999 }); // nieuwe media
      mockUpdate.mockResolvedValue({});
      mockDelete.mockResolvedValue({});

      const formData = new FormData();
      formData.set("file", maakPdf("vervanging.pdf"));
      formData.set("knowledgeSourceId", "12");

      const response = await POST(maakRequest({ cookie: "geldig", formData }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ ok: true, id: 12, mediaId: 999 });

      expect(mockCreate).toHaveBeenCalledWith({
        collection: "media",
        overrideAccess: true,
        data: {
          altText: "Downloadbestand: Bestaande handleiding",
          mediaType: "download",
          filename: GEUPLOAD_VERVANGING.filename,
          mimeType: GEUPLOAD_VERVANGING.mimeType,
          filesize: GEUPLOAD_VERVANGING.sizeBytes,
          url: GEUPLOAD_VERVANGING.url,
        },
      });
      expect(mockUpdate).toHaveBeenCalledWith({
        collection: "knowledge-sources",
        id: 12,
        overrideAccess: true,
        data: { file: 999 },
      });

      // Volgorde is essentieel voor "geen dubbele bestanden": eerst koppelen,
      // dan pas het oude media-document (en de oude blob) verwijderen.
      const [updateVolgorde] = mockUpdate.mock.invocationCallOrder;
      const [deleteVolgorde] = mockDelete.mock.invocationCallOrder;
      expect(updateVolgorde).toBeDefined();
      expect(deleteVolgorde).toBeDefined();
      expect(updateVolgorde).toBeLessThan(deleteVolgorde!);

      expect(mockDelete).toHaveBeenCalledWith({ collection: "media", id: 900, overrideAccess: true });
      expect(mockVerwijder).toHaveBeenCalledWith("downloads/oud-bestand.pdf");
    });

    it("faalt niet als het opruimen van het oude bestand mislukt — de vervanging zelf is al geslaagd", async () => {
      mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
      mockFindByID.mockImplementation(({ collection, id }: { collection: string; id: number }) => {
        if (collection === "knowledge-sources") {
          return Promise.resolve({ id: 12, title: "Bestaande handleiding", file: 900 });
        }
        if (collection === "media" && id === 900) {
          return Promise.resolve({
            id: 900,
            url: "https://storeid.private.blob.vercel-storage.com/downloads/oud-bestand.pdf",
          });
        }
        return Promise.resolve(null);
      });
      mockUpload.mockResolvedValue(GEUPLOAD_VERVANGING);
      mockCreate.mockResolvedValue({ id: 999 });
      mockUpdate.mockResolvedValue({});
      mockDelete.mockRejectedValue(new Error("Media-document al weg"));
      mockVerwijder.mockRejectedValue(new Error("Blob al weg"));

      const formData = new FormData();
      formData.set("file", maakPdf());
      formData.set("knowledgeSourceId", "12");

      const response = await POST(maakRequest({ cookie: "geldig", formData }));

      expect(response.status).toBe(200);
    });

    it("laat het bestaande bestand volledig ongemoeid als het koppelen aan de knowledge-source mislukt", async () => {
      mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
      mockFindByID.mockImplementation(({ collection, id }: { collection: string; id: number }) => {
        if (collection === "knowledge-sources") {
          return Promise.resolve({ id: 12, title: "Bestaande handleiding", file: 900 });
        }
        if (collection === "media" && id === 900) {
          return Promise.resolve({
            id: 900,
            url: "https://storeid.private.blob.vercel-storage.com/downloads/oud-bestand.pdf",
          });
        }
        return Promise.resolve(null);
      });
      mockUpload.mockResolvedValue(GEUPLOAD_VERVANGING);
      mockCreate.mockResolvedValue({ id: 999 }); // nieuwe media lukt
      mockUpdate.mockRejectedValue(new Error("DB-fout bij koppelen")); // koppelen mislukt
      mockDelete.mockResolvedValue({});

      const formData = new FormData();
      formData.set("file", maakPdf());
      formData.set("knowledgeSourceId", "12");

      const response = await POST(maakRequest({ cookie: "geldig", formData }));

      expect(response.status).toBe(500);

      // De nieuwe (mislukte) media + blob worden opgeruimd...
      expect(mockDelete).toHaveBeenCalledWith({ collection: "media", id: 999, overrideAccess: true });
      expect(mockVerwijder).toHaveBeenCalledWith(GEUPLOAD_VERVANGING.storageKey);
      // ...maar het OUDE bestand (media 900, blob downloads/oud-bestand.pdf)
      // wordt nooit aangeraakt — dat is precies de eis "als uploaden of
      // koppelen mislukt, mag het bestaande bestand niet worden verwijderd".
      expect(mockDelete).not.toHaveBeenCalledWith({ collection: "media", id: 900, overrideAccess: true });
      expect(mockVerwijder).not.toHaveBeenCalledWith("downloads/oud-bestand.pdf");
    });

    it("geeft 404 als het te vervangen downloaditem niet bestaat, zonder te uploaden", async () => {
      mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
      mockFindByID.mockResolvedValue(null);

      const formData = new FormData();
      formData.set("file", maakPdf());
      formData.set("knowledgeSourceId", "999");

      const response = await POST(maakRequest({ cookie: "geldig", formData }));

      expect(response.status).toBe(404);
      expect(mockUpload).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });
});
