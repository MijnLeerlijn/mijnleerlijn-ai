import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";

const mockFindByID = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    secret: "test",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    findByID: (...args: unknown[]) => mockFindByID(...args),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);

function maakRequest(cookie?: string) {
  return new NextRequest("http://localhost:3000/api/assistant/conversations/5", {
    headers: cookie ? { Cookie: `payload-token=${cookie}` } : {},
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockFindByID.mockReset();
});

describe("GET /api/assistant/conversations/[id]", () => {
  it("weigert een aanvraag zonder sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await GET(maakRequest(), { params: Promise.resolve({ id: "5" }) });

    expect(response.status).toBe(403);
  });

  it("weigert andermans gesprek met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 5, user: 999, question: "vraag" });

    const response = await GET(maakRequest("geldig"), { params: Promise.resolve({ id: "5" }) });

    expect(response.status).toBe(403);
  });

  it("geeft het eigen gesprek volledig terug", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({
      id: 5,
      user: 1,
      question: "Hoe reset ik mijn wachtwoord?",
      hasAnswer: true,
      answer: "Antwoord.",
      reasoning: "Reden.",
      confidence: 90,
      sources: [],
      feedbackRating: "geen",
      feedbackMissing: null,
      createdAt: "2026-07-24T00:00:00Z",
    });

    const response = await GET(maakRequest("geldig"), { params: Promise.resolve({ id: "5" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.question).toBe("Hoe reset ik mijn wachtwoord?");
  });
});
