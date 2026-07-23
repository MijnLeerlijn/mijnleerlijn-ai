import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { processQuestion } from "@/lib/assistant/process-question";

vi.mock("payload", () => ({
  getPayload: vi
    .fn()
    .mockResolvedValue({ secret: "test", logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/assistant/process-question", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/assistant/process-question")>();
  return { ...echt, processQuestion: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockProcess = vi.mocked(processQuestion);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/assistant/ask", {
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
  mockProcess.mockReset();
});

describe("POST /api/assistant/ask", () => {
  it("weigert een aanvraag zonder (geldige) sessie met 403 (alleen ingelogde gebruikers)", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: { question: "Hoe reset ik mijn wachtwoord?" } }));

    expect(response.status).toBe(403);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag zonder question met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: {} }));

    expect(response.status).toBe(400);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("staat zowel editor als admin toe (elke ingelogde CMS-gebruiker)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockProcess.mockResolvedValue({
      type: "answered",
      conversationId: 1,
      answer: "Antwoord.",
      reasoning: "Reden.",
      confidence: 90,
      sources: [],
    });

    const response = await POST(
      maakRequest({ cookie: "geldig", body: { question: "Hoe maak ik een profiel aan?" } })
    );

    expect(response.status).toBe(200);
    expect(mockProcess).toHaveBeenCalledWith(expect.anything(), {
      question: "Hoe maak ik een profiel aan?",
      userId: 1,
    });
  });

  it("geeft een 502 terug wanneer de RAG-pijplijn mislukt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockProcess.mockResolvedValue({ type: "failed", foutmelding: "OpenAI: server error" });

    const response = await POST(maakRequest({ cookie: "geldig", body: { question: "vraag" } }));

    expect(response.status).toBe(502);
  });

  it("weigert een te lange vraag met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig", body: { question: "x".repeat(1001) } }));

    expect(response.status).toBe(400);
    expect(mockProcess).not.toHaveBeenCalled();
  });
});
