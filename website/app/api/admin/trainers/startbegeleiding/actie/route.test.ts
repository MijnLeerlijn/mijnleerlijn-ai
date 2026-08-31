import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getPayload } from "payload";
import { POST } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { maakStartactie } from "@/lib/trainers/startbegeleiding";

vi.mock("payload", () => ({ getPayload: vi.fn() }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/startbegeleiding", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/startbegeleiding")>();
  return { ...echt, maakStartactie: vi.fn() };
});

const mockGetPayload = vi.mocked(getPayload);
const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockMaakStartactie = vi.mocked(maakStartactie);
const mockFindByID = vi.fn();

function maakRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/trainers/startbegeleiding/actie", { method: "POST", body: JSON.stringify(body) });
}

const GELDIGE_BODY = { mondaySchoolId: "s1", schoolNaam: "School A", trainerId: 10, actieType: "intake", instructie: "Bel", deadline: "2026-09-10", gespreksDatum: null };

beforeEach(() => {
  mockGetPayload.mockReset();
  mockVerify.mockReset();
  mockMaakStartactie.mockReset();
  mockFindByID.mockReset();
  mockGetPayload.mockResolvedValue({ findByID: mockFindByID } as never);
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
  mockFindByID.mockResolvedValue({ id: 10, name: "Trainer A", mondayUitvoerderItemId: "uitv-1" });
});

describe("POST /api/admin/trainers/startbegeleiding/actie — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(403);
    expect(mockMaakStartactie).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/trainers/startbegeleiding/actie — validatie", () => {
  it.each([
    ["ontbrekend mondaySchoolId", { ...GELDIGE_BODY, mondaySchoolId: undefined }],
    ["ongeldig trainerId", { ...GELDIGE_BODY, trainerId: -1 }],
    ["ongeldig actieType", { ...GELDIGE_BODY, actieType: "onbestaand" }],
    ["ontbrekende deadline", { ...GELDIGE_BODY, deadline: undefined }],
    ["te lange instructie", { ...GELDIGE_BODY, instructie: "x".repeat(1001) }],
  ])("geeft 400 bij %s", async (_omschrijving, body) => {
    const response = await POST(maakRequest(body));
    expect(response.status).toBe(400);
    expect(mockMaakStartactie).not.toHaveBeenCalled();
  });

  it("geeft 400 wanneer het opgegeven trainerId niet bestaat", async () => {
    mockFindByID.mockRejectedValue(new Error("niet gevonden"));
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(400);
    expect(mockMaakStartactie).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/trainers/startbegeleiding/actie — succes", () => {
  it("maakt de startactie aan en geeft 'm terug", async () => {
    mockMaakStartactie.mockResolvedValue({
      id: 1,
      mondaySchoolId: "s1",
      schoolNaam: "School A",
      trainerId: 10,
      trainerNaam: "Trainer A",
      actieType: "intake",
      instructie: "Bel",
      deadline: "2026-09-10",
      gespreksDatum: null,
      status: "open",
      afgerondOp: null,
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    const response = await POST(maakRequest(GELDIGE_BODY));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.actie).toMatchObject({ id: 1, trainerNaam: "Trainer A" });
    expect(mockMaakStartactie).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mondaySchoolId: "s1", trainerId: 10, actieType: "intake" }));
  });
});
