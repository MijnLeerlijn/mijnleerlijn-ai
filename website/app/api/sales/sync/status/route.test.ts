import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalLaatsteSyncStatus } from "@/lib/sales/sync";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/sales/sync", () => ({ haalLaatsteSyncStatus: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockHaalStatus = vi.mocked(haalLaatsteSyncStatus);

function maakRequest(cookie?: string) {
  return new NextRequest("http://localhost:3000/api/sales/sync/status", {
    headers: cookie ? { Cookie: `payload-token=${cookie}` } : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockHaalStatus.mockReset();
});

describe("GET /api/sales/sync/status", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await GET(maakRequest());

    expect(response.status).toBe(403);
    expect(mockHaalStatus).not.toHaveBeenCalled();
  });

  it("geeft de laatste sync-status terug voor een ingelogde editor", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockHaalStatus.mockResolvedValue({ laatsteSyncOp: "2026-08-16T11:58:00.000Z", scholenVerwerkt: 159, scholenGewijzigd: 6, fouten: 0 });

    const response = await GET(maakRequest("geldig-editor"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ laatsteSyncOp: "2026-08-16T11:58:00.000Z", scholenVerwerkt: 159, scholenGewijzigd: 6, fouten: 0 });
  });

  it("geeft null-waarden terug wanneer er nog nooit gesynchroniseerd is", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockHaalStatus.mockResolvedValue({ laatsteSyncOp: null, scholenVerwerkt: null, scholenGewijzigd: null, fouten: null });

    const response = await GET(maakRequest("geldig-admin"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.laatsteSyncOp).toBeNull();
  });

  it("geeft een nette 500 met foutmelding wanneer haalLaatsteSyncStatus faalt, geen technische details", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockHaalStatus.mockRejectedValue(new Error("Database niet bereikbaar."));

    const response = await GET(maakRequest("geldig-admin"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Database niet bereikbaar.");
  });
});
