import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { repairFailedKnowledgeSources } from "@/lib/knowledge/repair-failed-sources";

// Zelfde opzet als app/api/knowledge/sync-manuals/route.test.ts — dekt
// uitsluitend de route zelf (sessiecontrole, body-doorgifte, foutafhandeling);
// de herstellogica zelf heeft eigen tests in
// lib/knowledge/repair-failed-sources.test.ts.

vi.mock("payload", () => ({
  getPayload: vi.fn().mockResolvedValue({ secret: "test", logger: { info: vi.fn(), warn: vi.fn() } }),
}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/knowledge/repair-failed-sources", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/knowledge/repair-failed-sources")>();
  return { ...echt, repairFailedKnowledgeSources: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockRepair = vi.mocked(repairFailedKnowledgeSources);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/knowledge/repair-failed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}),
    },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

const leegResultaat = {
  gevonden: [] as { id: number; title: string; indexError: string | null }[],
  verwerkt: 0,
  heringedexeerd: 0,
  geembed: 0,
  nogSteedsMislukt: 0,
  fouten: [] as string[],
};

beforeEach(() => {
  mockVerify.mockReset();
  mockRepair.mockReset();
});

describe("POST /api/knowledge/repair-failed", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403, zonder te herstellen", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: {} }));

    expect(response.status).toBe(403);
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it("weigert een aanvraag van een ingelogde niet-beheerder (editor) met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-maar-editor", body: {} }));

    expect(response.status).toBe(403);
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it("herstelt met de standaardlimiet wanneer een beheerder een lege body stuurt", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRepair.mockResolvedValue(leegResultaat);

    const response = await POST(maakRequest({ cookie: "geldig-admin" }));

    expect(response.status).toBe(200);
    expect(mockRepair).toHaveBeenCalledWith(expect.anything(), { limiet: 5 });
  });

  it("geeft een geldige, expliciete limit door", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRepair.mockResolvedValue({
      ...leegResultaat,
      gevonden: [{ id: 1, title: "Bron 1", indexError: "Kon PDF niet ophalen (HTTP 403)." }],
      verwerkt: 1,
      heringedexeerd: 1,
      geembed: 1,
    });

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: { limit: 10 } }));
    const data = await response.json();

    expect(mockRepair).toHaveBeenCalledWith(expect.anything(), { limiet: 10 });
    expect(data.heringedexeerd).toBe(1);
  });

  it("valt terug op de standaardlimiet bij een ongeldige limit (bv. 0 of negatief)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRepair.mockResolvedValue(leegResultaat);

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: { limit: -3 } }));

    expect(response.status).toBe(200);
    expect(mockRepair).toHaveBeenCalledWith(expect.anything(), { limiet: 5 });
  });

  it("geeft een 500 met duidelijke melding terug wanneer herstellen hard faalt, en stopt daarmee altijd het laden", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockRepair.mockRejectedValue(new Error("Database niet bereikbaar"));

    const response = await POST(maakRequest({ cookie: "geldig-admin", body: {} }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Database niet bereikbaar");
  });
});
