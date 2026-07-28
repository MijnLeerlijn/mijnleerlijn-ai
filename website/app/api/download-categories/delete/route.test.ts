import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";

const mockCount = vi.fn();
const mockDelete = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    count: (...args: unknown[]) => mockCount(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/download-categories/delete", {
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
  mockCount.mockReset();
  mockDelete.mockReset();
});

describe("POST /api/download-categories/delete", () => {
  it("weigert een aanvraag zonder ingelogde admin/editor met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: { id: 1 } }));

    expect(response.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("weigert verwijderen (409, duidelijke melding) wanneer de categorie nog in gebruik is", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockCount.mockResolvedValueOnce({ totalDocs: 2 }).mockResolvedValueOnce({ totalDocs: 1 });

    const response = await POST(maakRequest({ cookie: "geldig", body: { id: 5 } }));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("3");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("verwijdert de categorie wanneer deze niet meer gebruikt wordt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockCount.mockResolvedValueOnce({ totalDocs: 0 }).mockResolvedValueOnce({ totalDocs: 0 });
    mockDelete.mockResolvedValue({});

    const response = await POST(maakRequest({ cookie: "geldig", body: { id: 5 } }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(mockDelete).toHaveBeenCalledWith({ collection: "categories", id: 5, overrideAccess: true });
  });

  it("weigert een aanvraag zonder id", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: {} }));

    expect(response.status).toBe(400);
    expect(mockCount).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
