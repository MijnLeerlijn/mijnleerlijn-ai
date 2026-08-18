import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { haalOngelezenAantal } from "@/lib/google-gmail/api";
import { haalMailSignalen } from "@/lib/werk/mail-signalen";

const { mockPayloadFind } = vi.hoisted(() => ({ mockPayloadFind: vi.fn() }));

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({ find: mockPayloadFind }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/google-calendar/connection", () => ({ verkrijgGeldigeToegang: vi.fn() }));
// bouwKandidaatQuery e.a. blijven de ECHTE implementatie waar nodig — hier
// wordt alleen haalOngelezenAantal gemockt (live Gmail-labelaanroep, geen
// classificatie/threadstatus, dus geen overlap met bepaalOfKandidatenScanNodigIs
// hieronder).
vi.mock("@/lib/google-gmail/api", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/google-gmail/api")>();
  return { ...echt, haalOngelezenAantal: vi.fn() };
});
// bepaalOfKandidatenScanNodigIs blijft de ECHTE implementatie — deze tests
// verifiëren de daadwerkelijke throttle-uitkomst (punt 6), niet alleen dat
// er íets aangeroepen is.
vi.mock("@/lib/werk/mail-signalen", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/werk/mail-signalen")>();
  return { ...echt, haalMailSignalen: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockToegang = vi.mocked(verkrijgGeldigeToegang);
const mockSignalen = vi.mocked(haalMailSignalen);
const mockOngelezen = vi.mocked(haalOngelezenAantal);

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];

function maakRequest(cookie = "geldig") {
  return new NextRequest("http://localhost:3000/api/werk/mail", { headers: { Cookie: `payload-token=${cookie}` } });
}

const LEEG_RESULTAAT = { signalen: [], bekeken: 0, actieNodig: 0, genegeerd: 0, algVerwerkt: 0, automatischBeantwoord: 0, ongewijzigd: 0 };

beforeEach(() => {
  mockVerify.mockReset();
  mockToegang.mockReset();
  mockSignalen.mockReset().mockResolvedValue(LEEG_RESULTAAT);
  mockOngelezen.mockReset().mockResolvedValue(3);
  // Standaard: elke find() levert een lege docs-lijst — dekt zowel de
  // scholen-lookup als de "laatste scan"-lookup (dus: nog nooit gescand,
  // bepaalOfKandidatenScanNodigIs geeft dan true).
  mockPayloadFind.mockReset().mockResolvedValue({ docs: [] });
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
      automatischBeantwoord: 0,
      ongewijzigd: 0,
    });

    const response = await GET(maakRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.connected).toBe(true);
    expect(data.signalen).toHaveLength(1);
    expect(data.bekeken).toBe(3);
  });

  // Transparantieproductiecorrectie (2026-08-19) — "3 ongelezen · 1 vraagt
  // aandacht": ongelezenAantal komt LIVE van Gmail, onafhankelijk van
  // haalMailSignalen (geen classificatie, geen candidate-query).
  it("geeft ongelezenAantal mee, onafhankelijk van het aantal signalen", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "token-abc", connectionId: 1, scopes: GMAIL_SCOPES });
    mockOngelezen.mockResolvedValue(3);
    mockSignalen.mockResolvedValue({ ...LEEG_RESULTAAT, signalen: [{ gmailMessageId: "msg-1", gmailThreadId: "t-1", van: "a@b.nl", onderwerp: "x", ontvangenOp: "2026-08-17T09:00:00.000Z", reden: "r", categorie: "antwoord_nodig", school: null, signaalId: 1 }] });

    const response = await GET(maakRequest());
    const data = await response.json();

    expect(data.ongelezenAantal).toBe(3);
    expect(data.signalen).toHaveLength(1);
  });

  it("laat ongelezenAantal op null vallen wanneer de live Gmail-labelaanroep mislukt — mag de rest van het dashboard niet blokkeren", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "token-abc", connectionId: 1, scopes: GMAIL_SCOPES });
    mockOngelezen.mockRejectedValue(new Error("Gmail tijdelijk onbereikbaar"));

    const response = await GET(maakRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ongelezenAantal).toBeNull();
    expect(data.connected).toBe(true);
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

  // Productiecorrectie 2026-08-19 (punt 6) — begrensde periodieke sync:
  // een gewone dashboardlezing scant de inbox alleen opnieuw op nieuwe
  // kandidaten als de vorige scan langer dan NIEUWE_KANDIDATEN_SCAN_MINUTEN
  // geleden is; anders draait uitsluitend de (in haalMailSignalen zelf
  // altijd draaiende) threadstatus-sync.
  describe("begrensde periodieke sync (punt 6)", () => {
    beforeEach(() => {
      mockVerify.mockResolvedValue({ user: { id: 42, role: "editor" }, cookieAanwezig: true });
      mockToegang.mockResolvedValue({ accessToken: "token-abc", connectionId: 1, scopes: GMAIL_SCOPES });
    });

    it("vraagt een kandidatenscan aan wanneer er nog nooit eerder gescand is", async () => {
      mockPayloadFind.mockImplementation(async ({ collection }: { collection: string }) =>
        collection === "mail-signalen" ? { docs: [] } : { docs: [] }
      );

      await GET(maakRequest());

      expect(mockSignalen).toHaveBeenCalledWith(expect.anything(), 42, "token-abc", expect.anything(), { scanNieuweKandidaten: true });
    });

    it("slaat de kandidatenscan over wanneer de vorige scan minder dan 15 minuten geleden is", async () => {
      mockPayloadFind.mockImplementation(async ({ collection }: { collection: string }) =>
        collection === "mail-signalen" ? { docs: [{ geclassificeerdOp: new Date(Date.now() - 5 * 60_000).toISOString() }] } : { docs: [] }
      );

      await GET(maakRequest());

      expect(mockSignalen).toHaveBeenCalledWith(expect.anything(), 42, "token-abc", expect.anything(), { scanNieuweKandidaten: false });
    });

    it("vraagt weer een kandidatenscan aan wanneer de vorige scan langer dan 15 minuten geleden is", async () => {
      mockPayloadFind.mockImplementation(async ({ collection }: { collection: string }) =>
        collection === "mail-signalen" ? { docs: [{ geclassificeerdOp: new Date(Date.now() - 20 * 60_000).toISOString() }] } : { docs: [] }
      );

      await GET(maakRequest());

      expect(mockSignalen).toHaveBeenCalledWith(expect.anything(), 42, "token-abc", expect.anything(), { scanNieuweKandidaten: true });
    });
  });
});
