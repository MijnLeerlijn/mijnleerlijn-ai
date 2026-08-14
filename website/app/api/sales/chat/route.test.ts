import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { stelVraagOverAlleScholen } from "@/lib/sales/aggregate-chat";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/sales/aggregate-chat", () => ({ stelVraagOverAlleScholen: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockChat = vi.mocked(stelVraagOverAlleScholen);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/sales/chat", {
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
  mockChat.mockReset();
});

describe("POST /api/sales/chat", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: { vraag: "test" } }));

    expect(response.status).toBe(403);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("weigert een lege vraag met 400, zonder de AI aan te roepen", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { vraag: "   " } }));

    expect(response.status).toBe(400);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("geeft het antwoord terug voor een geldige vraag", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockChat.mockResolvedValue({ antwoord: "Testantwoord.", scholenGebruikt: 5, scholenTotaal: 5 });

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { vraag: "Welke scholen hebben geen vervolgactie?" } }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ antwoord: "Testantwoord.", scholenGebruikt: 5, scholenTotaal: 5 });
    expect(mockChat).toHaveBeenCalledWith(expect.anything(), "Welke scholen hebben geen vervolgactie?");
  });
});
