import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
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
  return new NextRequest("http://localhost:3000/api/werk/mail", { headers: { Cookie: `payload-token=${cookie}` } });
}

const LEEG_RESULTAAT = { signalen: [], bekeken: 0, actieNodig: 0, genegeerd: 0, algVerwerkt: 0 };

beforeEach(() => {
  mockVerify.mockReset();
  mockToegang.mockReset();
  mockSignalen.mockReset().mockResolvedValue(LEEG_RESULTAAT);
});

describe("GET /api/werk/mail", () => {
  it("weigert zonder geldige sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockToegang).not.toHaveBeenCalled();
  });

  it("levert connected: false zonder een koppeling — geen foutstatus", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue(null);

    const response = await GET(maakRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ connected: false, signalen: [] });
    expect(mockSignalen).not.toHaveBeenCalled();
  });

  it("levert connected: false wanneer de koppeling WEL bestaat maar zonder Gmail-scope (bv. uitsluitend Agenda gekoppeld)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "token", connectionId: 1, scopes: ["https://www.googleapis.com/auth/calendar.readonly"] });

    const response = await GET(maakRequest());
    const data = await response.json();

    expect(data).toEqual({ connected: false, signalen: [] });
    expect(mockSignalen).not.toHaveBeenCalled();
  });

  it("haalt signalen op wanneer de Gmail-scope aanwezig is, gescoped op de eigen gebruiker", async () => {
    mockVerify.mockResolvedValue({ user: { id: 42, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "token-abc", connectionId: 1, scopes: GMAIL_SCOPES });
    mockSignalen.mockResolvedValue({
      signalen: [
        {
          gmailMessageId: "msg-1",
          gmailThreadId: "thread-1",
          van: "jan@school.nl",
          onderwerp: "Vraag",
          ontvangenOp: "2026-08-17T09:00:00.000Z",
          reden: "Stelt een vraag.",
          categorie: "antwoord_nodig",
          school: null,
          signaalId: 5,
        },
      ],
      bekeken: 3,
      actieNodig: 1,
      genegeerd: 2,
      algVerwerkt: 0,
    });

    const response = await GET(maakRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.connected).toBe(true);
    expect(data.signalen).toHaveLength(1);
    expect(data.bekeken).toBe(3);
    expect(mockSignalen).toHaveBeenCalledWith(expect.anything(), 42, "token-abc", expect.anything());
  });

  it("geeft een generieke 500-foutmelding terug wanneer het ophalen mislukt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "geheim-xyz", connectionId: 1, scopes: GMAIL_SCOPES });
    mockSignalen.mockRejectedValue(new Error("interne details met geheim-xyz erin"));

    const response = await GET(maakRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("geheim-xyz");
  });
});
