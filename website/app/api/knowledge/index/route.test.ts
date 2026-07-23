import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { runKnowledgeIndexing } from "@/lib/knowledge/run-indexing";

// Zelfde opzet als app/api/support/analyze/route.test.ts — dekt uitsluitend
// de route zelf (sessiecontrole, body-doorgifte); de indexeerlogica zelf
// heeft eigen tests in lib/knowledge/*.test.ts.

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({ secret: "test", logger: { info: vi.fn(), warn: vi.fn() } }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/knowledge/run-indexing", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/knowledge/run-indexing")>();
  return { ...echt, runKnowledgeIndexing: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockRun = vi.mocked(runKnowledgeIndexing);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/knowledge/index", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}),
    },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockRun.mockReset();
});

describe("POST /api/knowledge/index", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403, zonder indexeren te starten", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: {} }));

    expect(response.status).toBe(403);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag van een ingelogde niet-beheerder (editor) met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-maar-editor", body: {} }));

    expect(response.status).toBe(403);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("start indexeren met de standaardlimiet wanneer een beheerder een lege body stuurt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRun.mockResolvedValue({ verwerkt: 0, geindexeerd: 0, mislukt: 0, fouten: [] });

    const response = await POST(maakRequest({ cookie: "geldig-admin" }));

    expect(response.status).toBe(200);
    expect(mockRun).toHaveBeenCalledWith(expect.anything(), { sourceIds: undefined, limiet: 5 });
  });

  it("geeft expliciete sourceIds door aan het indexeren (dekt zowel nieuwe als herindexeren)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRun.mockResolvedValue({ verwerkt: 2, geindexeerd: 2, mislukt: 0, fouten: [] });

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: { sourceIds: [10, 20] } }));
    const data = await response.json();

    expect(mockRun).toHaveBeenCalledWith(expect.anything(), { sourceIds: [10, 20], limiet: 5 });
    expect(data.geindexeerd).toBe(2);
  });
});
