import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { maakVoorstelUitOverleg } from "@/lib/sales/proposal-chat";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/sales/proposal-chat", () => ({ maakVoorstelUitOverleg: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockMaakVoorstel = vi.mocked(maakVoorstelUitOverleg);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/sales/proposals/50/from-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}) },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockMaakVoorstel.mockReset();
});

describe("POST /api/sales/proposals/[id]/from-chat", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: { geschiedenis: [{ role: "user", content: "x" }] } }), { params: Promise.resolve({ id: "50" }) });

    expect(response.status).toBe(403);
    expect(mockMaakVoorstel).not.toHaveBeenCalled();
  });

  it("weigert een lege geschiedenis met 400 — geen voorstel zonder overleg", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { geschiedenis: [] } }), { params: Promise.resolve({ id: "50" }) });

    expect(response.status).toBe(400);
    expect(mockMaakVoorstel).not.toHaveBeenCalled();
  });

  it("maakt het nieuwe voorstel en geeft het ID terug", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockMaakVoorstel.mockResolvedValue({ nieuwProposalId: 123 });

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { geschiedenis: [{ role: "user", content: "Ik wil liever mailen." }] } }), {
      params: Promise.resolve({ id: "50" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ nieuwProposalId: 123 });
    expect(mockMaakVoorstel).toHaveBeenCalledWith(expect.anything(), 50, [{ role: "user", content: "Ik wil liever mailen." }], 7);
  });

  it("geeft een nette 500 wanneer het voorstel al is afgehandeld", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockMaakVoorstel.mockRejectedValue(new Error("Dit voorstel is al afgehandeld."));

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { geschiedenis: [{ role: "user", content: "x" }] } }), { params: Promise.resolve({ id: "50" }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Dit voorstel is al afgehandeld.");
  });

  it("geeft 404 wanneer het voorstel niet bestaat — geen ander record lekken via een generieke fout", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockMaakVoorstel.mockRejectedValue(new Error("Voorstel niet gevonden."));

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { geschiedenis: [{ role: "user", content: "x" }] } }), { params: Promise.resolve({ id: "50" }) });

    expect(response.status).toBe(404);
  });
});
