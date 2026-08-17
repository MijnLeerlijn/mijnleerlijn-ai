import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { verkrijgGeldigeToegang } from "@/lib/google-calendar/connection";
import { fetchPrimaryCalendar } from "@/lib/google-calendar/oauth";
import { fetchAgendaEventsInBereik } from "@/lib/google-calendar/api";
import { haalVoorbereidingSignalen } from "@/lib/werk/voorbereiding";

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
vi.mock("@/lib/google-calendar/oauth", () => ({ fetchPrimaryCalendar: vi.fn() }));
vi.mock("@/lib/google-calendar/api", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/google-calendar/api")>();
  return { ...echt, fetchAgendaEventsInBereik: vi.fn() };
});
vi.mock("@/lib/werk/voorbereiding", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/werk/voorbereiding")>();
  return { ...echt, haalVoorbereidingSignalen: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockToegang = vi.mocked(verkrijgGeldigeToegang);
const mockPrimary = vi.mocked(fetchPrimaryCalendar);
const mockEvents = vi.mocked(fetchAgendaEventsInBereik);
const mockSignalen = vi.mocked(haalVoorbereidingSignalen);

function maakRequest(vandaag?: string) {
  const url = new URL("http://localhost:3000/api/werk/voorbereiding");
  if (vandaag) url.searchParams.set("vandaag", vandaag);
  return new NextRequest(url, { headers: { Cookie: "payload-token=geldig" } });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockToegang.mockReset();
  mockPrimary.mockReset();
  mockEvents.mockReset();
  mockSignalen.mockReset();
});

describe("GET /api/werk/voorbereiding", () => {
  it("weigert zonder geldige sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest("2026-08-17"));
    expect(response.status).toBe(403);
  });

  it("weigert een ontbrekende/ongeldige 'vandaag' met 400", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    expect((await GET(maakRequest())).status).toBe(400);
    expect((await GET(maakRequest("niet-een-datum"))).status).toBe(400);
  });

  it("levert connected: false zonder signalen zonder (geldige) koppeling", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue(null);

    const response = await GET(maakRequest("2026-08-17"));
    const data = await response.json();

    expect(data).toEqual({ connected: false, signalen: [] });
    expect(mockPrimary).not.toHaveBeenCalled();
  });

  it("haalt het look-ahead-venster op (vandaag t/m +PREP_LOOKAHEAD_DAGEN) en geeft de signalen door", async () => {
    mockVerify.mockResolvedValue({ user: { id: 5, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "token", connectionId: 1, scopes: ["https://www.googleapis.com/auth/calendar.readonly"] });
    mockPrimary.mockResolvedValue({ emailAddress: "x@y.nl", timeZone: "UTC" });
    mockEvents.mockResolvedValue({ timeZone: "UTC", events: [] });
    mockSignalen.mockResolvedValue([]);

    const response = await GET(maakRequest("2026-08-17"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.connected).toBe(true);
    expect(mockEvents).toHaveBeenCalledWith("token", "2026-08-17T00:00:00.000Z", "2026-08-20T00:00:00.000Z");
    expect(mockSignalen).toHaveBeenCalledWith(expect.anything(), 5, [], expect.any(Array), "2026-08-17");
  });

  it("geeft een generieke 500-fout terug, nooit ruwe details", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockToegang.mockResolvedValue({ accessToken: "geheim-xyz", connectionId: 1, scopes: ["https://www.googleapis.com/auth/calendar.readonly"] });
    mockPrimary.mockRejectedValue(new Error("geheim-xyz lekt hier bijna"));

    const response = await GET(maakRequest("2026-08-17"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("geheim-xyz");
  });
});
