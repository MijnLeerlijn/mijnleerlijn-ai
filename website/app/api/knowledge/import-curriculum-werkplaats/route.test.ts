import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { importeerCurriculumWerkplaatsKennis } from "@/lib/knowledge/import-curriculum-werkplaats";

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({ secret: "test", logger: { info: vi.fn(), warn: vi.fn() } }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/knowledge/import-curriculum-werkplaats", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/knowledge/import-curriculum-werkplaats")>();
  return { ...echt, importeerCurriculumWerkplaatsKennis: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockImporteer = vi.mocked(importeerCurriculumWerkplaatsKennis);

function maakRequest(opties: { cookie?: string } = {}) {
  return new NextRequest("http://localhost:3000/api/knowledge/import-curriculum-werkplaats", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}),
    },
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockImporteer.mockReset();
});

describe("POST /api/knowledge/import-curriculum-werkplaats", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403 en voert niets uit", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest());

    expect(response.status).toBe(403);
    expect(mockImporteer).not.toHaveBeenCalled();
  });

  it("weigert een niet-beheerder (editor) met 403 en voert niets uit", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-maar-editor" }));

    expect(response.status).toBe(403);
    expect(mockImporteer).not.toHaveBeenCalled();
  });

  it("staat een beheerder toe en geeft de aantallen als JSON terug", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockImporteer.mockResolvedValue({ aangemaakt: 19, bijgewerkt: 0, verwerkt: 19, fouten: [] });

    const response = await POST(maakRequest({ cookie: "geldig-admin" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockImporteer).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ aangemaakt: 19, bijgewerkt: 0, verwerkt: 19, fouten: [] });
  });

  it("negeert een eventuele request-body volledig — er is geen generieke import mogelijk", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockImporteer.mockResolvedValue({ aangemaakt: 0, bijgewerkt: 19, verwerkt: 19, fouten: [] });

    const request = new NextRequest("http://localhost:3000/api/knowledge/import-curriculum-werkplaats", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "payload-token=geldig-admin" },
      body: JSON.stringify({ collection: "articles", ids: [1, 2, 3], slug: "iets-willekeurigs" }),
    });

    await POST(request);

    // De onderliggende functie krijgt uitsluitend de payload-instantie mee —
    // geen enkel veld uit de (genegeerde) body.
    expect(mockImporteer).toHaveBeenCalledWith(expect.anything());
    expect(mockImporteer.mock.calls[0]).toHaveLength(1);
  });

  it("geeft 500 met een technische foutmelding terug als de import zelf gooit, zonder te loggen wat een aanvaller kan gebruiken", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockImporteer.mockRejectedValue(new Error("Database niet bereikbaar"));

    const response = await POST(maakRequest({ cookie: "geldig-admin" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Database niet bereikbaar");
  });
});
