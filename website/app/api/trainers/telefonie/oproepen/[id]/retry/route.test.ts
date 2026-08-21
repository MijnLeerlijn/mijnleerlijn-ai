import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { verwerkTelefonieHandmatigeRetry } from "@/lib/trainers/telefonie/gesprek";
import { telnyxProvider } from "@/lib/trainers/telefonie/telnyx-provider";

// Admin-getriggerde "probeer nu opnieuw"-knop (2026-08-25) — dekt uitsluitend
// de HTTP-laag van POST .../oproepen/[id]/retry. Zelfde
// verifyAdminSessionCookie-mockpatroon als bv.
// app/api/sales/proposals/[id]/reanalyze/route.test.ts (de al bewezen reden
// staat in de route zelf/app/api/gmail/sync/route.ts: payload.auth() se
// Origin-afhankelijke cookie-extractie verwerpt een fetch()-POST vanuit een
// adminknop stilzwijgend). De daadwerkelijke retry-/claimlogica zelf heeft
// al eigen dekking in gesprek.test.ts (describe("verwerkTelefonieHandmatigeRetry")).
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/telefonie/gesprek", () => ({ verwerkTelefonieHandmatigeRetry: vi.fn() }));
vi.mock("@/lib/trainers/telefonie/telnyx-provider", () => ({ telnyxProvider: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockRetry = vi.mocked(verwerkTelefonieHandmatigeRetry);
const mockTelnyxProvider = vi.mocked(telnyxProvider);

function maakRequest() {
  return new NextRequest("http://localhost:3000/api/trainers/telefonie/oproepen/6/retry", { method: "POST" });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockRetry.mockReset();
  mockTelnyxProvider.mockReset().mockReturnValue({} as ReturnType<typeof telnyxProvider>);
});

describe("POST /api/trainers/telefonie/oproepen/[id]/retry", () => {
  it("weigert een aanvraag zonder geldige beheerderssessie met 403, geen retry uitgevoerd", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest(), { params: Promise.resolve({ id: "6" }) });

    expect(response.status).toBe(403);
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it("weigert een ingelogde editor (geen admin) met 403 — alleen beheerders mogen een retry starten", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest(), { params: Promise.resolve({ id: "6" }) });

    expect(response.status).toBe(403);
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it("geeft 400 voor een ongeldig oproep-ID, geen retry uitgevoerd", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest(), { params: Promise.resolve({ id: "abc" }) });

    expect(response.status).toBe(400);
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it("geldige beheerderssessie + geldig ID -> roept verwerkTelefonieHandmatigeRetry aan met het juiste oproep-ID en geeft de uitkomst terug", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRetry.mockResolvedValue("geclaimd");

    const response = await POST(maakRequest(), { params: Promise.resolve({ id: "6" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ uitkomst: "geclaimd" });
    expect(mockRetry).toHaveBeenCalledWith(expect.anything(), expect.anything(), 6);
  });

  it("geeft 'nog_niet_zover'/'niet_van_toepassing' ongewijzigd door — geen fout, gewoon de server-uitkomst", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRetry.mockResolvedValue("nog_niet_zover");

    const response = await POST(maakRequest(), { params: Promise.resolve({ id: "6" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ uitkomst: "nog_niet_zover" });
  });

  it("een onverwachte fout in verwerkTelefonieHandmatigeRetry geeft 500 met een generieke foutmelding (geen ruwe interne inhoud naar de aanroeper)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRetry.mockRejectedValue(new Error("database onbereikbaar"));

    const response = await POST(maakRequest(), { params: Promise.resolve({ id: "6" }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("database onbereikbaar");
  });
});
