import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang, markeerGoogleConnectionGebruikt } from "@/lib/google-calendar/connection";
import { fetchPrimaryCalendar } from "@/lib/google-calendar/oauth";
import { fetchAgendaEventsInBereik } from "@/lib/google-calendar/api";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/google-calendar/connection", () => ({
  verkrijgGeldigeToegang: vi.fn(),
  markeerGoogleConnectionGebruikt: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/google-calendar/oauth", () => ({ fetchPrimaryCalendar: vi.fn() }));
vi.mock("@/lib/google-calendar/api", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/google-calendar/api")>();
  return { ...echt, fetchAgendaEventsInBereik: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockToegang = vi.mocked(verkrijgGeldigeToegang);
const mockMarkeer = vi.mocked(markeerGoogleConnectionGebruikt);
const mockPrimary = vi.mocked(fetchPrimaryCalendar);
const mockEvents = vi.mocked(fetchAgendaEventsInBereik);

function maakRequest(datum?: string, cookie = "geldig") {
  const url = new URL("http://localhost:3000/api/werk/agenda");
  if (datum) url.searchParams.set("datum", datum);
  return new NextRequest(url, { headers: { Cookie: `payload-token=${cookie}` } });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockToegang.mockReset();
  mockMarkeer.mockReset().mockResolvedValue(undefined);
  mockPrimary.mockReset();
  mockEvents.mockReset();
});

describe("GET /api/werk/agenda", () => {
  it("weigert zonder geldige sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest("2026-08-20"));
    expect(response.status).toBe(403);
    expect(mockToegang).not.toHaveBeenCalled();
  });

  it("weigert een ontbrekende of ongeldige datum met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const zonderDatum = await GET(maakRequest());
    expect(zonderDatum.status).toBe(400);

    const ongeldigeDatum = await GET(maakRequest("20 augustus"));
    expect(ongeldigeDatum.status).toBe(400);
    expect(mockToegang).not.toHaveBeenCalled();
  });

  it("levert connected: false zonder events wanneer er geen (geldige) koppeling is — geen foutstatus", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue(null);

    const response = await GET(maakRequest("2026-08-20"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ connected: false, events: [] });
    expect(mockPrimary).not.toHaveBeenCalled();
  });

  it("scopet de toegangsopvraag op de eigen, ingelogde gebruiker-ID", async () => {
    mockVerify.mockResolvedValue({ user: { id: 42, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue(null);

    await GET(maakRequest("2026-08-20"));

    expect(mockToegang).toHaveBeenCalledWith(expect.anything(), 42);
  });

  it("haalt events op voor exact het opgegeven venster (tijdzone-correct) en markeert de koppeling als gebruikt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "token-123", connectionId: 7, scopes: ["https://www.googleapis.com/auth/calendar.readonly"] });
    mockPrimary.mockResolvedValue({ emailAddress: "test@voorbeeld.nl", timeZone: "Europe/Amsterdam" });
    mockEvents.mockResolvedValue({
      timeZone: "Europe/Amsterdam",
      events: [{ id: "evt1", titel: "Training", volledigeDag: false, datum: "2026-08-20", tijd: "09:00", eindTijd: "10:00" }],
    });

    const response = await GET(maakRequest("2026-08-20"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.connected).toBe(true);
    expect(data.events).toHaveLength(1);
    expect(mockEvents).toHaveBeenCalledWith("token-123", "2026-08-19T22:00:00.000Z", "2026-08-20T22:00:00.000Z");
    expect(mockMarkeer).toHaveBeenCalledWith(expect.anything(), 7);
  });

  it("geeft een generieke 500-foutmelding terug wanneer het ophalen mislukt — nooit de ruwe Google-foutdetails", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "geheim-token-xyz", connectionId: 7, scopes: ["https://www.googleapis.com/auth/calendar.readonly"] });
    mockPrimary.mockRejectedValue(new Error("Ophalen Google-agendaprofiel mislukt (401): geheim-token-xyz ongeldig"));

    const response = await GET(maakRequest("2026-08-20"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("geheim-token-xyz");
    expect(data.error).toBe("Agenda kon niet worden opgehaald. Probeer het later opnieuw.");
  });
});
