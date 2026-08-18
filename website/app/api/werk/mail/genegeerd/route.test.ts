import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { haalGenegeerdeMails } from "@/lib/werk/mail-signalen";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/google-calendar/connection", () => ({ verkrijgGeldigeToegang: vi.fn() }));
vi.mock("@/lib/werk/mail-signalen", () => ({ haalGenegeerdeMails: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockToegang = vi.mocked(verkrijgGeldigeToegang);
const mockGenegeerd = vi.mocked(haalGenegeerdeMails);

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];

function maakRequest(cookie = "geldig") {
  return new NextRequest("http://localhost:3000/api/werk/mail/genegeerd", { headers: { Cookie: `payload-token=${cookie}` } });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockToegang.mockReset();
  mockGenegeerd.mockReset().mockResolvedValue([]);
});

// Transparantieproductiecorrectie (2026-08-19) — "Bekijk genegeerde mails":
// een apart, lui-geladen endpoint (nooit onderdeel van de gewone
// dashboardlezing) — Mijn Dag blijft geen volledige inbox (opdrachtseis).
describe("GET /api/werk/mail/genegeerd", () => {
  it("weigert zonder geldige sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockGenegeerd).not.toHaveBeenCalled();
  });

  it("levert een lege lijst zonder actieve Gmail-koppeling — geen foutstatus", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue(null);

    const response = await GET(maakRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ genegeerdeMails: [] });
    expect(mockGenegeerd).not.toHaveBeenCalled();
  });

  it("haalt genegeerde mails op, gescoped op de eigen gebruiker", async () => {
    mockVerify.mockResolvedValue({ user: { id: 42, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "token-abc", connectionId: 1, scopes: GMAIL_SCOPES });
    mockGenegeerd.mockResolvedValue([
      { signaalId: 1, gmailMessageId: "msg-1", gmailThreadId: "thread-1", van: "nieuws@school.nl", onderwerp: "Nieuwsbrief", reden: "Nieuwsbrief, geen actie nodig." },
    ]);

    const response = await GET(maakRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.genegeerdeMails).toHaveLength(1);
    expect(mockGenegeerd).toHaveBeenCalledWith(expect.anything(), 42, "token-abc");
  });

  it("geeft een generieke 500-foutmelding terug wanneer het ophalen mislukt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "geheim-xyz", connectionId: 1, scopes: GMAIL_SCOPES });
    mockGenegeerd.mockRejectedValue(new Error("interne details met geheim-xyz erin"));

    const response = await GET(maakRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("geheim-xyz");
  });
});
