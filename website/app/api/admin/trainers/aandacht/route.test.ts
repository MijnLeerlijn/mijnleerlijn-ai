import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalAlleTrainerAccounts, haalOpenVerslagenVoorAlleTrainers, haalMislukteTelefonieOproepenVoorAlleTrainers } from "@/lib/admin/trainers/aggregatie";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/admin/trainers/aggregatie", () => ({
  haalAlleTrainerAccounts: vi.fn(),
  haalOpenVerslagenVoorAlleTrainers: vi.fn(),
  haalMislukteTelefonieOproepenVoorAlleTrainers: vi.fn(),
}));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockTrainers = vi.mocked(haalAlleTrainerAccounts);
const mockOpenVerslagen = vi.mocked(haalOpenVerslagenVoorAlleTrainers);
const mockMislukt = vi.mocked(haalMislukteTelefonieOproepenVoorAlleTrainers);

function maakRequest() {
  return new NextRequest("http://localhost:3000/api/admin/trainers/aandacht");
}

beforeEach(() => {
  mockVerify.mockReset();
  mockTrainers.mockReset();
  mockOpenVerslagen.mockReset();
  mockMislukt.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
  mockTrainers.mockResolvedValue([]);
  mockOpenVerslagen.mockResolvedValue([]);
  mockMislukt.mockResolvedValue([]);
});

describe("GET /api/admin/trainers/aandacht — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockTrainers).not.toHaveBeenCalled();
  });

  it("weigert een niet-editor/admin met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "trainer" as never }, cookieAanwezig: true });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
  });
});

describe("GET /api/admin/trainers/aandacht — inhoud", () => {
  it("geeft items en trainersMetVeelOudeVerslagen terug voor een editor", async () => {
    mockMislukt.mockResolvedValue([{ oproepId: 1, trainerId: 1, foutcode: "onbekende_fout", foutmelding: "fout", afgerondOp: "2026-08-20T00:00:00.000Z", gekozenSchoolNaam: null, gekozenTrainingNaam: null }]);
    const response = await GET(maakRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.trainersMetVeelOudeVerslagen).toEqual([]);
  });
});
