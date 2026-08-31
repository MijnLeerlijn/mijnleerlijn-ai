import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalAdminSchoolBasis, haalAdminSchoolTrainingenTab, haalAdminSchoolVerslagenTab, haalAdminSchoolUpsell } from "@/lib/admin/trainers/schooldetail";

// Traineromgeving V2, Fase 5 (2026-08-24) — spec §10/§6: rechten (alleen
// admin/editor, nooit trainercookie of unauthenticated) en tab-dispatch,
// zelfde opzet als app/api/admin/trainers/detail/route.test.ts. `id` is hier
// bewust een STRING-query (het Monday-school-ID), geen Number()-validatie —
// zie de toelichting in route.ts.

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/admin/trainers/schooldetail", () => ({
  haalAdminSchoolBasis: vi.fn(),
  haalAdminSchoolAandacht: vi.fn(),
  haalAdminSchoolOverzichtTab: vi.fn(),
  haalAdminSchoolTrainersTab: vi.fn(),
  haalAdminSchoolTrainingenTab: vi.fn(),
  haalAdminSchoolVerslagenTab: vi.fn(),
  haalAdminSchoolLogboekTab: vi.fn(),
  haalAdminSchoolBestandenTab: vi.fn(),
  haalAdminSchoolUpsell: vi.fn(),
}));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockBasis = vi.mocked(haalAdminSchoolBasis);
const mockTrainingen = vi.mocked(haalAdminSchoolTrainingenTab);
const mockVerslagen = vi.mocked(haalAdminSchoolVerslagenTab);
const mockUpsell = vi.mocked(haalAdminSchoolUpsell);

function maakRequest(query: string) {
  return new NextRequest(`http://localhost:3000/api/admin/trainers/school${query}`);
}

beforeEach(() => {
  mockVerify.mockReset();
  mockBasis.mockReset();
  mockTrainingen.mockReset();
  mockVerslagen.mockReset();
  mockUpsell.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
});

describe("GET /api/admin/trainers/school — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie (trainer/unauthenticated), ongeacht querystring", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest("?id=s1&tab=overzicht"));
    expect(response.status).toBe(403);
    expect(mockBasis).not.toHaveBeenCalled();
  });

  it("staat een admin-rol toe (niet uitsluitend editor)", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockBasis.mockResolvedValue({
      soort: "ok",
      data: { id: "s1", naam: "School A", onderwijstype: null, locatie: null, trainers: [], aantalActieveTrainers: 0, aantalOpenTrainingen: 0, aantalOpenTodos: 0, aantalOpenVerslagen: 0, laatsteActiviteit: null },
    });
    const response = await GET(maakRequest("?id=s1"));
    expect(response.status).toBe(200);
  });
});

describe("GET /api/admin/trainers/school — invoervalidatie", () => {
  it("geeft 400 bij een ontbrekend id", async () => {
    const response = await GET(maakRequest("?tab=overzicht"));
    expect(response.status).toBe(400);
  });

  it("geeft 400 bij een ongeldig tabblad", async () => {
    const response = await GET(maakRequest("?id=s1&tab=onbestaand"));
    expect(response.status).toBe(400);
  });

  it("valt terug op tab=basis als geen tab is opgegeven", async () => {
    mockBasis.mockResolvedValue({
      soort: "ok",
      data: { id: "s1", naam: "School A", onderwijstype: null, locatie: null, trainers: [], aantalActieveTrainers: 0, aantalOpenTrainingen: 0, aantalOpenTodos: 0, aantalOpenVerslagen: 0, laatsteActiviteit: null },
    });
    const response = await GET(maakRequest("?id=s1"));
    expect(response.status).toBe(200);
    expect(mockBasis).toHaveBeenCalledWith(expect.anything(), "s1");
  });

  it("geeft het school-ID ongewijzigd als string door (geen Number()-cast)", async () => {
    mockTrainingen.mockResolvedValue({ soort: "ok", data: [] });
    await GET(maakRequest("?id=1234567890&tab=trainingen"));
    expect(mockTrainingen).toHaveBeenCalledWith(expect.anything(), "1234567890");
  });
});

describe("GET /api/admin/trainers/school — tab-dispatch", () => {
  it("dispatcht tab=trainingen naar haalAdminSchoolTrainingenTab", async () => {
    mockTrainingen.mockResolvedValue({ soort: "ok", data: [] });
    const response = await GET(maakRequest("?id=s1&tab=trainingen"));
    expect(response.status).toBe(200);
    expect(mockTrainingen).toHaveBeenCalledWith(expect.anything(), "s1");
  });

  it("dispatcht tab=verslagen naar haalAdminSchoolVerslagenTab", async () => {
    mockVerslagen.mockResolvedValue({ soort: "ok", data: [] });
    const response = await GET(maakRequest("?id=s1&tab=verslagen"));
    expect(response.status).toBe(200);
    expect(mockVerslagen).toHaveBeenCalledWith(expect.anything(), "s1");
  });

  it("geeft 404 als de gevraagde tab-functie 'niet_gevonden' teruggeeft", async () => {
    mockVerslagen.mockResolvedValue({ soort: "niet_gevonden" });
    const response = await GET(maakRequest("?id=s999&tab=verslagen"));
    expect(response.status).toBe(404);
  });

  it("dispatcht tab=upsell naar haalAdminSchoolUpsell (Upsell-ronde, 2026-09-02)", async () => {
    mockUpsell.mockResolvedValue({ soort: "ok", data: { aantalMijnleerlijn: 1, aantalAanvullend: 0, totaal: 1, aanvullendeTrainingen: [] } });
    const response = await GET(maakRequest("?id=s1&tab=upsell"));
    expect(response.status).toBe(200);
    expect(mockUpsell).toHaveBeenCalledWith(expect.anything(), "s1");
  });
});
