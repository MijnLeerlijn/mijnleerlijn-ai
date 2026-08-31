import { describe, it, expect, vi, beforeEach } from "vitest";
import { maakAanvullendeTraining, wijzigAanvullendeTraining, haalAanvullendeTrainingVoorMutatie, haalAanvullendeTrainingenAlsSamenvattingen, codeerAanvullendeTrainingId } from "./aanvullende-trainingen";
import { haalAlleAanvullendeTrainingen } from "@/lib/admin/trainers/aggregatie";
import { haalSchoolDetail, type SchoolDetail } from "./monday-links";
import { maakFakePayload } from "@/lib/support/fake-payload";
import type { AuthTrainer } from "./auth";

// Productiecheck-bugfix (2026-08-31, bug 1) — dekt lib/trainers/
// aanvullende-trainingen.ts se maakAanvullendeTraining/wijzigAanvullende
// Training/haalAanvullendeTrainingVoorMutatie. Deze drie hadden vóór deze
// ronde GEEN dedicated testbestand (alleen indirect via kandidaten.test.ts/
// dashboard.test.ts/verslag.test.ts, die elk maar één smal aspect raken) —
// dit bestand sluit dat gat, naast de nieuwe wijzig-functionaliteit zelf.
// Zelfde mockpatroon als verslag.test.ts: alleen haalSchoolDetail
// (monday-links.ts) gemockt, de rest draait echt tegen fake-payload.
vi.mock("./monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./monday-links")>();
  return { ...echt, haalSchoolDetail: vi.fn() };
});

const mockHaalSchoolDetail = vi.mocked(haalSchoolDetail);

const TRAINER: AuthTrainer = { id: 1, name: "Wessel Kok", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };
const ANDERE_TRAINER: AuthTrainer = { ...TRAINER, id: 2, name: "Andere Trainer" };
const SCHOOL_ID = "500";

function schoolDetail(overrides: Partial<SchoolDetail> = {}): SchoolDetail {
  return {
    id: SCHOOL_ID,
    naam: "Montessori Gorinchem",
    onderwijstype: null,
    locatie: null,
    implementatiefase: null,
    contactpersoonNaam: null,
    contactpersoonBetrouwbaar: false,
    bron: "trainer-relatie",
    trainingen: { verslag_nog_invullen: [], vandaag: [], komend: [], open: [], gedaan: [], geannuleerd: [] },
    logboek: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockHaalSchoolDetail.mockReset();
});

// ---------------------------------------------------------------------------
// 1. Aanmaken
// ---------------------------------------------------------------------------
describe("maakAanvullendeTraining", () => {
  it("maakt een aanvullende training aan met naam+datum, trainer automatisch gekoppeld", async () => {
    mockHaalSchoolDetail.mockResolvedValue(schoolDetail());
    const { payload } = maakFakePayload({});

    const uitkomst = await maakAanvullendeTraining(payload, TRAINER, { mondaySchoolId: SCHOOL_ID, naam: "Coachgesprek rekenen", datum: "2026-09-10" });

    expect(uitkomst.soort).toBe("ok");
    if (uitkomst.soort !== "ok") return;
    expect(uitkomst.training.naam).toBe("Coachgesprek rekenen");
    expect(uitkomst.training.datum).toBe("2026-09-10");
    expect(uitkomst.training.mondaySchoolId).toBe(SCHOOL_ID);
  });

  it("ongeldige_invoer bij een lege naam", async () => {
    mockHaalSchoolDetail.mockResolvedValue(schoolDetail());
    const { payload } = maakFakePayload({});
    const uitkomst = await maakAanvullendeTraining(payload, TRAINER, { mondaySchoolId: SCHOOL_ID, naam: "   ", datum: "2026-09-10" });
    expect(uitkomst.soort).toBe("ongeldige_invoer");
  });

  it("niet_gevonden wanneer de school niet (meer) bij deze trainer hoort — anti-enumeratie", async () => {
    mockHaalSchoolDetail.mockResolvedValue(null);
    const { payload } = maakFakePayload({});
    const uitkomst = await maakAanvullendeTraining(payload, TRAINER, { mondaySchoolId: "onbekend", naam: "Coachgesprek", datum: "2026-09-10" });
    expect(uitkomst.soort).toBe("niet_gevonden");
  });
});

