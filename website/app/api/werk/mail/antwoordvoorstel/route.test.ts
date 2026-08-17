import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalSignaalVoorAntwoord } from "@/lib/werk/mail-signalen";
import { genereerAntwoordvoorstel } from "@/lib/werk/mail-reply";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/werk/mail-signalen", () => ({ haalSignaalVoorAntwoord: vi.fn() }));
vi.mock("@/lib/werk/mail-reply", () => ({ genereerAntwoordvoorstel: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockSignaal = vi.mocked(haalSignaalVoorAntwoord);
const mockVoorstel = vi.mocked(genereerAntwoordvoorstel);

function maakRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/werk/mail/antwoordvoorstel", {
    method: "POST",
    headers: { Cookie: "payload-token=geldig", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VOORSTEL = { conceptTekst: "Concept.", aan: "jan@school.nl", onderwerp: "Re: Vraag", gmailThreadId: "thread-1", messageIdHeader: "<x@y>", referencesHeader: "" };

beforeEach(() => {
  mockVerify.mockReset();
  mockSignaal.mockReset().mockResolvedValue({ gmailMessageId: "msg-1", gmailThreadId: "thread-1", schoolId: null });
  mockVoorstel.mockReset().mockResolvedValue(VOORSTEL);
});

describe("POST /api/werk/mail/antwoordvoorstel", () => {
  it("weigert zonder geldige sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest({ signaalId: 5, vandaag: "2026-08-17" }));
    expect(response.status).toBe(403);
    expect(mockVoorstel).not.toHaveBeenCalled();
  });

  it("weigert een ontbrekend signaalId of ongeldige datum met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const zonderSignaal = await POST(maakRequest({ vandaag: "2026-08-17" }));
    expect(zonderSignaal.status).toBe(400);

    const ongeldigeDatum = await POST(maakRequest({ signaalId: 5, vandaag: "17 augustus" }));
    expect(ongeldigeDatum.status).toBe(400);
  });

  it("levert 404 wanneer het signaal niet (van deze gebruiker) is", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockSignaal.mockResolvedValue(null);

    const response = await POST(maakRequest({ signaalId: 999, vandaag: "2026-08-17" }));
    expect(response.status).toBe(404);
    expect(mockVoorstel).not.toHaveBeenCalled();
  });

  it("genereert een antwoordvoorstel op basis van het gescoped-opgehaalde signaal", async () => {
    mockVerify.mockResolvedValue({ user: { id: 3, role: "editor" }, cookieAanwezig: true });
    mockSignaal.mockResolvedValue({ gmailMessageId: "msg-1", gmailThreadId: "thread-1", schoolId: 7 });

    const response = await POST(maakRequest({ signaalId: 5, vandaag: "2026-08-17" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.voorstel).toEqual(VOORSTEL);
    expect(mockSignaal).toHaveBeenCalledWith(expect.anything(), 3, 5);
    expect(mockVoorstel).toHaveBeenCalledWith(expect.anything(), { eigenaarId: 3, gmailMessageId: "msg-1", schoolId: 7, vandaag: "2026-08-17" });
  });

  it("beperkt tot 5 aanvragen per minuut per gebruiker (429 daarna) — expliciete-klik-only, dure AI-aanroep die de volledige mail leest", async () => {
    mockVerify.mockResolvedValue({ user: { id: 199, role: "editor" }, cookieAanwezig: true });
    mockSignaal.mockResolvedValue(null); // elke aanvraag stopt vroeg (404) — telt evengoed mee voor de limiter

    for (let i = 0; i < 5; i++) {
      const response = await POST(maakRequest({ signaalId: 5, vandaag: "2026-08-17" }));
      expect(response.status).toBe(404);
    }

    const zesde = await POST(maakRequest({ signaalId: 5, vandaag: "2026-08-17" }));
    expect(zesde.status).toBe(429);
  });

  it("geeft een generieke 500-fout terug, nooit ruwe details", async () => {
    mockVerify.mockResolvedValue({ user: { id: 4, role: "editor" }, cookieAanwezig: true });
    mockVoorstel.mockRejectedValue(new Error("geheime-token-details mogen hier niet in staan"));

    const response = await POST(maakRequest({ signaalId: 5, vandaag: "2026-08-17" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("geheime-token-details");
  });
});
