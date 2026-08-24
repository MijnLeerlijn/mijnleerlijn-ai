import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalAdminTrainerBasis, haalAdminTrainerOverzichtTab, haalAdminTrainerVerslagenTab } from "@/lib/admin/trainers/trainerdetail";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/admin/trainers/trainerdetail", () => ({
  haalAdminTrainerBasis: vi.fn(),
  haalAdminTrainerOverzichtTab: vi.fn(),
  haalAdminTrainerScholenTab: vi.fn(),
  haalAdminTrainerTrainingenTab: vi.fn(),
  haalAdminTrainerVerslagenTab: vi.fn(),
  haalAdminTrainerLogboekTab: vi.fn(),
  haalAdminTrainerTelefonieTab: vi.fn(),
  haalAdminTrainerBestandenTab: vi.fn(),
}));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockBasis = vi.mocked(haalAdminTrainerBasis);
const mockOverzicht = vi.mocked(haalAdminTrainerOverzichtTab);
const mockVerslagen = vi.mocked(haalAdminTrainerVerslagenTab);

function maakRequest(query: string) {
  return new NextRequest(`http://localhost:3000/api/admin/trainers/detail${query}`);
}

beforeEach(() => {
  mockVerify.mockReset();
  mockBasis.mockReset();
  mockOverzicht.mockReset();
  mockVerslagen.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
});

describe("GET /api/admin/trainers/detail — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie, ongeacht querystring", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest("?id=1&tab=overzicht"));
    expect(response.status).toBe(403);
    expect(mockBasis).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/trainers/detail — invoervalidatie", () => {
  it("geeft 400 bij een ontbrekend id", async () => {
    const response = await GET(maakRequest("?tab=overzicht"));
    expect(response.status).toBe(400);
  });

  it("geeft 400 bij een niet-numeriek id", async () => {
    const response = await GET(maakRequest("?id=abc&tab=overzicht"));
    expect(response.status).toBe(400);
  });

  it("geeft 400 bij een ongeldig tabblad", async () => {
    const response = await GET(maakRequest("?id=1&tab=onbestaand"));
    expect(response.status).toBe(400);
  });

  it("valt terug op tab=basis als geen tab is opgegeven", async () => {
    mockBasis.mockResolvedValue({ soort: "ok", data: { id: 1, naam: "Anne", email: "a@test.nl", actief: true, mondayTrainerboardId: "b1", mondayUitvoerderItemId: "u1", telefonieActief: false, mobielNummer: null } });
    const response = await GET(maakRequest("?id=1"));
    expect(response.status).toBe(200);
    expect(mockBasis).toHaveBeenCalledWith(expect.anything(), 1);
  });
});

describe("GET /api/admin/trainers/detail — tab-dispatch", () => {
  it("dispatcht tab=overzicht naar haalAdminTrainerOverzichtTab", async () => {
    mockOverzicht.mockResolvedValue({
      soort: "ok",
      data: {
        dashboard: { todo: [], vandaag: [], komendVolgende: [], komendTotaal: 0, recenteActiviteit: [], statistieken: { totaalTrainingen: 0, aantalScholen: 0, verslagenAfgerond: 0 }, bevestigdeScholen: [] },
        kennisQa: { laatsteNDagen: 30, aantalVragen: 0, percentageMetAntwoord: null, aantalZonderAntwoord: 0 },
      },
    });
    const response = await GET(maakRequest("?id=7&tab=overzicht"));
    expect(response.status).toBe(200);
    expect(mockOverzicht).toHaveBeenCalledWith(expect.anything(), 7);
  });

  it("dispatcht tab=verslagen naar haalAdminTrainerVerslagenTab", async () => {
    mockVerslagen.mockResolvedValue({ soort: "ok", data: [] });
    const response = await GET(maakRequest("?id=7&tab=verslagen"));
    expect(response.status).toBe(200);
    expect(mockVerslagen).toHaveBeenCalledWith(expect.anything(), 7);
  });

  it("geeft 404 als de gevraagde tab-functie 'niet_gevonden' teruggeeft", async () => {
    mockVerslagen.mockResolvedValue({ soort: "niet_gevonden" });
    const response = await GET(maakRequest("?id=999&tab=verslagen"));
    expect(response.status).toBe(404);
  });
});
