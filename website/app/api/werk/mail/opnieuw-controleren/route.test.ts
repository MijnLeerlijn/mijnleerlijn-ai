import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { haalMailSignalen } from "@/lib/werk/mail-signalen";

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({
    find: vi.fn().mockResolvedValue({ docs: [] }),
  }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/google-calendar/connection", () => ({ verkrijgGeldigeToegang: vi.fn() }));
vi.mock("@/lib/werk/mail-signalen", () => ({ haalMailSignalen: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockToegang = vi.mocked(verkrijgGeldigeToegang);
const mockSignalen = vi.mocked(haalMailSignalen);

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];

function maakRequest(cookie = "geldig") {
  return new NextRequest("http://localhost:3000/api/werk/mail/opnieuw-controleren", {
    method: "POST",
    headers: { Cookie: `payload-token=${cookie}` },
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockToegang.mockReset();
  mockSignalen.mockReset().mockResolvedValue({ signalen: [], bekeken: 0, actieNodig: 0, genegeerd: 0, algVerwerkt: 0 });
});

describe("POST /api/werk/mail/opnieuw-controleren", () => {
  it("weigert zonder geldige sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest());
    expect(response.status).toBe(403);
    expect(mockSignalen).not.toHaveBeenCalled();
  });

  it("levert 409 zonder actieve Gmail-koppeling", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue(null);
    const response = await POST(maakRequest());
    expect(response.status).toBe(409);
    expect(mockSignalen).not.toHaveBeenCalled();
  });

  it("roept haalMailSignalen aan met forceerHerclassificatie: true", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "token-abc", connectionId: 1, scopes: GMAIL_SCOPES });
    mockSignalen.mockResolvedValue({ signalen: [], bekeken: 24, actieNodig: 4, genegeerd: 16, algVerwerkt: 4 });

    const response = await POST(maakRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ signalen: [], bekeken: 24, actieNodig: 4, genegeerd: 16, algVerwerkt: 4 });
    expect(mockSignalen).toHaveBeenCalledWith(expect.anything(), 7, "token-abc", expect.anything(), { forceerHerclassificatie: true });
  });

  it("beperkt tot 5 aanvragen per minuut per gebruiker (429 daarna)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 299, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue(null); // elke aanvraag stopt vroeg (409) — telt evengoed mee voor de limiter

    for (let i = 0; i < 5; i++) {
      const response = await POST(maakRequest());
      expect(response.status).toBe(409);
    }

    const zesde = await POST(maakRequest());
    expect(zesde.status).toBe(429);
  });

  it("geeft een generieke 500-fout terug, nooit ruwe details", async () => {
    mockVerify.mockResolvedValue({ user: { id: 3, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "geheim-xyz", connectionId: 1, scopes: GMAIL_SCOPES });
    mockSignalen.mockRejectedValue(new Error("interne details met geheim-xyz erin"));

    const response = await POST(maakRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("geheim-xyz");
  });
});
