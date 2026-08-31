import { describe, it, expect, vi, beforeEach } from "vitest";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { haalStartbegeleidingScholen, haalStartbegeleidingSchool } from "@/lib/trainers/startbegeleiding";
import { haalAdminStartbegeleidingScholen, haalAdminStartbegeleidingSchoolDetail } from "./startbegeleiding";

// Startbegeleiding-ronde (2026-09-02, spec §D/§13) — dekt de admin-brede
// compositielaag (lib/admin/trainers/startbegeleiding.ts): verrijkt de live
// Monday-scholenlijst/-detail met trainernamen + open-actietelling, ZONDER
// zelf een tweede Monday-aanroep te doen — vandaar dat haalStartbegeleidingScholen/
// haalStartbegeleidingSchool (lib/trainers/startbegeleiding.ts) hier gemockt
// worden: dat leespad heeft z'n eigen, aparte testdekking
// (lib/trainers/startbegeleiding.test.ts), hier alleen de verrijking zelf.
vi.mock("@/lib/trainers/startbegeleiding", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/startbegeleiding")>();
  return { ...echt, haalStartbegeleidingScholen: vi.fn(), haalStartbegeleidingSchool: vi.fn() };
});

const mockScholen = vi.mocked(haalStartbegeleidingScholen);
const mockSchool = vi.mocked(haalStartbegeleidingSchool);

beforeEach(() => {
  mockScholen.mockReset();
  mockSchool.mockReset();
});

describe("haalAdminStartbegeleidingScholen", () => {
  it("verrijkt elke school met trainernamen (via mondayUitvoerderItemId) en de open-actietelling", async () => {
    mockScholen.mockResolvedValue([
      { id: "s1", naam: "School A", onderwijstype: "Basisschool", locatie: "Utrecht", relatiestatus: "Klant", gekoppeldeTrainerMondayIds: ["uitv-1"] },
      { id: "s2", naam: "School B", onderwijstype: null, locatie: null, relatiestatus: "Wacht op handtekening", gekoppeldeTrainerMondayIds: [] },
    ]);
    const { payload } = maakFakePayload({
      "trainer-accounts": [{ id: 10, name: "Anne Trainer", email: "a@test.nl", actief: true, mondayUitvoerderItemId: "uitv-1", mondayTrainerboardId: "board-1", telefonieActief: false }],
      "start-acties": [{ id: 1, trainer: { id: 10, name: "Anne Trainer" }, mondaySchoolId: "s1", schoolNaam: "School A", actieType: "intake", instructie: null, deadline: "2026-09-10T00:00:00.000Z", gespreksDatum: null, status: "open", afgerondOp: null, createdAt: "2026-09-01T00:00:00.000Z" }],
    });

    const scholen = await haalAdminStartbegeleidingScholen(payload);
    const schoolA = scholen.find((s) => s.id === "s1");
    const schoolB = scholen.find((s) => s.id === "s2");
    expect(schoolA).toMatchObject({ gekoppeldeTrainerNamen: ["Anne Trainer"], aantalOpenStartActies: 1 });
    expect(schoolB).toMatchObject({ gekoppeldeTrainerNamen: [], aantalOpenStartActies: 0 });
  });

  it("valt terug op 'Onbekende trainer' voor een gekoppeld Monday-ID zonder bijpassend traineraccount", async () => {
    mockScholen.mockResolvedValue([{ id: "s1", naam: "School A", onderwijstype: null, locatie: null, relatiestatus: "Klant", gekoppeldeTrainerMondayIds: ["uitv-onbekend"] }]);
    const { payload } = maakFakePayload({ "trainer-accounts": [], "start-acties": [] });
    const [school] = await haalAdminStartbegeleidingScholen(payload);
    expect(school?.gekoppeldeTrainerNamen).toEqual(["Onbekende trainer"]);
  });
});

describe("haalAdminStartbegeleidingSchoolDetail", () => {
  it("geeft null terug wanneer de school niet (meer) onder Startbegeleiding valt", async () => {
    mockSchool.mockResolvedValue(null);
    const { payload } = maakFakePayload({ "trainer-accounts": [], "start-acties": [] });
    const detail = await haalAdminStartbegeleidingSchoolDetail(payload, "onbekend");
    expect(detail).toBeNull();
  });

  it("levert school + gekoppelde trainers + uitsluitend DEZE school se open startacties + volledige trainerkeuzelijst", async () => {
    mockSchool.mockResolvedValue({ id: "s1", naam: "School A", onderwijstype: "Basisschool", locatie: "Utrecht", relatiestatus: "Klant", gekoppeldeTrainerMondayIds: ["uitv-1"] });
    const { payload } = maakFakePayload({
      "trainer-accounts": [
        { id: 10, name: "Anne Trainer", email: "a@test.nl", actief: true, mondayUitvoerderItemId: "uitv-1", mondayTrainerboardId: "board-1", telefonieActief: false },
        { id: 20, name: "Inactieve Trainer", email: "b@test.nl", actief: false, mondayUitvoerderItemId: "uitv-2", mondayTrainerboardId: "board-2", telefonieActief: false },
      ],
      "start-acties": [
        { id: 1, trainer: { id: 10, name: "Anne Trainer" }, mondaySchoolId: "s1", schoolNaam: "School A", actieType: "intake", instructie: null, deadline: "2026-09-10T00:00:00.000Z", gespreksDatum: null, status: "open", afgerondOp: null, createdAt: "2026-09-01T00:00:00.000Z" },
        { id: 2, trainer: { id: 10, name: "Anne Trainer" }, mondaySchoolId: "s2-andere-school", schoolNaam: "School B", actieType: "anders", instructie: null, deadline: "2026-09-11T00:00:00.000Z", gespreksDatum: null, status: "open", afgerondOp: null, createdAt: "2026-09-01T00:00:00.000Z" },
      ],
    });

    const detail = await haalAdminStartbegeleidingSchoolDetail(payload, "s1");
    expect(detail?.school.naam).toBe("School A");
    expect(detail?.gekoppeldeTrainers).toEqual([{ id: 10, naam: "Anne Trainer", actief: true }]);
    expect(detail?.openStartActies.map((a) => a.mondaySchoolId)).toEqual(["s1"]); // niet s2-andere-school
    expect(detail?.trainerOpties.map((t) => t.id).sort()).toEqual([10, 20]); // ook de inactieve trainer, voor de actieformulieren
  });
});
