import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalAlleTrainerAccounts, haalOpenVerslagenVoorAlleTrainers, haalAlleOpenStartActiesVoorAlleTrainers } from "@/lib/admin/trainers/aggregatie";
import { haalTrainingenEnScholenVoorAlleTrainers } from "@/lib/trainers/monday-links";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/admin/trainers/aggregatie", () => ({ haalAlleTrainerAccounts: vi.fn(), haalOpenVerslagenVoorAlleTrainers: vi.fn(), haalAlleOpenStartActiesVoorAlleTrainers: vi.fn() }));
vi.mock("@/lib/trainers/monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/monday-links")>();
  return { ...echt, haalTrainingenEnScholenVoorAlleTrainers: vi.fn() };
});

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockTrainers = vi.mocked(haalAlleTrainerAccounts);
const mockOpenVerslagen = vi.mocked(haalOpenVerslagenVoorAlleTrainers);
const mockOpenStartActies = vi.mocked(haalAlleOpenStartActiesVoorAlleTrainers);
const mockMonday = vi.mocked(haalTrainingenEnScholenVoorAlleTrainers);

function maakRequest(query = "") {
  return new NextRequest(`http://localhost:3000/api/admin/trainers/todo${query}`);
}

const trainerA = { id: 1, naam: "Trainer A", email: "a@test.nl", actief: true, mondayUitvoerderItemId: "uitv-a", mondayTrainerboardId: "board-a", telefonieActief: false };

beforeEach(() => {
  mockVerify.mockReset();
  mockTrainers.mockReset();
  mockOpenVerslagen.mockReset();
  mockOpenStartActies.mockReset();
  mockMonday.mockReset();
  mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
  mockTrainers.mockResolvedValue([trainerA]);
  mockOpenStartActies.mockResolvedValue([]);
  // Correctieronde Admin Traineromgeving (2026-08-25) — de actuele-
  // trainingenwhitelist (training-actualiteit.ts) vereist dat "t1" ook echt
  // in de (mock-)Monday-trainingenset van trainer A voorkomt, anders wordt
  // het openVerslag hieronder terecht als niet-actueel gefilterd (zie
  // lib/admin/trainers/todo.test.ts voor de dekking van die filtering zelf).
  mockMonday.mockResolvedValue({
    trainingenPerTrainer: new Map([
      ["uitv-a", [{ id: "t1", naam: "T1", status: "gedaan", ruweStatusTekst: "Gedaan", datum: "2026-08-20", logboekIngevuld: false, trainerboardItemId: null, bron: "mijnleerlijn", schoolId: "s1", schoolNaam: "School A" }]],
    ]),
    scholenPerTrainer: new Map(),
    scholen: new Map(),
    trainingenPerSchool: new Map(),
  });
  mockOpenVerslagen.mockResolvedValue([
    {
      verslagId: 1,
      trainerId: 1,
      trainerNaam: "Trainer A",
      mondayTrainingId: "t1",
      schoolId: "s1",
      schoolNaam: "School A",
      trainingNaam: "T1",
      status: "concept",
      bron: "telefoon",
      wanneer: new Date().toISOString(),
      telefonieOntvangenOp: new Date().toISOString(),
    },
  ]);
});

describe("GET /api/admin/trainers/todo — rechten", () => {
  it("weigert met 403 zonder geldige admin-sessie", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await GET(maakRequest());
    expect(response.status).toBe(403);
    expect(mockTrainers).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/trainers/todo — inhoud en filters", () => {
  it("geeft de to-do-lijst terug", async () => {
    const response = await GET(maakRequest());
    const body = await response.json();
    expect(body.todo).toHaveLength(1);
    expect(body.todo[0].soort).toBe("telefonisch_concept");
  });

  it("filtert op trainerId", async () => {
    const response = await GET(maakRequest("?trainerId=999"));
    const body = await response.json();
    expect(body.todo).toHaveLength(0);
  });

  it("filtert op soort", async () => {
    const responseMatch = await GET(maakRequest("?soort=telefonisch_concept"));
    expect((await responseMatch.json()).todo).toHaveLength(1);
    const responseGeenMatch = await GET(maakRequest("?soort=concept_gestart"));
    expect((await responseGeenMatch.json()).todo).toHaveLength(0);
  });

  // Startbegeleiding-ronde (2026-09-02, spec §E.1/§F) — een open startactie
  // moet ook in de admin-brede To-do-lijst verschijnen, met trainerId/
  // trainerNaam rechtstreeks van AdminOpenStartactie (geen aparte lookup).
  it("neemt een open startactie mee als to-do-item", async () => {
    mockOpenStartActies.mockResolvedValue([
      {
        id: 7,
        trainerId: 1,
        trainerNaam: "Trainer A",
        mondaySchoolId: "s2",
        schoolNaam: "School B",
        actieType: "intake",
        instructie: "Bel de directeur",
        deadline: "2026-09-10T00:00:00.000Z",
        gespreksDatum: null,
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
    const response = await GET(maakRequest());
    const body = await response.json();
    expect(body.todo).toHaveLength(2);
    const startactieItem = body.todo.find((t: { soort: string }) => t.soort === "startactie");
    expect(startactieItem).toMatchObject({ trainerId: 1, trainerNaam: "Trainer A", schoolId: "s2", schoolNaam: "School B", trainingId: "startactie:7" });
  });

  it("filtert een open startactie mee op trainerId/soort", async () => {
    mockOpenStartActies.mockResolvedValue([
      { id: 7, trainerId: 1, trainerNaam: "Trainer A", mondaySchoolId: "s2", schoolNaam: "School B", actieType: "intake", instructie: null, deadline: "2026-09-10T00:00:00.000Z", gespreksDatum: null, createdAt: "2026-09-01T00:00:00.000Z" },
    ]);
    const response = await GET(maakRequest("?soort=startactie"));
    const body = await response.json();
    expect(body.todo).toHaveLength(1);
    expect(body.todo[0].trainingId).toBe("startactie:7");
  });
});
