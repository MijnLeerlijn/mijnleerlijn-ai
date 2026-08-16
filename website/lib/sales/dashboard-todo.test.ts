import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { haalTodoItems } from "./dashboard-todo";
import { vindScholenZonderVervolgactieGesplitst } from "./aandacht-nodig";

vi.mock("./aandacht-nodig", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./aandacht-nodig")>();
  return { ...echt, vindScholenZonderVervolgactieGesplitst: vi.fn() };
});

const mockAandacht = vi.mocked(vindScholenZonderVervolgactieGesplitst);
const mockFind = vi.fn();

function maakPayload(): Payload {
  return { find: mockFind } as unknown as Payload;
}

const LEGE_AANDACHT = { zonderVervolgactie: [], geplandInMonday: [] };

describe("haalTodoItems", () => {
  beforeEach(() => {
    mockFind.mockReset().mockResolvedValue({ docs: [] });
    mockAandacht.mockReset().mockResolvedValue(LEGE_AANDACHT);
  });

  it("haalt sales-proposals op met status pending of conflict — dekt volgende_actie/veld_correctie/bestaande_vervolgdatum/write-back-conflicten zonder nieuw veld", async () => {
    await haalTodoItems(maakPayload());

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "sales-proposals",
        where: expect.objectContaining({ status: { in: ["pending", "conflict"] } }),
      })
    );
  });

  it("sluit 'laag'-vertrouwen voorstellen uit — zelfde conventie als de rest van Sales", async () => {
    await haalTodoItems(maakPayload());

    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ confidence: { not_equals: "laag" } }) }));
  });

  it("geeft de proposals gemapt terug met schoolgegevens", async () => {
    mockFind.mockResolvedValue({
      docs: [
        {
          id: 1,
          proposalText: "Bel deze school",
          reason: "Al 90 dagen geen contact",
          proposalType: "volgende_actie",
          confidence: "hoog",
          status: "pending",
          school: { id: 10, schoolName: "Testschool", relatiestatus: "Prospect", plaats: "Zwolle", actief: true },
        },
      ],
    });

    const resultaat = await haalTodoItems(maakPayload());

    expect(resultaat.proposals).toEqual([
      {
        id: 1,
        proposalText: "Bel deze school",
        reason: "Al 90 dagen geen contact",
        proposalType: "volgende_actie",
        confidence: "hoog",
        status: "pending",
        proposedValue: null,
        targetColumnId: null,
        proposedDate: null,
        proposedType: null,
        proposedChannel: null,
        school: { id: 10, schoolName: "Testschool", relatiestatus: "Prospect", plaats: "Zwolle", actief: true },
      },
    ]);
  });

  it("Productiecorrectie punt 8 — filtert een voorstel uit voor een school die niet (meer) actief is (Inactief/Gestopt)", async () => {
    mockFind.mockResolvedValue({
      docs: [
        { id: 1, proposalText: "Actieve school", proposalType: "volgende_actie", status: "pending", school: { id: 10, schoolName: "Actief", actief: true } },
        { id: 2, proposalText: "Inactieve school", proposalType: "volgende_actie", status: "pending", school: { id: 11, schoolName: "Werd Inactief", actief: false } },
      ],
    });

    const resultaat = await haalTodoItems(maakPayload());

    expect(resultaat.proposals.map((p) => p.id)).toEqual([1]);
  });

  it("neemt het 'zonder vervolgactie'-signaal over van vindScholenZonderVervolgactieGesplitst — geen tweede takenmodel", async () => {
    mockAandacht.mockResolvedValue({
      zonderVervolgactie: [{ id: 20, schoolName: "Stille school", relatiestatus: "Lead", salesfase: null, plaats: "Utrecht", lastMondayActivityAt: null, mondayVolgendeActieDatum: null }],
      geplandInMonday: [],
    });

    const resultaat = await haalTodoItems(maakPayload());

    expect(resultaat.zonderVervolgactie).toHaveLength(1);
    expect(resultaat.zonderVervolgactie[0]!.schoolName).toBe("Stille school");
    expect(mockAandacht).toHaveBeenCalledTimes(1);
  });

  it("geeft geplandInMonday apart terug, nooit vermengd met zonderVervolgactie — root cause punt 13", async () => {
    mockAandacht.mockResolvedValue({
      zonderVervolgactie: [],
      geplandInMonday: [{ id: 21, schoolName: "Winterkoninkje", relatiestatus: "Lead", salesfase: "Afspraak plannen", plaats: null, lastMondayActivityAt: null, mondayVolgendeActieDatum: "2026-11-03" }],
    });

    const resultaat = await haalTodoItems(maakPayload());

    expect(resultaat.geplandInMonday).toHaveLength(1);
    expect(resultaat.zonderVervolgactie).toEqual([]);
  });

  it("geeft lege lijsten terug wanneer er niets is (niet: fout)", async () => {
    const resultaat = await haalTodoItems(maakPayload());
    expect(resultaat).toEqual({ proposals: [], zonderVervolgactie: [], geplandInMonday: [] });
  });
});