// ---------------------------------------------------------------------------
// 2/3/4. Wijzigen — datum, naam, ID blijft gelijk
// ---------------------------------------------------------------------------
describe("wijzigAanvullendeTraining", () => {
  function seed(overrides: Record<string, unknown> = {}) {
    return maakFakePayload({
      "aanvullende-trainingen": [{ id: 10, trainer: TRAINER.id, mondaySchoolId: SCHOOL_ID, schoolNaam: "Montessori Gorinchem", naam: "Coachgesprek rekenen", datum: "2026-09-10T00:00:00.000Z", ...overrides }],
    });
  }

  it("wijzigt de datum van een eigen aanvullende training", async () => {
    const { payload } = seed();
    const uitkomst = await wijzigAanvullendeTraining(payload, TRAINER, 10, { naam: "Coachgesprek rekenen", datum: "2026-09-17" });
    expect(uitkomst.soort).toBe("ok");
    if (uitkomst.soort !== "ok") return;
    expect(uitkomst.training.datum).toBe("2026-09-17");
  });

  it("wijzigt de naam van een eigen aanvullende training", async () => {
    const { payload } = seed();
    const uitkomst = await wijzigAanvullendeTraining(payload, TRAINER, 10, { naam: "Coachgesprek taal", datum: "2026-09-10" });
    expect(uitkomst.soort).toBe("ok");
    if (uitkomst.soort !== "ok") return;
    expect(uitkomst.training.naam).toBe("Coachgesprek taal");
  });

  it("het ID blijft exact gelijk vóór en na een wijziging — bestaande verslagen/logboekitems (gekoppeld via 'aanvullend:<id>') blijven dus gekoppeld", async () => {
    const { payload } = seed();
    const uitkomst = await wijzigAanvullendeTraining(payload, TRAINER, 10, { naam: "Nieuwe naam", datum: "2026-09-20" });
    expect(uitkomst.soort).toBe("ok");
    if (uitkomst.soort !== "ok") return;
    expect(uitkomst.training.id).toBe(10);
    expect(codeerAanvullendeTrainingId(uitkomst.training.id)).toBe("aanvullend:10");
  });

  it("een ANDERE trainer met live-geverifieerde toegang tot de school mag ook wijzigen (zelfde regel als verslag maken voor andermans aanvullende training)", async () => {
    mockHaalSchoolDetail.mockResolvedValue(schoolDetail());
    const { payload } = seed();
    const uitkomst = await wijzigAanvullendeTraining(payload, ANDERE_TRAINER, 10, { naam: "Bijgewerkt door collega", datum: "2026-09-10" });
    expect(uitkomst.soort).toBe("ok");
  });

  it("7. een trainer ZONDER toegang tot de school kan de aanvullende training niet wijzigen — niet_gevonden, nooit een ander statuscode (anti-enumeratie)", async () => {
    mockHaalSchoolDetail.mockResolvedValue(null);
    const { payload } = seed();
    const uitkomst = await wijzigAanvullendeTraining(payload, ANDERE_TRAINER, 10, { naam: "Poging", datum: "2026-09-10" });
    expect(uitkomst.soort).toBe("niet_gevonden");
  });

  it("niet_gevonden bij een niet-bestaand ID", async () => {
    const { payload } = maakFakePayload({});
    const uitkomst = await wijzigAanvullendeTraining(payload, TRAINER, 999, { naam: "x", datum: "2026-09-10" });
    expect(uitkomst.soort).toBe("niet_gevonden");
  });

  it("ongeldige_invoer bij een lege naam of onherkenbare datum, rij blijft ongewijzigd", async () => {
    const { payload } = seed();
    expect((await wijzigAanvullendeTraining(payload, TRAINER, 10, { naam: "  ", datum: "2026-09-10" })).soort).toBe("ongeldige_invoer");
    expect((await wijzigAanvullendeTraining(payload, TRAINER, 10, { naam: "Geldige naam", datum: "geen-datum" })).soort).toBe("ongeldige_invoer");
  });
});

