import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { verifieerMondayKoppeling } from "@/lib/sales/monday-diagnostics";

const { mockFindByID } = vi.hoisted(() => ({ mockFindByID: vi.fn() }));
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({ findByID: mockFindByID }) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/sales/monday-diagnostics", () => ({ verifieerMondayKoppeling: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockVerifieerKoppeling = vi.mocked(verifieerMondayKoppeling);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/sales/monday-diagnostics/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}) },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockFindByID.mockReset();
  mockVerifieerKoppeling.mockReset();
});

describe("POST /api/sales/monday-diagnostics/verify", () => {
  it("weigert zonder sessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest());

    expect(response.status).toBe(403);
    expect(mockVerifieerKoppeling).not.toHaveBeenCalled();
  });

  it("weigert een gewone editor met 403 — dit diagnosepad is strenger dan de rest van Sales (isAdmin, geen isEditor)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest());

    expect(response.status).toBe(403);
    expect(mockVerifieerKoppeling).not.toHaveBeenCalled();
  });

  it("laat een admin zonder schoolId toe — alleen board/kolommen bevestigen, geen itemId", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockVerifieerKoppeling.mockResolvedValue({ boardBereikbaar: true, boardNaam: "1: Scholen", kolommen: [], testitem: null, fout: null });

    const response = await POST(maakRequest());

    expect(response.status).toBe(200);
    expect(mockVerifieerKoppeling).toHaveBeenCalledWith(undefined);
  });

  it("zoekt mondayItemId op via schoolId — nooit een los, door de client meegegeven Monday-item-ID vertrouwen", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue({ id: 21, mondayItemId: "999888" });
    mockVerifieerKoppeling.mockResolvedValue({ boardBereikbaar: true, boardNaam: "1: Scholen", kolommen: [], testitem: { gevonden: true, naam: "Testschool" }, fout: null });

    const response = await POST(maakRequest({ body: { schoolId: 21 } }));

    expect(response.status).toBe(200);
    expect(mockVerifieerKoppeling).toHaveBeenCalledWith("999888");
  });

  it("geeft 404 wanneer de opgegeven school niet bestaat", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockFindByID.mockResolvedValue(null);

    const response = await POST(maakRequest({ body: { schoolId: 999999 } }));

    expect(response.status).toBe(404);
    expect(mockVerifieerKoppeling).not.toHaveBeenCalled();
  });

  it("geeft 400 voor een ongeldig schoolId", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ body: { schoolId: "abc" } }));

    expect(response.status).toBe(400);
  });
});
