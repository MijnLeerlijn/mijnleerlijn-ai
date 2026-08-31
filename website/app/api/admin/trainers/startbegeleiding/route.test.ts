import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalAdminStartbegeleidingScholen } from "@/lib/admin/trainers/startbegeleiding";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/admin/trainers/startbegeleiding", () => ({ haalAdminStartbegeleidingScholen: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockScholen = vi.mocked(haalAdminStartbegeleidingScholen);

function maakRequest() {
  return new NextRequest("http://localhost:3000/api/admin/trainers/startbegeleiding");
}

beforeEach(() => {
  mockVerify.mockReset();
  mockScholen.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
  mockScholen.mockResolvedValue([]);
});

describe("GET /api/admin/trainers/startbegeleiding — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockScholen).not.toHaveBeenCalled();
  });

  it("weigert een niet-editor/admin met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "trainer" as never }, cookieAanwezig: true });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
  });
});

describe("GET /api/admin/trainers/startbegeleiding — inhoud", () => {
  it("geeft de scholenlijst terug voor een editor", async () => {
    mockScholen.mockResolvedValue([{ id: "s1", naam: "School A", onderwijstype: null, locatie: null, relatiestatus: "Klant", gekoppeldeTrainerMondayIds: [], gekoppeldeTrainerNamen: [], aantalOpenStartActies: 0 }]);
    const response = await GET(maakRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.scholen).toHaveLength(1);
  });
});
