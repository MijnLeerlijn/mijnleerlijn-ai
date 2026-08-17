import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { haalBerichtVoorAntwoord, verstuurAntwoord } from "@/lib/google-gmail/api";
import { haalSignaalVoorAntwoord, markeerBeantwoord } from "@/lib/werk/mail-signalen";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/google-calendar/connection", () => ({ verkrijgGeldigeToegang: vi.fn() }));
vi.mock("@/lib/google-gmail/api", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/google-gmail/api")>();
  return { ...echt, haalBerichtVoorAntwoord: vi.fn(), verstuurAntwoord: vi.fn() };
});
vi.mock("@/lib/werk/mail-signalen", () => ({ haalSignaalVoorAntwoord: vi.fn(), markeerBeantwoord: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockToegang = vi.mocked(verkrijgGeldigeToegang);
const mockBericht = vi.mocked(haalBerichtVoorAntwoord);
const mockVerstuur = vi.mocked(verstuurAntwoord);
const mockSignaal = vi.mocked(haalSignaalVoorAntwoord);
const mockMarkeer = vi.mocked(markeerBeantwoord);

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];

function maakRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/werk/mail/versturen", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ORIGINEEL = {
  gmailMessageId: "msg-1",
  gmailThreadId: "thread-1",
  van: "Jan Jansen <jan@school.nl>",
  onderwerp: "Vraag",
  ontvangenOp: "2026-08-17T09:00:00.000Z",
  bodyText: "Kunnen we afspreken?",
  messageIdHeader: "<origineel@mail.gmail.com>",
  referencesHeader: "",
};

beforeEach(() => {
  mockVerify.mockReset();
  mockToegang.mockReset().mockResolvedValue({ accessToken: "token", connectionId: 1, scopes: GMAIL_SCOPES });
  mockBericht.mockReset().mockResolvedValue(ORIGINEEL);
  mockVerstuur.mockReset().mockResolvedValue({ gmailMessageId: "verzonden-1" });
  mockSignaal.mockReset().mockResolvedValue({ gmailMessageId: "msg-1", gmailThreadId: "thread-1", schoolId: null });
  mockMarkeer.mockReset().mockResolvedValue(true);
});

describe("POST /api/werk/mail/versturen", () => {
  it("weigert zonder geldige sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest({ signaalId: 5, bodyText: "Prima." }));
    expect(response.status).toBe(403);
    expect(mockVerstuur).not.toHaveBeenCalled();
  });

  it("weigert een ontbrekend signaalId of lege bodyText met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const zonderSignaal = await POST(maakRequest({ bodyText: "Prima." }));
    expect(zonderSignaal.status).toBe(400);

    const legeTekst = await POST(maakRequest({ signaalId: 5, bodyText: "   " }));
    expect(legeTekst.status).toBe(400);
  });

  it("levert 404 wanneer het signaal niet (van deze gebruiker) is — geen Gmail-aanroep", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockSignaal.mockResolvedValue(null);

    const response = await POST(maakRequest({ signaalId: 999, bodyText: "Prima." }));
    expect(response.status).toBe(404);
    expect(mockVerstuur).not.toHaveBeenCalled();
  });

  it("levert 409 zonder de gmail.send-scope", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "token", connectionId: 1, scopes: ["https://www.googleapis.com/auth/calendar.readonly"] });

    const response = await POST(maakRequest({ signaalId: 5, bodyText: "Prima." }));
    expect(response.status).toBe(409);
    expect(mockVerstuur).not.toHaveBeenCalled();
  });

  it("haalt afzender/onderwerp/threading-headers OPNIEUW gezaghebbend op — vertrouwt de client alleen voor de berichttekst", async () => {
    mockVerify.mockResolvedValue({ user: { id: 3, role: "editor" }, cookieAanwezig: true });

    await POST(maakRequest({ signaalId: 5, bodyText: "Mijn bewerkte antwoord." }));

    expect(mockBericht).toHaveBeenCalledWith("token", "msg-1");
    expect(mockVerstuur).toHaveBeenCalledWith("token", {
      oorspronkelijkeAfzender: "Jan Jansen <jan@school.nl>",
      onderwerp: "Vraag",
      bodyText: "Mijn bewerkte antwoord.",
      gmailThreadId: "thread-1",
      inReplyToMessageId: "<origineel@mail.gmail.com>",
      referencesHeader: "",
    });
  });

  it("markeert het signaal als beantwoord na een geslaagd versturen", async () => {
    mockVerify.mockResolvedValue({ user: { id: 3, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ signaalId: 5, bodyText: "Prima." }));

    expect(response.status).toBe(200);
    expect(mockMarkeer).toHaveBeenCalledWith(expect.anything(), 3, 5);
  });

  it("markeert NIET als beantwoord wanneer het versturen zelf faalt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 3, role: "editor" }, cookieAanwezig: true });
    mockVerstuur.mockRejectedValue(new Error("Gmail 403"));

    const response = await POST(maakRequest({ signaalId: 5, bodyText: "Prima." }));

    expect(response.status).toBe(500);
    expect(mockMarkeer).not.toHaveBeenCalled();
  });

  it("geeft een generieke 500-fout terug, nooit ruwe details", async () => {
    mockVerify.mockResolvedValue({ user: { id: 4, role: "editor" }, cookieAanwezig: true });
    mockVerstuur.mockRejectedValue(new Error("geheime-token-details mogen hier niet in staan"));

    const response = await POST(maakRequest({ signaalId: 5, bodyText: "Prima." }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("geheime-token-details");
  });

  it("beperkt tot 10 aanvragen per minuut per gebruiker (429 daarna)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 299, role: "editor" }, cookieAanwezig: true });
    mockSignaal.mockResolvedValue(null); // elke aanvraag stopt vroeg (404) — telt evengoed mee voor de limiter

    for (let i = 0; i < 10; i++) {
      const response = await POST(maakRequest({ signaalId: 5, bodyText: "Prima." }));
      expect(response.status).toBe(404);
    }

    const elfde = await POST(maakRequest({ signaalId: 5, bodyText: "Prima." }));
    expect(elfde.status).toBe(429);
  });
});
