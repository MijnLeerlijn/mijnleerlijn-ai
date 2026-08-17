import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { stelMijnWerkVraag } from "@/lib/werk/mijn-werk-chat";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/werk/mijn-werk-chat", () => ({ stelMijnWerkVraag: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockChat = vi.mocked(stelMijnWerkVraag);

function maakRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/werk/chat", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockChat.mockReset().mockResolvedValue({ antwoord: "AI-antwoord", categorie: "planning" });
});

describe("POST /api/werk/chat", () => {
  it("weigert zonder geldige sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest({ vraag: "Wat heb ik morgen?", vandaag: "2026-08-17" }));
    expect(response.status).toBe(403);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("weigert een lege vraag met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ vraag: "  ", vandaag: "2026-08-17" }));
    expect(response.status).toBe(400);
  });

  it("weigert een te lange vraag met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ vraag: "x".repeat(501), vandaag: "2026-08-17" }));
    expect(response.status).toBe(400);
  });

  it("weigert een ontbrekende/ongeldige datum met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    expect((await POST(maakRequest({ vraag: "Wat heb ik morgen?" }))).status).toBe(400);
    expect((await POST(maakRequest({ vraag: "Wat heb ik morgen?", vandaag: "morgen" }))).status).toBe(400);
  });

  it("geeft het antwoord + categorie terug bij een geldige aanvraag", async () => {
    mockVerify.mockResolvedValue({ user: { id: 3, role: "editor" }, cookieAanwezig: true });
    const response = await POST(maakRequest({ vraag: "Wat heb ik morgen?", vandaag: "2026-08-17" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ antwoord: "AI-antwoord", categorie: "planning" });
    expect(mockChat).toHaveBeenCalledWith(expect.anything(), 3, "Wat heb ik morgen?", "2026-08-17");
  });

  it("beperkt tot 20 aanvragen per 10 minuten per gebruiker", async () => {
    mockVerify.mockResolvedValue({ user: { id: 77, role: "editor" }, cookieAanwezig: true });

    for (let i = 0; i < 20; i++) {
      const response = await POST(maakRequest({ vraag: "Wat heb ik morgen?", vandaag: "2026-08-17" }));
      expect(response.status).toBe(200);
    }

    const eenentwintigste = await POST(maakRequest({ vraag: "Wat heb ik morgen?", vandaag: "2026-08-17" }));
    expect(eenentwintigste.status).toBe(429);
  });

  it("geeft een generieke 500-fout terug, nooit ruwe details", async () => {
    mockVerify.mockResolvedValue({ user: { id: 4, role: "editor" }, cookieAanwezig: true });
    mockChat.mockRejectedValue(new Error("interne AI-foutdetails"));

    const response = await POST(maakRequest({ vraag: "Wat heb ik morgen?", vandaag: "2026-08-17" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("interne AI-foutdetails");
  });
});
