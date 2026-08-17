import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { fetchAgendaEventById } from "@/lib/google-calendar/api";
import { genereerVoorbereidingsvoorstel } from "@/lib/werk/voorbereiding-ai";

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    findByID: vi.fn().mockResolvedValue({ id: 3, schoolName: "Springplank" }),
    find: vi.fn().mockResolvedValue({ docs: [] }),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/google-calendar/connection", () => ({ verkrijgGeldigeToegang: vi.fn() }));
vi.mock("@/lib/google-calendar/api", () => ({ fetchAgendaEventById: vi.fn() }));
vi.mock("@/lib/werk/voorbereiding-ai", () => ({ genereerVoorbereidingsvoorstel: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockToegang = vi.mocked(verkrijgGeldigeToegang);
const mockEvent = vi.mocked(fetchAgendaEventById);
const mockVoorstel = vi.mocked(genereerVoorbereidingsvoorstel);

function maakRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/werk/voorbereiding/ai-voorstel", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VOORSTEL = {
  doelVanDeSessie: "Kennismaken",
  relevanteOnderwerpen: ["A"],
  watVoorafKlaarzetten: ["B"],
  mogelijkeVragen: ["C?"],
  concreteVoorbereidingstaak: "D",
};

beforeEach(() => {
  mockVerify.mockReset();
  mockToegang.mockReset();
  mockEvent.mockReset();
  mockVoorstel.mockReset().mockResolvedValue(VOORSTEL);
});

describe("POST /api/werk/voorbereiding/ai-voorstel", () => {
  it("weigert zonder geldige sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest({ eventId: "evt1" }));
    expect(response.status).toBe(403);
    expect(mockVoorstel).not.toHaveBeenCalled();
  });

  it("weigert een ontbrekend eventId met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({}));
    expect(response.status).toBe(400);
  });

  it("levert 409 zonder actieve Google-koppeling", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue(null);
    const response = await POST(maakRequest({ eventId: "evt1" }));
    expect(response.status).toBe(409);
  });

  it("levert 404 wanneer het event niet meer bestaat", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "token", connectionId: 1 });
    mockEvent.mockResolvedValue(null);
    const response = await POST(maakRequest({ eventId: "evt1" }));
    expect(response.status).toBe(404);
  });

  it("genereert een voorstel en geeft het automatisch herkende schoolId terug", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "token", connectionId: 1 });
    mockEvent.mockResolvedValue({
      id: "evt1",
      titel: "Training bij Springplank",
      beschrijving: null,
      datum: "2026-08-19",
      tijd: "09:00",
      eindTijd: "10:00",
      volledigeDag: false,
    });

    const response = await POST(maakRequest({ eventId: "evt1" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.voorstel).toEqual(VOORSTEL);
    expect(mockVoorstel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventTitel: "Training bij Springplank" })
    );
  });

  it("beperkt tot 5 aanvragen per minuut per gebruiker (429 daarna)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 99, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue(null); // elke aanvraag stopt vroeg (409) — telt evengoed mee voor de limiter

    for (let i = 0; i < 5; i++) {
      const response = await POST(maakRequest({ eventId: "evt1" }));
      expect(response.status).toBe(409);
    }

    const zesde = await POST(maakRequest({ eventId: "evt1" }));
    expect(zesde.status).toBe(429);
  });

  it("geeft een generieke 500-fout terug, nooit ruwe details", async () => {
    mockVerify.mockResolvedValue({ user: { id: 2, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "geheim-abc", connectionId: 1 });
    mockEvent.mockRejectedValue(new Error("geheim-abc mag hier niet in staan"));

    const response = await POST(maakRequest({ eventId: "evt1" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("geheim-abc");
  });
});
