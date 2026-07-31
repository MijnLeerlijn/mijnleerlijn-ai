import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { vindAchtergrondDocumentenVoorVariant } from "@/lib/assistant/kennisbasis-context";
import { maakAchtergrondKennisbron } from "@/payload/collections/Variants";

const mockFindByID = vi.fn();
const mockUpdate = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    findByID: (...args: unknown[]) => mockFindByID(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/assistant/kennisbasis-context", () => ({
  vindAchtergrondDocumentenVoorVariant: vi.fn(),
}));
vi.mock("@/payload/collections/Variants", () => ({
  maakAchtergrondKennisbron: vi.fn(),
}));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockVindKandidaten = vi.mocked(vindAchtergrondDocumentenVoorVariant);
const mockMaakAchtergrondKennisbron = vi.mocked(maakAchtergrondKennisbron);

function maakGetRequest() {
  return new NextRequest("http://localhost:3000/api/knowledge-sources/achtergrond/5", {
    method: "GET",
    headers: { Cookie: "payload-token=geldig" },
  });
}

function maakPatchRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/knowledge-sources/achtergrond/5", {
    method: "PATCH",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function maakParams(variantId: string) {
  return { params: Promise.resolve({ variantId }) };
}

beforeEach(() => {
  mockVerify.mockReset();
  mockFindByID.mockReset();
  mockUpdate.mockReset();
  mockVindKandidaten.mockReset();
  mockMaakAchtergrondKennisbron.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
});

// Kennisbasis per variant (2026-07-31): het centrale Kennisbasis-scherm
// leest/schrijft uitsluitend via deze route — de garanties die hier getest
// worden (nooit een tweede document, nooit stille cross-variant-fallback)
// zijn precies de garanties die process-public-question.ts ook aanhoudt.
describe("GET /api/knowledge-sources/achtergrond/[variantId]", () => {
  it("weigert zonder ingelogde admin met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await GET(maakGetRequest(), maakParams("5"));

    expect(response.status).toBe(403);
    expect(mockVindKandidaten).not.toHaveBeenCalled();
  });

  it("geeft 400 bij een ongeldig variant-id", async () => {
    const response = await GET(maakGetRequest(), maakParams("niet-een-getal"));
    expect(response.status).toBe(400);
  });

  it("geeft 404 als de variant niet bestaat", async () => {
    mockFindByID.mockResolvedValue(undefined);

    const response = await GET(maakGetRequest(), maakParams("5"));

    expect(response.status).toBe(404);
  });

  it("geeft document: null terug wanneer de variant nog geen achtergronddocument heeft (geen fallback)", async () => {
    mockFindByID.mockResolvedValue({ id: 5, name: "MijnMonti", branding: { productName: "MijnMonti" }, actief: true, status: "actief" });
    mockVindKandidaten.mockResolvedValue([]);

    const response = await GET(maakGetRequest(), maakParams("5"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.document).toBeNull();
    expect(data.variant).toEqual({
      id: 5,
      name: "MijnMonti",
      productNaam: "MijnMonti",
      actief: true,
      status: "actief",
    });
  });

  it("geeft het gevonden achtergronddocument terug", async () => {
    mockFindByID.mockResolvedValue({ id: 1, name: "MijnLeerlijn", branding: { productName: "MijnLeerlijn" }, actief: true, status: "actief" });
    mockVindKandidaten.mockResolvedValue([
      { id: 60, type: "intern_document", title: "Kennisbasis MijnLeerlijn", content: "De volledige tekst", updatedAt: "2026-07-31T10:00:00.000Z" },
    ]);

    const response = await GET(maakGetRequest(), maakParams("1"));
    const data = await response.json();

    expect(data.document).toEqual({
      id: 60,
      title: "Kennisbasis MijnLeerlijn",
      content: "De volledige tekst",
      updatedAt: "2026-07-31T10:00:00.000Z",
    });
  });

  it("kiest bij meerdere kandidaten (zou nooit mogen door de uniekheidsvalidatie) de meest recent bijgewerkte, zonder te falen", async () => {
    mockFindByID.mockResolvedValue({ id: 1, name: "MijnLeerlijn", actief: true, status: "actief" });
    mockVindKandidaten.mockResolvedValue([
      { id: 60, type: "intern_document", title: "Oud", content: "oud", updatedAt: "2026-07-30T10:00:00.000Z" },
      { id: 61, type: "intern_document", title: "Nieuw", content: "nieuw", updatedAt: "2026-07-31T10:00:00.000Z" },
    ]);

    const response = await GET(maakGetRequest(), maakParams("1"));
    const data = await response.json();

    expect(data.document.id).toBe(61);
  });
});

describe("PATCH /api/knowledge-sources/achtergrond/[variantId]", () => {
  it("weigert zonder ingelogde admin met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await PATCH(maakPatchRequest({ content: "tekst" }), maakParams("5"));

    expect(response.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("geeft 400 zonder geldig content-veld", async () => {
    const response = await PATCH(maakPatchRequest({}), maakParams("5"));
    expect(response.status).toBe(400);
  });

  it("geeft 404 als de variant niet bestaat", async () => {
    mockFindByID.mockResolvedValue(undefined);

    const response = await PATCH(maakPatchRequest({ content: "tekst" }), maakParams("5"));

    expect(response.status).toBe(404);
  });

  it("weigert (409) wanneer er onverhoopt meerdere achtergronddocumenten bestaan, zonder te schrijven", async () => {
    mockFindByID.mockResolvedValue({ id: 5, name: "MijnMonti" });
    mockVindKandidaten.mockResolvedValue([
      { id: 60, type: "intern_document", updatedAt: "2026-07-30T10:00:00.000Z" },
      { id: 61, type: "intern_document", updatedAt: "2026-07-31T10:00:00.000Z" },
    ]);

    const response = await PATCH(maakPatchRequest({ content: "tekst" }), maakParams("5"));

    expect(response.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockMaakAchtergrondKennisbron).not.toHaveBeenCalled();
  });

  it("werkt het bestaande achtergronddocument bij wanneer er al één is", async () => {
    mockFindByID.mockResolvedValue({ id: 1, name: "MijnLeerlijn", branding: { productName: "MijnLeerlijn" } });
    mockVindKandidaten.mockResolvedValue([{ id: 60, type: "intern_document", updatedAt: "2026-07-30T10:00:00.000Z" }]);

    const response = await PATCH(maakPatchRequest({ content: "nieuwe tekst" }), maakParams("1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "knowledge-sources", id: 60, data: { content: "nieuwe tekst" } })
    );
    expect(mockMaakAchtergrondKennisbron).not.toHaveBeenCalled();
    expect(data).toEqual({ ok: true, knowledgeSourceId: 60 });
  });

  it("maakt een nieuw achtergronddocument aan via dezelfde conventie als de automatische hook wanneer de variant er nog geen heeft", async () => {
    mockFindByID.mockResolvedValue({ id: 8, name: "MijnD", branding: { productName: "MijnD" } });
    mockVindKandidaten.mockResolvedValue([]);
    mockMaakAchtergrondKennisbron.mockResolvedValue(99);

    const response = await PATCH(maakPatchRequest({ content: "eerste tekst" }), maakParams("8"));
    const data = await response.json();

    expect(mockMaakAchtergrondKennisbron).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ variantId: 8, productNaam: "MijnD", content: "eerste tekst" })
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(data).toEqual({ ok: true, knowledgeSourceId: 99 });
  });
});
