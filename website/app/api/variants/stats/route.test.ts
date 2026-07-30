import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";

const mockFind = vi.fn();
const mockCount = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    find: (...args: unknown[]) => mockFind(...args),
    count: (...args: unknown[]) => mockCount(...args),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);

function maakRequest(cookie?: string) {
  return new NextRequest("http://localhost:3000/api/variants/stats", {
    headers: { ...(cookie ? { Cookie: `payload-token=${cookie}` } : {}) },
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockFind.mockReset();
  mockCount.mockReset();
});

describe("GET /api/variants/stats", () => {
  it("weigert zonder ingelogde admin met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await GET(maakRequest());

    expect(response.status).toBe(403);
  });

  it("geeft per variant het aantal kennisbronnen, laatste indexatie en laatste gesprek terug", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFind
      .mockResolvedValueOnce({ docs: [{ id: 1 }, { id: 2 }] }) // variants zelf
      .mockResolvedValueOnce({ docs: [{ embeddedAt: "2026-07-20T00:00:00.000Z" }] }) // variant 1: laatste kennisbron
      .mockResolvedValueOnce({ docs: [{ createdAt: "2026-07-25T00:00:00.000Z" }] }) // variant 1: laatste gesprek
      .mockResolvedValueOnce({ docs: [] }) // variant 2: laatste kennisbron
      .mockResolvedValueOnce({ docs: [] }); // variant 2: laatste gesprek
    mockCount.mockResolvedValueOnce({ totalDocs: 4 }).mockResolvedValueOnce({ totalDocs: 0 });

    const response = await GET(maakRequest("geldig"));
    const data = await response.json();

    expect(data["1"]).toEqual({
      aantalKennisbronnen: 4,
      laatsteIndexatie: "2026-07-20T00:00:00.000Z",
      laatsteGesprek: "2026-07-25T00:00:00.000Z",
    });
    expect(data["2"]).toEqual({ aantalKennisbronnen: 0, laatsteIndexatie: null, laatsteGesprek: null });
  });
});
