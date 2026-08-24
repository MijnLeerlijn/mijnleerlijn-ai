import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalAdminTrainersOverzicht } from "@/lib/admin/trainers/overzicht";

// Traineromgeving V2, Fase 4 (2026-08-24) — spec §14/§18: rechten. Een
// null-user van verifyAdminSessionCookie dekt zowel "geen cookie"
// (unauthenticated) als "trainer-accounts-cookie" (verifyAdminSessionCookie
// controleert zelf al de collection-claim op "users", zie lib/auth/
// verify-session.ts — een trainerssessie geeft hier dus ALTIJD null terug,
// ongeacht hoe geldig die sessie voor de trainerportal zelf is).

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/admin/trainers/overzicht", () => ({ haalAdminTrainersOverzicht: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockOverzicht = vi.mocked(haalAdminTrainersOverzicht);

function maakRequest() {
  return new NextRequest("http://localhost:3000/api/admin/trainers/overzicht");
}

beforeEach(() => {
  mockVerify.mockReset();
  mockOverzicht.mockReset();
});

describe("GET /api/admin/trainers/overzicht", () => {
  it("weigert een niet-geauthenticeerde aanvraag met 403, zonder de overzichtsquery uit te voeren", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockOverzicht).not.toHaveBeenCalled();
  });

  it("weigert een traineraccount-sessie (geen 'users'-collection-claim) met 403", async () => {
    // verifyAdminSessionCookie geeft voor een trainer-accounts-JWT altijd
    // user: null terug (collection-claim-controle) — route-gedrag is dus
    // identiek aan het "geen cookie"-geval hierboven.
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: true, reden: "verkeerde-collectie" });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockOverzicht).not.toHaveBeenCalled();
  });

  it("weigert een gebruiker zonder editor/admin-rol met 403", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "geen-rol" as never }, cookieAanwezig: true });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockOverzicht).not.toHaveBeenCalled();
  });

  it("geeft het overzicht terug voor een editor", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockOverzicht.mockResolvedValue({
      totalen: { actieveTrainers: 3, trainingenDezeMaand: 5, openTodos: 2, openVerslagen: 4, misluktetelefonieOproepen: 1 },
      trainers: [],
    });
    const response = await GET(maakRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).totalen.actieveTrainers).toBe(3);
  });

  it("geeft het overzicht ook terug voor een admin", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockOverzicht.mockResolvedValue({ totalen: { actieveTrainers: 0, trainingenDezeMaand: 0, openTodos: 0, openVerslagen: 0, misluktetelefonieOproepen: 0 }, trainers: [] });
    const response = await GET(maakRequest());
    expect(response.status).toBe(200);
  });
});
