import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { stelVraagOverVoorstel } from "@/lib/sales/proposal-chat";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/sales/proposal-chat", () => ({ stelVraagOverVoorstel: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockChat = vi.mocked(stelVraagOverVoorstel);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/sales/proposals/50/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}) },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockChat.mockReset();
});

describe("POST /api/sales/proposals/[id]/chat", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: { vraag: "test" } }), { params: Promise.resolve({ id: "50" }) });

    expect(response.status).toBe(403);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("weigert een lege vraag met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { vraag: "   " } }), { params: Promise.resolve({ id: "50" }) });

    expect(response.status).toBe(400);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("geeft 404 wanneer het voorstel niet bestaat — geen ander record lekken via een generieke fout", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockChat.mockRejectedValue(new Error("Voorstel niet gevonden."));

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { vraag: "vraag" } }), { params: Promise.resolve({ id: "999" }) });

    expect(response.status).toBe(404);
  });

  it("geeft het antwoord terug en geeft de geschiedenis door (max 30 berichten)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockChat.mockResolvedValue({ antwoord: "Testantwoord." });
    const geschiedenis = Array.from({ length: 40 }, (_, i) => ({ role: "user" as const, content: `bericht ${i}` }));

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { vraag: "En nu?", geschiedenis } }), { params: Promise.resolve({ id: "50" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ antwoord: "Testantwoord." });
    const doorgegevenGeschiedenis = mockChat.mock.calls[0]![3] as unknown[];
    expect(doorgegevenGeschiedenis).toHaveLength(30);
  });
});