// ---------------------------------------------------------------------------
// 7 (herbevestiging op leesniveau). "Andere trainer kan aanvullende training
// niet via directe URL openen" — dit is letterlijk haalAanvullendeTraining
// VoorMutatie, de functie achter zowel de verslagpagina als (indirect) de
// nieuwe wijzig-route.
// ---------------------------------------------------------------------------
describe("haalAanvullendeTrainingVoorMutatie — toegangscontrole (bug 2-testplan punt 7)", () => {
  it("de eigen trainer kan de training altijd openen, zonder een Monday-schoolcheck nodig te hebben", async () => {
    const { payload } = maakFakePayload({
      "aanvullende-trainingen": [{ id: 20, trainer: TRAINER.id, mondaySchoolId: SCHOOL_ID, schoolNaam: "Montessori Gorinchem", naam: "Coachgesprek", datum: "2026-09-10T00:00:00.000Z" }],
    });
    const gevonden = await haalAanvullendeTrainingVoorMutatie(payload, TRAINER, "aanvullend:20");
    expect(gevonden).not.toBeNull();
    expect(mockHaalSchoolDetail).not.toHaveBeenCalled();
  });

  it("een andere trainer ZONDER toegang tot de school krijgt null — kan de training dus niet via een geraden/gedeelde URL openen", async () => {
    mockHaalSchoolDetail.mockResolvedValue(null);
    const { payload } = maakFakePayload({
      "aanvullende-trainingen": [{ id: 21, trainer: TRAINER.id, mondaySchoolId: SCHOOL_ID, schoolNaam: "Montessori Gorinchem", naam: "Coachgesprek", datum: "2026-09-10T00:00:00.000Z" }],
    });
    const gevonden = await haalAanvullendeTrainingVoorMutatie(payload, ANDERE_TRAINER, "aanvullend:21");
    expect(gevonden).toBeNull();
  });

  it("een niet-bestaand aanvullend-ID geeft null, ononderscheidbaar van 'geen toegang'", async () => {
    const { payload } = maakFakePayload({});
    const gevonden = await haalAanvullendeTrainingVoorMutatie(payload, TRAINER, "aanvullend:999");
    expect(gevonden).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. Gewijzigde datum verschijnt correct in de planning/het trainingenoverzicht
// ---------------------------------------------------------------------------
describe("wijzigAanvullendeTraining -> haalAanvullendeTrainingenAlsSamenvattingen (planning/schooldetail)", () => {
  it("de nieuwe datum is direct zichtbaar — geen cache, elke aanroep leest de rij vers", async () => {
    const { payload } = maakFakePayload({
      "aanvullende-trainingen": [{ id: 30, trainer: TRAINER.id, mondaySchoolId: SCHOOL_ID, schoolNaam: "Montessori Gorinchem", naam: "Coachgesprek", datum: "2026-09-10T00:00:00.000Z" }],
    });

    await wijzigAanvullendeTraining(payload, TRAINER, 30, { naam: "Coachgesprek", datum: "2026-09-25" });
    const lijst = await haalAanvullendeTrainingenAlsSamenvattingen(payload, TRAINER);

    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatchObject({ datum: "2026-09-25", id: "aanvullend:30" });
  });
});

// ---------------------------------------------------------------------------
// 10. Upsell blijft exact één aanvullende training tellen na een wijziging
// ---------------------------------------------------------------------------
describe("wijzigAanvullendeTraining -> haalAlleAanvullendeTrainingen (upsell-telling, admin)", () => {
  it("een wijziging verandert het aantal rijen niet — nog steeds precies 1, zelfde ID, alleen naam/datum anders", async () => {
    const { payload } = maakFakePayload({
      "aanvullende-trainingen": [{ id: 40, trainer: TRAINER.id, mondaySchoolId: SCHOOL_ID, schoolNaam: "Montessori Gorinchem", naam: "Coachgesprek", datum: "2026-09-10T00:00:00.000Z" }],
    });

    const voor = await haalAlleAanvullendeTrainingen(payload);
    expect(voor).toHaveLength(1);

    await wijzigAanvullendeTraining(payload, TRAINER, 40, { naam: "Coachgesprek (gewijzigd)", datum: "2026-09-11" });

    const na = await haalAlleAanvullendeTrainingen(payload);
    expect(na).toHaveLength(1);
    expect(na[0]).toMatchObject({ id: voor[0]?.id, naam: "Coachgesprek (gewijzigd)", datum: "2026-09-11" });
  });
});
