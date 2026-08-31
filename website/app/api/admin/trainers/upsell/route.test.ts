import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalAlleTrainerAccounts, haalRecenteVerslagActiviteitVoorAlleTrainers, haalAlleAanvullendeTrainingen } from "@/lib/admin/trainers/aggregatie";
import { haalTrainingenEnScholenVoorAlleTrainers } from "@/lib/trainers/monday-links";
import type { AuthUser } from "@/payload/access/roles";

// permissionMode/permissions bestaan niet op het (bewust minimale, zie
// payload/access/roles.ts) AuthUser-type zelf — zelfde "as unknown as
// AuthUser"-cast als lib/auth/verify-session.ts hanteert voor exact dit
// scenario (een echt Payload-gebruikersrecord heeft de velden altijd,
// het handgeschreven AuthUser-type modelleert ze bewust niet).
function restrictedUser(permissions: string[]): AuthUser {
  return { id: 1, role: "editor", permissionMode: "restricted", permissions } as unknown as AuthUser;
}

// Upsell-ronde (2026-09-02, spec §12) — "Trainingen & upsell": rechten
// (permissie trainers.upsell, los van trainers.trainingen/trainers.dashboard)
// en dat de volledige, ONGEFILTERDE rijenlijst + trainerlijst wordt
// teruggegeven — filteren/optellen gebeurt client-side (TrainersUpsellView.tsx),
// zelfde opzet/testconventie als app/api/admin/trainers/trainingen/route.test.ts.

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/admin/trainers/aggregatie", () => ({ haalAlleTrainerAccounts: vi.fn(), haalRecenteVerslagActiviteitVoorAlleTrainers: vi.fn(), haalAlleAanvullendeTrainingen: vi.fn() }));
vi.mock("@/lib/trainers/monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/monday-links")>();
  return { ...echt, haalTrainingenEnScholenVoorAlleTrainers: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockTrainers = vi.mocked(haalAlleTrainerAccounts);
const mockVerslagActiviteit = vi.mocked(haalRecenteVerslagActiviteitVoorAlleTrainers);
const mockMonday = vi.mocked(haalTrainingenEnScholenVoorAlleTrainers);
const mockAanvullend = vi.mocked(haalAlleAanvullendeTrainingen);

function maakRequest() {
  return new NextRequest("http://localhost:3000/api/admin/trainers/upsell");
}

const trainerA = { id: 1, naam: "Trainer A", email: "a@test.nl", actief: true, mondayUitvoerderItemId: "uitv-a", mondayTrainerboardId: "board-a", telefonieActief: false };
const trainerB = { id: 2, naam: "Trainer B", email: "b@test.nl", actief: false, mondayUitvoerderItemId: "uitv-b", mondayTrainerboardId: "board-b", telefonieActief: false };
const trainingA = { id: "t-a", naam: "Training van A", status: "gepland" as const, ruweStatusTekst: "Gepland", datum: "2026-09-01", logboekIngevuld: false, trainerboardItemId: "tb-1", bron: "mijnleerlijn" as const, schoolId: "s-a", schoolNaam: "School A" };

beforeEach(() => {
  mockVerify.mockReset();
  mockTrainers.mockReset();
  mockVerslagActiviteit.mockReset();
  mockMonday.mockReset();
  mockAanvullend.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
  mockTrainers.mockResolvedValue([trainerA, trainerB]);
  mockVerslagActiviteit.mockResolvedValue([]);
  mockAanvullend.mockResolvedValue([]);
  mockMonday.mockResolvedValue({ trainingenPerTrainer: new Map([["uitv-a", [trainingA]]]), scholenPerTrainer: new Map(), scholen: new Map(), trainingenPerSchool: new Map() });
});

describe("GET /api/admin/trainers/upsell — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockTrainers).not.toHaveBeenCalled();
  });

  it("weigert met 403 zonder de trainers.upsell-permissie, ook als de gebruiker wel editor is", async () => {
    mockVerify.mockResolvedValue({ user: restrictedUser(["trainers.trainingen"]), cookieAanwezig: true });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockTrainers).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/trainers/upsell — data", () => {
  it("geeft de volledige, ongefilterde trainingenlijst + trainerOpties (incl. inactieve trainers) terug", async () => {
    mockAanvullend.mockResolvedValue([{ id: 9, trainerId: 1, mondaySchoolId: "s-a", schoolNaam: "School A", naam: "Rekenen coaching", datum: "2026-09-05" }]);

    const response = await GET(maakRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.trainingen).toHaveLength(2);
    expect(body.trainingen.map((t: { bron: string }) => t.bron).sort()).toEqual(["aanvullend", "mijnleerlijn"]);
    expect(body.trainerOpties).toEqual([
      { id: 1, naam: "Trainer A", actief: true },
      { id: 2, naam: "Trainer B", actief: false },
    ]);
  });
});
