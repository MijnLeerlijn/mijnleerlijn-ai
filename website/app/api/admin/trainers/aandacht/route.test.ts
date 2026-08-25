import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalAlleTrainerAccounts, haalOpenVerslagenVoorAlleTrainers, haalMislukteTelefonieOproepenVoorAlleTrainers } from "@/lib/admin/trainers/aggregatie";
import { haalTrainingenEnScholenVoorAlleTrainers } from "@/lib/trainers/monday-links";

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
vi.mock("@/lib/trainers/monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/monday-links")>();
  return { ...echt, haalTrainingenEnScholenVoorAlleTrainers: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockTrainers = vi.mocked(haalAlleTrainerAccounts);
const mockOpenVerslagen = vi.mocked(haalOpenVerslagenVoorAlleTrainers);
const mockMislukt = vi.mocked(haalMislukteTelefonieOproepenVoorAlleTrainers);
const mockMonday = vi.mocked(haalTrainingenEnScholenVoorAlleTrainers);

function maakRequest() {
  return new NextRequest("http://localhost:3000/api/admin/trainers/aandacht");
}

const trainerA = { id: 1, naam: "Trainer A", email: "a@test.nl", actief: true, mondayUitvoerderItemId: "uitv-a", mondayTrainerboardId: "board-a", telefonieActief: false };

beforeEach(() => {
  mockVerify.mockReset();
  mockTrainers.mockReset();
  mockOpenVerslagen.mockReset();
  mockMislukt.mockReset();
  mockMonday.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
  mockTrainers.mockResolvedValue([]);
  mockOpenVerslagen.mockResolvedValue([]);
  mockMislukt.mockResolvedValue([]);
  mockMonday.mockResolvedValue({ trainingenPerTrainer: new Map(), scholenPerTrainer: new Map(), scholen: new Map(), trainingenPerSchool: new Map() });
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
    mockMislukt.mockResolvedValue([{ oproepId: 1, trainerId: 1, foutcode: "onbekende_fout", foutmelding: "fout", afgerondOp: "2026-08-20T00:00:00.000Z", gekozenMondaySchoolId: null, gekozenSchoolNaam: null, gekozenTrainingNaam: null }]);
    const response = await GET(maakRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.trainersMetVeelOudeVerslagen).toEqual([]);
  });

  // Correctieronde Admin Traineromgeving, vervolg (2026-08-25) — bewijst de
  // bedrading: de route geeft de admin-brede Monday-aggregatie nu door aan
  // bouwAdminAandachtOverzicht, zodat een vastgelopen verslag van een
  // inmiddels uit Monday verwijderde training hier ook daadwerkelijk wordt
  // uitgefilterd. De uitputtende matrix (verwijderd/overgedragen/string-
  // number/telefonie_mislukt-ongefilterd) staat in lib/admin/trainers/
  // aandacht.test.ts — hier alleen de end-to-end bevestiging dat de route de
  // whitelist ook echt doorgeeft.
  it("filtert een vastgelopen verslag van een uit Monday verwijderde training ook via deze route", async () => {
    mockTrainers.mockResolvedValue([trainerA]);
    mockMonday.mockResolvedValue({
      trainingenPerTrainer: new Map([["uitv-a", [{ id: "t1", naam: "T1", status: "gedaan", ruweStatusTekst: "Gedaan", datum: "2026-08-20", logboekIngevuld: false, trainerboardItemId: null, schoolId: "s1", schoolNaam: "School A" }]]]),
      scholenPerTrainer: new Map(),
      scholen: new Map(),
      trainingenPerSchool: new Map(),
    });
    mockOpenVerslagen.mockResolvedValue([
      { verslagId: 1, trainerId: 1, trainerNaam: "Trainer A", mondayTrainingId: "t-verwijderd", schoolId: "s1", schoolNaam: "School A", trainingNaam: "Verwijderd", status: "gedeeltelijk", bron: "portal", wanneer: "2026-08-20T00:00:00.000Z", telefonieOntvangenOp: null },
    ]);
    const response = await GET(maakRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(0);
  });
});
