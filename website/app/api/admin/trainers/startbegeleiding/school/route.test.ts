import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalAdminStartbegeleidingSchoolDetail } from "@/lib/admin/trainers/startbegeleiding";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/admin/trainers/startbegeleiding", () => ({ haalAdminStartbegeleidingSchoolDetail: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockDetail = vi.mocked(haalAdminStartbegeleidingSchoolDetail);

function maakRequest(query = "") {
  return new NextRequest(`http://localhost:3000/api/admin/trainers/startbegeleiding/school${query}`);
}

beforeEach(() => {
  mockVerify.mockReset();
  mockDetail.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
});

describe("GET /api/admin/trainers/startbegeleiding/school — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest("?id=s1"));
    expect(response.status).toBe(403);
    expect(mockDetail).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/trainers/startbegeleiding/school — inhoud", () => {
  it("geeft 400 zonder id-parameter", async () => {
    const response = await GET(maakRequest());
    expect(response.status).toBe(400);
    expect(mockDetail).not.toHaveBeenCalled();
  });

  it("geeft 404 wanneer de school niet gevonden wordt", async () => {
    mockDetail.mockResolvedValue(null);
    const response = await GET(maakRequest("?id=onbekend"));
    expect(response.status).toBe(404);
  });

  it("geeft de schooldetail terug bij een geldig id", async () => {
    mockDetail.mockResolvedValue({
      school: { id: "s1", naam: "School A", onderwijstype: null, locatie: null, relatiestatus: "Klant", gekoppeldeTrainerMondayIds: [] },
      gekoppeldeTrainers: [],
      openStartActies: [],
      trainerOpties: [],
    });
    const response = await GET(maakRequest("?id=s1"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.school.naam).toBe("School A");
  });
});
