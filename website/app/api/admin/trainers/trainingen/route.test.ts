import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalAlleTrainerAccounts, haalRecenteVerslagActiviteitVoorAlleTrainers } from "@/lib/admin/trainers/aggregatie";
import { haalTrainingenEnScholenVoorAlleTrainers } from "@/lib/trainers/monday-links";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/admin/trainers/aggregatie", () => ({ haalAlleTrainerAccounts: vi.fn(), haalRecenteVerslagActiviteitVoorAlleTrainers: vi.fn() }));
vi.mock("@/lib/trainers/monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/monday-links")>();
  return { ...echt, haalTrainingenEnScholenVoorAlleTrainers: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockTrainers = vi.mocked(haalAlleTrainerAccounts);
const mockVerslagActiviteit = vi.mocked(haalRecenteVerslagActiviteitVoorAlleTrainers);
const mockMonday = vi.mocked(haalTrainingenEnScholenVoorAlleTrainers);

function maakRequest(query = "") {
  return new NextRequest(`http://localhost:3000/api/admin/trainers/trainingen${query}`);
}

const trainerA = { id: 1, naam: "Trainer A", email: "a@test.nl", actief: true, mondayUitvoerderItemId: "uitv-a", mondayTrainerboardId: "board-a", telefonieActief: false };
const trainerB = { id: 2, naam: "Trainer B", email: "b@test.nl", actief: true, mondayUitvoerderItemId: "uitv-b", mondayTrainerboardId: "board-b", telefonieActief: false };
const trainingA = { id: "t-a", naam: "Training van A", status: "gepland" as const, ruweStatusTekst: "Gepland", datum: "2026-09-01", logboekIngevuld: false, trainerboardItemId: "tb-1", bron: "mijnleerlijn" as const, schoolId: "s-a", schoolNaam: "School A" };
const trainingB = { id: "t-b", naam: "Training van B", status: "gedaan" as const, ruweStatusTekst: "Gedaan", datum: "2026-08-01", logboekIngevuld: true, trainerboardItemId: "tb-2", bron: "mijnleerlijn" as const, schoolId: "s-b", schoolNaam: "School B" };

beforeEach(() => {
  mockVerify.mockReset();
  mockTrainers.mockReset();
  mockVerslagActiviteit.mockReset();
  mockMonday.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
  mockTrainers.mockResolvedValue([trainerA, trainerB]);
  mockVerslagActiviteit.mockResolvedValue([]);
  mockMonday.mockResolvedValue({
    trainingenPerTrainer: new Map([
      ["uitv-a", [trainingA]],
      ["uitv-b", [trainingB]],
    ]),
    scholenPerTrainer: new Map(),
    scholen: new Map(),
    trainingenPerSchool: new Map(),
  });
});

describe("GET /api/admin/trainers/trainingen — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockTrainers).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/trainers/trainingen — filters", () => {
  it("zonder filters: toont trainingen van alle trainers gecombineerd", async () => {
    const response = await GET(maakRequest());
    const body = await response.json();
    expect(body.trainingen).toHaveLength(2);
  });

  it("filtert op trainerId", async () => {
    const response = await GET(maakRequest("?trainerId=1"));
    const body = await response.json();
    expect(body.trainingen).toHaveLength(1);
    expect(body.trainingen[0].trainerId).toBe(1);
  });

  it("filtert op schoolId", async () => {
    const response = await GET(maakRequest("?schoolId=s-b"));
    const body = await response.json();
    expect(body.trainingen).toHaveLength(1);
    expect(body.trainingen[0].schoolId).toBe("s-b");
  });

  it("filtert op status (weergaveStatus)", async () => {
    const response = await GET(maakRequest("?status=gedaan"));
    const body = await response.json();
    expect(body.trainingen).toHaveLength(1);
    expect(body.trainingen[0].trainingId).toBe("t-b");
  });

  it("filtert op verslagStatus=geen (nog geen verslagrij)", async () => {
    const response = await GET(maakRequest("?verslagStatus=geen"));
    const body = await response.json();
    expect(body.trainingen).toHaveLength(2);
  });
});
