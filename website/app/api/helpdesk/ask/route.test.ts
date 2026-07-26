import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { processPublicQuestion } from "@/lib/assistant/process-public-question";

vi.mock("payload", () => ({
  getPayload: vi
    .fn()
    .mockResolvedValue({ secret: "test", logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/assistant/process-public-question", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/assistant/process-public-question")>();
  return { ...echt, processPublicQuestion: vi.fn() };
});

const mockProcess = vi.mocked(processPublicQuestion);

function maakRequest(opties: { body?: unknown; ip?: string } = {}) {
  return new NextRequest("http://localhost:3000/api/helpdesk/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opties.ip ? { "x-real-ip": opties.ip } : {}),
    },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

beforeEach(() => {
  mockProcess.mockReset();
});

// Geen sessiecontrole te testen (bewust, zie het commentaar in route.ts) —
// dat is precies het punt van deze publieke route. Tests bevestigen daarom
// vooral validatie, foutafhandeling en dat de pijplijn zonder userId werkt.
describe("POST /api/helpdesk/ask", () => {
  it("weigert een aanvraag zonder question met 400, zonder de pijplijn aan te roepen", async () => {
    const response = await POST(maakRequest({ body: {} }));

    expect(response.status).toBe(400);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("weigert een te lange vraag met 400", async () => {
    const response = await POST(maakRequest({ body: { question: "x".repeat(1001) } }));

    expect(response.status).toBe(400);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("beantwoordt een geldige, anonieme vraag zonder enige sessiecontrole", async () => {
    mockProcess.mockResolvedValue({
      type: "answered",
      conversationId: 1,
      hasAnswer: true,
      answer: "Antwoord.",
      manuals: [],
    });

    const response = await POST(maakRequest({ body: { question: "Hoe maak ik een profiel aan?" } }));

    expect(response.status).toBe(200);
    expect(mockProcess).toHaveBeenCalledWith(expect.anything(), { question: "Hoe maak ik een profiel aan?" });
    const data = await response.json();
    expect(data.answer).toBe("Antwoord.");
  });

  it("geeft een 502 terug wanneer de RAG-pijplijn mislukt", async () => {
    mockProcess.mockResolvedValue({ type: "failed", foutmelding: "OpenAI: server error" });

    const response = await POST(maakRequest({ body: { question: "vraag" } }));

    expect(response.status).toBe(502);
  });

  it("blokkeert na te veel pogingen van hetzelfde IP-adres (rate limiting)", async () => {
    mockProcess.mockResolvedValue({
      type: "answered",
      conversationId: 1,
      hasAnswer: true,
      answer: "Antwoord.",
      manuals: [],
    });

    const ip = "203.0.113.10";
    for (let i = 0; i < 20; i += 1) {
      const ok = await POST(maakRequest({ body: { question: `vraag ${i}` }, ip }));
      expect(ok.status).toBe(200);
    }

    const geblokkeerd = await POST(maakRequest({ body: { question: "één te veel" }, ip }));
    expect(geblokkeerd.status).toBe(429);
  });
});
