import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalAlleTrainerAccounts, haalRecenteVerslagActiviteitVoorAlleTrainers, haalLogboekitemsVoorAlleTrainers, haalMislukteTelefonieOproepenVoorAlleTrainers } from "@/lib/admin/trainers/aggregatie";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/admin/trainers/aggregatie", () => ({
  haalAlleTrainerAccounts: vi.fn(),
  haalRecenteVerslagActiviteitVoorAlleTrainers: vi.fn(),
  haalLogboekitemsVoorAlleTrainers: vi.fn(),
  haalMislukteTelefonieOproepenVoorAlleTrainers: vi.fn(),
}));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockTrainers = vi.mocked(haalAlleTrainerAccounts);
const mockVerslagen = vi.mocked(haalRecenteVerslagActiviteitVoorAlleTrainers);
const mockLogboek = vi.mocked(haalLogboekitemsVoorAlleTrainers);
const mockMislukt = vi.mocked(haalMislukteTelefonieOproepenVoorAlleTrainers);

function maakRequest(query = "") {
  return new NextRequest(`http://localhost:3000/api/admin/trainers/activiteit${query}`);
}

const trainerA = { id: 1, naam: "Trainer A", email: "a@test.nl", actief: true, mondayUitvoerderItemId: "uitv-a", mondayTrainerboardId: "board-a", telefonieActief: false };

beforeEach(() => {
  mockVerify.mockReset();
  mockTrainers.mockReset();
  mockVerslagen.mockReset();
  mockLogboek.mockReset();
  mockMislukt.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
  mockTrainers.mockResolvedValue([trainerA]);
  mockVerslagen.mockResolvedValue([]);
  mockLogboek.mockResolvedValue([]);
  mockMislukt.mockResolvedValue([]);
});

describe("GET /api/admin/trainers/activiteit — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockTrainers).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/trainers/activiteit — samenvoeging en limiet", () => {
  it("combineert verslagen en logboekitems in één feed", async () => {
    mockVerslagen.mockResolvedValue([{ verslagId: 1, trainerId: 1, mondayTrainingId: "t1", schoolId: "s1", schoolNaam: "School A", trainingNaam: "T1", bron: "portal", status: "voltooid", wanneer: "2026-08-20T00:00:00.000Z" }]);
    mockLogboek.mockResolvedValue([{ id: 1, trainerId: 1, mondaySchoolId: "s1", schoolNaam: "School A", type: "notitie", occurredAt: "2026-08-21T00:00:00.000Z", tekst: "notitie", mondayTrainingId: null, trainingNaam: null, createdAt: "2026-08-21T00:00:00.000Z" }]);
    const response = await GET(maakRequest());
    const body = await response.json();
    expect(body.activiteit).toHaveLength(2);
  });

  it("respecteert een client-opgegeven limiet, begrensd door MAX_LIMIET", async () => {
    mockVerslagen.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ verslagId: i, trainerId: 1, mondayTrainingId: `t${i}`, schoolId: "s1", schoolNaam: "School A", trainingNaam: `T${i}`, bron: "portal" as const, status: "voltooid" as const, wanneer: `2026-08-${10 + i}T00:00:00.000Z` }))
    );
    const response = await GET(maakRequest("?limiet=3"));
    const body = await response.json();
    expect(body.activiteit).toHaveLength(3);
  });

  it("filtert op trainerId zonder de limiet vroegtijdig toe te passen (correct resultaat, niet kunstmatig leeg)", async () => {
    mockVerslagen.mockResolvedValue([
      { verslagId: 1, trainerId: 2, mondayTrainingId: "t1", schoolId: "s2", schoolNaam: "School B", trainingNaam: "T1", bron: "portal", status: "voltooid", wanneer: "2026-08-20T00:00:00.000Z" },
      { verslagId: 2, trainerId: 1, mondayTrainingId: "t2", schoolId: "s1", schoolNaam: "School A", trainingNaam: "T2", bron: "portal", status: "voltooid", wanneer: "2026-08-01T00:00:00.000Z" },
    ]);
    const response = await GET(maakRequest("?trainerId=1&limiet=1"));
    const body = await response.json();
    expect(body.activiteit).toHaveLength(1);
    expect(body.activiteit[0].trainerId).toBe(1);
  });
});
