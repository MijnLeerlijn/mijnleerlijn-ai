import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { voerDiagnostischeTerugzetting } from "@/lib/sales/monday-diagnostics";
import { SCHOLEN_KOLOM } from "@/lib/sales/monday-columns";

const { mockFindByID } = vi.hoisted(() => ({ mockFindByID: vi.fn() }));
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({ findByID: mockFindByID }) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/sales/monday-diagnostics", () => ({ voerDiagnostischeTerugzetting: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockTerugzetting = vi.mocked(voerDiagnostischeTerugzetting);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/sales/monday-diagnostics/revert", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}) },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

const GELDIG_BODY = { schoolId: 21, columnId: SCHOLEN_KOLOM.typeSchool, oorspronkelijkeWaarde: "Domein onderwijs", verwachteHuidigeWaarde: "Montessori" };

beforeEach(() => {
  mockVerify.mockReset();
  mockFindByID.mockReset();
  mockTerugzetting.mockReset();
});

describe("POST /api/sales/monday-diagnostics/revert", () => {
  it("weigert zonder sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: GELDIG_BODY }));

    expect(response.status).toBe(403);
    expect(mockTerugzetting).not.toHaveBeenCalled();
  });

  it("weigert een gewone editor met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ body: GELDIG_BODY }));

    expect(response.status).toBe(403);
    expect(mockTerugzetting).not.toHaveBeenCalled();
  });

  it("weigert een niet-toegestane column-ID", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ body: { ...GELDIG_BODY, columnId: "color_mm4vkv86" } }));

    expect(response.status).toBe(400);
    expect(mockTerugzetting).not.toHaveBeenCalled();
  });

  it("geeft 404 wanneer de school niet bestaat", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue(null);

    const response = await POST(maakRequest({ body: GELDIG_BODY }));

    expect(response.status).toBe(404);
    expect(mockTerugzetting).not.toHaveBeenCalled();
  });

  it("zet terug met de mondayItemId van de opgezochte school", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 21, mondayItemId: "999888" });
    mockTerugzetting.mockResolvedValue({ schrijfResultaat: { status: "geschreven", boodschap: "ok" }, gelezenNaSchrijven: "Domein onderwijs", bevestigd: true });

    const response = await POST(maakRequest({ body: GELDIG_BODY }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.bevestigd).toBe(true);
    expect(mockTerugzetting).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ schoolId: 21, mondayItemId: "999888", oorspronkelijkeWaarde: "Domein onderwijs", actorId: 1 })
    );
  });
});
