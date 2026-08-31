import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { wijzigStartactieStatus } from "@/lib/trainers/startbegeleiding";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/startbegeleiding", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/startbegeleiding")>();
  return { ...echt, wijzigStartactieStatus: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockWijzig = vi.mocked(wijzigStartactieStatus);

function maakRequest(status: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/trainers/startbegeleiding/actie/1", { method: "PATCH", body: JSON.stringify({ status }) });
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockVerify.mockReset();
  mockWijzig.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
});

describe("PATCH /api/admin/trainers/startbegeleiding/actie/[id]", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await PATCH(maakRequest("afgerond"), params("1"));
    expect(response.status).toBe(403);
    expect(mockWijzig).not.toHaveBeenCalled();
  });

  it("geeft 400 bij een niet-numeriek ID", async () => {
    const response = await PATCH(maakRequest("afgerond"), params("abc"));
    expect(response.status).toBe(400);
  });

  it("geeft 400 bij een andere status dan 'afgerond'/'vervallen'", async () => {
    const response = await PATCH(maakRequest("open"), params("1"));
    expect(response.status).toBe(400);
    expect(mockWijzig).not.toHaveBeenCalled();
  });

  it("geeft 404 wanneer de actie niet bestaat", async () => {
    mockWijzig.mockResolvedValue("niet_gevonden");
    const response = await PATCH(maakRequest("afgerond"), params("999"));
    expect(response.status).toBe(404);
  });

  it("wijzigt de status en geeft ok:true terug", async () => {
    mockWijzig.mockResolvedValue("gewijzigd");
    const response = await PATCH(maakRequest("vervallen"), params("1"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockWijzig).toHaveBeenCalledWith(expect.anything(), 1, "vervallen");
  });
});
