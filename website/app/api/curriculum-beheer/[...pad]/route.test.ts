import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Route-test voor de proxy naar Curriculum Werkplaats (Helpdesk-
// beheerkoppeling-uitbreiding 2026, punt 1/7): dekt specifiek de twee
// scenario's die de witte-pagina-bugfix moest afdekken — "beheer-API
// bereikbaar" (happy path, passthrough van status/body) en "nette foutstaat
// als de API niet bereikbaar is" (generieke, niet-technische foutmelding
// naar de client; de echte foutdetails gaan alleen naar console.error, zie
// foutRespons() in route.ts). Auth/sessie-laag (verifyAdminSessionCookie,
// jwtVerify) wordt hier gemockt — die heeft al eigen dekking via de
// Curriculum-kant se beheer-routes.test.ts-equivalent en is voor dít gedrag
// niet de kern van de test.

const getPayloadMock = vi.fn();
vi.mock("payload", () => ({ getPayload: (...args: unknown[]) => getPayloadMock(...args) }));
vi.mock("@/payload.config", () => ({ default: {} }));

const verifyAdminSessionCookieMock = vi.fn();
vi.mock("@/lib/auth/verify-session", () => ({
  verifyAdminSessionCookie: (...args: unknown[]) => verifyAdminSessionCookieMock(...args),
  PAYLOAD_SESSION_COOKIE_NAME: "payload-token",
}));

vi.mock("@/payload/access/roles", () => ({
  isAdmin: (user: { role?: string } | null) => !!user && user.role === "admin",
}));

const stuurCurriculumBeheerVerzoekMock = vi.fn();
vi.mock("@/lib/curriculum-beheer/client", () => ({
  stuurCurriculumBeheerVerzoek: (...args: unknown[]) => stuurCurriculumBeheerVerzoekMock(...args),
}));

const ADMIN_USER = { id: 1, role: "admin", name: "Beheerder Test", email: "beheerder@voorbeeld.nl" };

function maakRequest(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest;
}

describe("GET/POST/DELETE /api/curriculum-beheer/[...pad] — proxy naar Curriculum Werkplaats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPayloadMock.mockResolvedValue({});
    verifyAdminSessionCookieMock.mockResolvedValue({ user: ADMIN_USER });
  });

  it("beheer-API bereikbaar: geeft status en body van Curriculum Werkplaats onveranderd door", async () => {
    const { GET } = await import("./route");
    stuurCurriculumBeheerVerzoekMock.mockResolvedValue({
      status: 200,
      body: { status: "OK", projecten: [{ id: "p1", schoolnaam: "Testschool", plaats: "Amsterdam" }] },
    });

    const request = maakRequest("https://helpdesk.mijnleerlijn.chat/api/curriculum-beheer/projecten");
    const response = await GET(request, { params: Promise.resolve({ pad: ["projecten"] }) });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("OK");
    expect(json.projecten[0].plaats).toBe("Amsterdam");
  });

  it("nette foutstaat: als Curriculum Werkplaats niet bereikbaar is, krijgt de client een generieke melding — geen technische details/stacktrace", async () => {
    const { GET } = await import("./route");
    stuurCurriculumBeheerVerzoekMock.mockRejectedValue(
      new Error("fetch failed: connect ECONNREFUSED curriculum.mijnleerlijn.chat:443 — geheim-detail-x9f2")
    );
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const request = maakRequest("https://helpdesk.mijnleerlijn.chat/api/curriculum-beheer/projecten");
    const response = await GET(request, { params: Promise.resolve({ pad: ["projecten"] }) });

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.error).toBe("De Curriculum Werkplaats kan op dit moment niet worden bereikt.");
    // De technische foutmelding mag nergens in de client-respons lekken.
    expect(JSON.stringify(json)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(json)).not.toContain("geheim-detail-x9f2");
    // Wél gelogd, voor beheer/serverlogs.
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("weigert toegang aan een niet-beheerder, zonder de Curriculum-API te benaderen", async () => {
    const { GET } = await import("./route");
    verifyAdminSessionCookieMock.mockResolvedValue({ user: { id: 2, role: "gebruiker" } });

    const request = maakRequest("https://helpdesk.mijnleerlijn.chat/api/curriculum-beheer/projecten");
    const response = await GET(request, { params: Promise.resolve({ pad: ["projecten"] }) });

    expect(response.status).toBe(403);
    expect(stuurCurriculumBeheerVerzoekMock).not.toHaveBeenCalled();
  });

  it("POST-fout wordt net zo netjes afgehandeld als GET (geen technische details naar de client)", async () => {
    const { POST } = await import("./route");
    stuurCurriculumBeheerVerzoekMock.mockRejectedValue(new Error("interne foutdetails die niet zichtbaar mogen zijn"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const request = maakRequest("https://helpdesk.mijnleerlijn.chat/api/curriculum-beheer/projecten/p1/blokkeren", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(request, { params: Promise.resolve({ pad: ["projecten", "p1", "blokkeren"] }) });

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.error).toBe("De Curriculum Werkplaats kan op dit moment niet worden bereikt.");
    expect(JSON.stringify(json)).not.toContain("interne foutdetails");
  });
});
