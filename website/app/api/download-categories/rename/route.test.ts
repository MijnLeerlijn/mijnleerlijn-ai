import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";

const mockUpdate = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    update: (...args: unknown[]) => mockUpdate(...args),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/download-categories/rename", {
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
  mockUpdate.mockReset();
});

describe("POST /api/download-categories/rename", () => {
  it("weigert een aanvraag zonder ingelogde admin/editor met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: { id: 1, title: "Nieuw" } }));

    expect(response.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("staat een redacteur toe een categorie te hernoemen", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockUpdate.mockResolvedValue({});

    const response = await POST(maakRequest({ cookie: "geldig", body: { id: 5, title: "Nieuwe naam" } }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      collection: "categories",
      id: 5,
      overrideAccess: true,
      data: { title: "Nieuwe naam" },
    });
  });

  it("trimt de titel vóór opslaan", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockUpdate.mockResolvedValue({});

    await POST(maakRequest({ cookie: "geldig", body: { id: 5, title: "  Ruimte eromheen  " } }));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: "Ruimte eromheen" } })
    );
  });

  it("weigert een poging om een ander veld via deze route te wijzigen", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: { id: 5, title: "X", slug: "x" } }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("slug");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag zonder id", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: { title: "X" } }));

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("weigert een lege titel", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: { id: 5, title: "   " } }));

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
