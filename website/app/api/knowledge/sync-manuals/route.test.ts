import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { syncManuals } from "@/lib/knowledge/sync-manuals";

// Zelfde opzet als app/api/knowledge/index/route.test.ts — dekt uitsluitend
// de route zelf (sessiecontrole, body-doorgifte, foutafhandeling); de
// synchronisatielogica zelf heeft eigen tests in lib/knowledge/sync-manuals.test.ts.

vi.mock("payload", () => ({
  getPayload: vi
    .fn()
    .mockResolvedValue({ secret: "test", logger: { info: vi.fn(), warn: vi.fn() } }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/knowledge/sync-manuals", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/knowledge/sync-manuals")>();
  return { ...echt, syncManuals: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockSync = vi.mocked(syncManuals);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/knowledge/sync-manuals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}),
    },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

const leegResultaat = {
  gevonden: 0,
  nieuw: 0,
  bijgewerkt: 0,
  ongewijzigdOvergeslagen: 0,
  duplicaatOvergeslagen: 0,
  geindexeerd: 0,
  geembed: 0,
  mislukt: 0,
  fouten: [] as string[],
};

beforeEach(() => {
  mockVerify.mockReset();
  mockSync.mockReset();
});

describe("POST /api/knowledge/sync-manuals", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403, zonder te synchroniseren", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: {} }));

    expect(response.status).toBe(403);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag van een ingelogde niet-beheerder (editor) met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-maar-editor", body: {} }));

    expect(response.status).toBe(403);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("synchroniseert met de standaardlimiet wanneer een beheerder een lege body stuurt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockSync.mockResolvedValue(leegResultaat);

    const response = await POST(maakRequest({ cookie: "geldig-admin" }));

    expect(response.status).toBe(200);
    expect(mockSync).toHaveBeenCalledWith(expect.anything(), { limiet: 5 });
  });

  it("geeft een geldige, expliciete limit door", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockSync.mockResolvedValue({ ...leegResultaat, gevonden: 12, nieuw: 3, geindexeerd: 3, geembed: 3 });

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: { limit: 10 } }));
    const data = await response.json();

    expect(mockSync).toHaveBeenCalledWith(expect.anything(), { limiet: 10 });
    expect(data.geindexeerd).toBe(3);
  });

  it("valt terug op de standaardlimiet bij een ongeldige limit (bv. 0 of negatief)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockSync.mockResolvedValue(leegResultaat);

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: { limit: -3 } }));

    expect(response.status).toBe(200);
    expect(mockSync).toHaveBeenCalledWith(expect.anything(), { limiet: 5 });
  });

  it("geeft een 500 met duidelijke melding terug wanneer synchroniseren hard faalt, en stopt daarmee altijd het laden", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockSync.mockRejectedValue(new Error("Database niet bereikbaar"));

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: {} }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Database niet bereikbaar");
  });
});
