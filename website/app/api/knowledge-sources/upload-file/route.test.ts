import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";

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

const mockVerify = vi.mocked(verifyAdminSessionCookie);

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

beforeEach(() => {
  mockVerify.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockFindByID.mockReset();
});

// Downloadbeheer — PDF direct uploaden/vervangen (2026-07-28): deze route is
// de enige, gecontroleerde uitzondering (overrideAccess: true) die vanuit
// Downloadbeheer een media-document mag aanmaken/koppelen/verwijderen,
// zonder de algemene (adminOnly) toegang op knowledge-sources te verruimen.
// Zie ook app/api/knowledge-sources/upload-file/route.ts.
describe("POST /api/knowledge-sources/upload-file", () => {
  it("weigert een aanvraag zonder ingelogde admin/editor met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const formData = new FormData();
    formData.set("file", maakPdf());
    formData.set("title", "Nieuwe handleiding");

    const response = await POST(maakRequest({ formData }));

    expect(response.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag zonder bestand", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const formData = new FormData();
    formData.set("title", "Nieuwe handleiding");

    const response = await POST(maakRequest({ cookie: "geldig", formData }));

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("weigert een niet-PDF-bestand", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const formData = new FormData();
    formData.set("file", new File(["hoi"], "notitie.txt", { type: "text/plain" }));
    formData.set("title", "Nieuwe handleiding");

    const response = await POST(maakRequest({ cookie: "geldig", formData }));

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("maakt bij een nieuw downloaditem eerst een media-document en dan een knowledge-source aan", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockCreate.mockResolvedValueOnce({ id: 501 }); // media
    mockCreate.mockResolvedValueOnce({ id: 77 }); // knowledge-source

    const formData = new FormData();
    formData.set("file", maakPdf());
    formData.set("title", "Nieuwe handleiding");

    const response = await POST(maakRequest({ cookie: "geldig", formData }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, id: 77, mediaId: 501 });

    expect(mockCreate).toHaveBeenNthCalledWith(1, {
      collection: "media",
      overrideAccess: true,
      file: expect.objectContaining({ mimetype: "application/pdf", name: "handleiding.pdf" }),
      data: { altText: "Downloadbestand: Nieuwe handleiding", mediaType: "download" },
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
  });

  it("weigert een nieuw downloaditem zonder titel", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const formData = new FormData();
    formData.set("file", maakPdf());

    const response = await POST(maakRequest({ cookie: "geldig", formData }));

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("vervangt bij een bestaand downloaditem het bestand en verwijdert daarna pas het oude media-document", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 12, title: "Bestaande handleiding", file: 900 });
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
      file: expect.objectContaining({ name: "vervanging.pdf" }),
      data: { altText: "Downloadbestand: Bestaande handleiding", mediaType: "download" },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      collection: "knowledge-sources",
      id: 12,
      overrideAccess: true,
      data: { file: 999 },
    });

    // Volgorde is essentieel voor "geen dubbele bestanden": eerst koppelen,
    // dan pas het oude media-document (en daarmee de oude Blob) verwijderen.
    const [updateVolgorde] = mockUpdate.mock.invocationCallOrder;
    const [deleteVolgorde] = mockDelete.mock.invocationCallOrder;
    expect(updateVolgorde).toBeDefined();
    expect(deleteVolgorde).toBeDefined();
    expect(updateVolgorde).toBeLessThan(deleteVolgorde!);

    expect(mockDelete).toHaveBeenCalledWith({ collection: "media", id: 900, overrideAccess: true });
  });

  it("faalt niet als het opruimen van het oude media-document mislukt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 12, title: "Bestaande handleiding", file: 900 });
    mockCreate.mockResolvedValue({ id: 999 });
    mockUpdate.mockResolvedValue({});
    mockDelete.mockRejectedValue(new Error("Blob al weg"));

    const formData = new FormData();
    formData.set("file", maakPdf());
    formData.set("knowledgeSourceId", "12");

    const response = await POST(maakRequest({ cookie: "geldig", formData }));

    expect(response.status).toBe(200);
  });

  it("geeft 404 als het te vervangen downloaditem niet bestaat", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue(null);

    const formData = new FormData();
    formData.set("file", maakPdf());
    formData.set("knowledgeSourceId", "999");

    const response = await POST(maakRequest({ cookie: "geldig", formData }));

    expect(response.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
