import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getPayload } from "payload";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { koppelTrainerAanSchool } from "@/lib/trainers/startbegeleiding";

vi.mock("payload", () => ({ getPayload: vi.fn() }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/startbegeleiding", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/startbegeleiding")>();
  return { ...echt, koppelTrainerAanSchool: vi.fn() };
});

const mockGetPayload = vi.mocked(getPayload);
const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockKoppel = vi.mocked(koppelTrainerAanSchool);
const mockFindByID = vi.fn();

function maakRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/trainers/startbegeleiding/koppel", { method: "POST", body: JSON.stringify(body) });
}

const GELDIGE_BODY = { mondaySchoolId: "s1", trainerId: 10 };

beforeEach(() => {
  mockGetPayload.mockReset();
  mockVerify.mockReset();
  mockKoppel.mockReset();
  mockFindByID.mockReset();
  mockGetPayload.mockResolvedValue({ findByID: mockFindByID } as never);
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
  mockFindByID.mockResolvedValue({ id: 10, name: "Trainer A", mondayUitvoerderItemId: "uitv-1" });
});

describe("POST /api/admin/trainers/startbegeleiding/koppel — rechten en validatie", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(403);
    expect(mockKoppel).not.toHaveBeenCalled();
  });

  it("geeft 400 zonder mondaySchoolId", async () => {
    const response = await POST(maakRequest({ trainerId: 10 }));
    expect(response.status).toBe(400);
  });

  it("geeft 400 bij een ongeldig trainerId", async () => {
    const response = await POST(maakRequest({ mondaySchoolId: "s1", trainerId: -1 }));
    expect(response.status).toBe(400);
  });

  it("geeft 400 wanneer het opgegeven trainerId niet bestaat", async () => {
    mockFindByID.mockRejectedValue(new Error("niet gevonden"));
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(400);
    expect(mockKoppel).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/trainers/startbegeleiding/koppel — uitkomsten", () => {
  it("geeft 200 + 'gekoppeld' door bij een geslaagde koppeling, met het Monday-uitvoerder-ID (niet het Payload-ID)", async () => {
    mockKoppel.mockResolvedValue({ soort: "gekoppeld" });
    const response = await POST(maakRequest(GELDIGE_BODY));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.soort).toBe("gekoppeld");
    expect(mockKoppel).toHaveBeenCalledWith("s1", "uitv-1");
  });

  it("geeft 200 + 'al_gekoppeld' door", async () => {
    mockKoppel.mockResolvedValue({ soort: "al_gekoppeld" });
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(200);
    expect((await response.json()).soort).toBe("al_gekoppeld");
  });

  it("geeft 409 terug wanneer de functie nog niet geactiveerd is (feature-flag uit)", async () => {
    mockKoppel.mockResolvedValue({ soort: "niet_geactiveerd", boodschap: "nog niet aan" });
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(409);
  });

  it("geeft 502 terug wanneer de Monday-schrijving mislukt", async () => {
    mockKoppel.mockResolvedValue({ soort: "mislukt", boodschap: "Monday-timeout" });
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(502);
  });
});
