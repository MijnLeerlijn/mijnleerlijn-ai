import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { stelOnderwijstypeHandmatigIn } from "@/lib/sales/education-type-manual";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/sales/education-type-manual", () => ({ stelOnderwijstypeHandmatigIn: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockStelIn = vi.mocked(stelOnderwijstypeHandmatigIn);

function maakRequest(opties: { cookie?: string; body?: unknown } = {}) {
  return new NextRequest("http://localhost:3000/api/sales/school/1/education-type", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opties.cookie ? { Cookie: `payload-token=${opties.cookie}` } : {}) },
    body: opties.body !== undefined ? JSON.stringify(opties.body) : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockStelIn.mockReset();
});

describe("POST /api/sales/school/[id]/education-type", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await POST(maakRequest({ body: { variantId: 5 } }), { params: Promise.resolve({ id: "1" }) });

    expect(response.status).toBe(403);
    expect(mockStelIn).not.toHaveBeenCalled();
  });

  it("geeft 400 voor een ongeldig school-ID", async () => {
    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { variantId: 5 } }), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(400);
  });

  it("geeft 400 zonder een geldige variantId", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: {} }), { params: Promise.resolve({ id: "1" }) });

    expect(response.status).toBe(400);
    expect(mockStelIn).not.toHaveBeenCalled();
  });

  it("geeft 404 wanneer de school niet bestaat", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockStelIn.mockRejectedValue(new Error("School niet gevonden."));

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { variantId: 5 } }), { params: Promise.resolve({ id: "999" }) });

    expect(response.status).toBe(404);
  });

  it("geeft het resultaat terug bij een geslaagde write-back", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockStelIn.mockResolvedValue({ writeback: { status: "geschreven", boodschap: "ok" }, lokaalBijgewerkt: true });

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { variantId: 5 } }), { params: Promise.resolve({ id: "1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.lokaalBijgewerkt).toBe(true);
    expect(mockStelIn).toHaveBeenCalledWith(expect.anything(), 1, 5, 7);
  });

  it("geeft ook een 200 met de write-back-status terug bij een conflict — de client toont de reden, geen 500", async () => {
    mockVerify.mockResolvedValue({ user: { id: 7, role: "editor" }, cookieAanwezig: true });
    mockStelIn.mockResolvedValue({ writeback: { status: "conflict", boodschap: "Conflict: Monday is gewijzigd" }, lokaalBijgewerkt: false });

    const response = await POST(maakRequest({ cookie: "geldig-editor", body: { variantId: 5 } }), { params: Promise.resolve({ id: "1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.writeback.status).toBe("conflict");
    expect(data.lokaalBijgewerkt).toBe(false);
  });
});
