import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";

const mockFind = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    find: (...args: unknown[]) => mockFind(...args),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);

function maakRequest(cookie?: string) {
  return new NextRequest("http://localhost:3000/api/assistant/conversations", {
    headers: cookie ? { Cookie: `payload-token=${cookie}` } : {},
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockFind.mockReset();
});

describe("GET /api/assistant/conversations", () => {
  it("weigert een aanvraag zonder sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await GET(maakRequest());

    expect(response.status).toBe(403);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("geeft alleen de gesprekken van de ingelogde gebruiker terug", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockFind.mockResolvedValue({
      docs: [
        {
          id: 1,
          question: "Hoe reset ik mijn wachtwoord?",
          hasAnswer: true,
          confidence: 90,
          createdAt: "2026-07-24T00:00:00Z",
        },
      ],
    });

    const response = await GET(maakRequest("geldig"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.conversations).toHaveLength(1);
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ where: { user: { equals: 7 } } }));
  });
});
