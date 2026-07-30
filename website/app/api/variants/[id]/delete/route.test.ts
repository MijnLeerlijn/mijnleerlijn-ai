import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";

const mockFindByID = vi.fn();
const mockCount = vi.fn();
const mockDelete = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    findByID: (...args: unknown[]) => mockFindByID(...args),
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

function maakRequest(cookie?: string) {
  return new NextRequest("http://localhost:3000/api/variants/5/delete", {
    method: "POST",
    headers: { ...(cookie ? { Cookie: `payload-token=${cookie}` } : {}) },
  });
}

function maakParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockVerify.mockReset();
  mockFindByID.mockReset();
  mockCount.mockReset();
  mockDelete.mockReset();
});

// Multi-brand variants (2026-07-30): gecontroleerd verwijderen — nooit een
// stille cascade, altijd blokkeren bij gekoppelde content, standaardvariant
// nooit verwijderbaar.
describe("POST /api/variants/[id]/delete", () => {
  it("weigert zonder ingelogde admin met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest(), maakParams("5"));

    expect(response.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("geeft 404 als de variant niet bestaat", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue(undefined);

    const response = await POST(maakRequest("geldig"), maakParams("999"));

    expect(response.status).toBe(404);
  });

  it("blokkeert het verwijderen van de standaardvariant (mijnleerlijn), ongeacht gekoppelde content", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 1, slug: "mijnleerlijn" });

    const response = await POST(maakRequest("geldig"), maakParams("1"));

    expect(response.status).toBe(400);
    expect(mockCount).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("weigert verwijderen (409, met aantallen) wanneer er nog gekoppelde content bestaat", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 5, slug: "mijnmonti" });
    mockCount
      .mockResolvedValueOnce({ totalDocs: 3 }) // knowledge-sources
      .mockResolvedValueOnce({ totalDocs: 0 }) // kennisbasis-onderwerpen
      .mockResolvedValueOnce({ totalDocs: 2 }) // helpdesk-vragen
      .mockResolvedValueOnce({ totalDocs: 0 }) // assistant-conversations
      .mockResolvedValueOnce({ totalDocs: 0 }); // variant-overrides

    const response = await POST(maakRequest("geldig"), maakParams("5"));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.gekoppeld).toEqual({
      kennisbronnen: 3,
      helpdeskOnderwerpen: 0,
      helpdeskVragen: 2,
      gesprekken: 0,
      overrides: 0,
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("verwijdert de variant zonder gekoppelde content", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 5, slug: "mijnmonti" });
    mockCount.mockResolvedValue({ totalDocs: 0 });

    const response = await POST(maakRequest("geldig"), maakParams("5"));

    expect(response.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "variants", id: 5 })
    );
  });
});
