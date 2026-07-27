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

function maakRequest(cookie?: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/verbetercentrum/stats", {
    headers: cookie ? { Cookie: `payload-token=${cookie}` } : {},
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockFind.mockReset();
});

describe("GET /api/verbetercentrum/stats", () => {
  it("weigert een aanvraag zonder adminsessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await GET(maakRequest("geldig"));

    expect(response.status).toBe(403);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("beperkt de query tot publieke helpdeskgesprekken van de laatste 90 dagen", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFind.mockResolvedValue({ docs: [] });

    await GET(maakRequest("geldig"));

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "assistant-conversations",
        where: expect.objectContaining({
          and: expect.arrayContaining([{ source: { equals: "helpdesk" } }]),
        }),
      })
    );
  });

  it("geeft berekende statistieken terug op basis van de gevonden gesprekken", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFind.mockResolvedValue({
      docs: [
        {
          id: 1,
          question: "Hoe koppel ik doelen?",
          hasAnswer: true,
          confidence: 90,
          feedbackRating: "nuttig",
          contactFormSubmitted: false,
          intentieType: "opgelost",
          kennisbasisOnderwerp: null,
          gebruikteSynoniem: null,
          steps: [],
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const response = await GET(maakRequest("geldig"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totaal).toBe(1);
    expect(data.percentageDirectOpgelost).toBe(100);
  });

  it("geeft een 500 terug als het ophalen mislukt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFind.mockRejectedValue(new Error("database niet bereikbaar"));

    const response = await GET(maakRequest("geldig"));

    expect(response.status).toBe(500);
  });
});
