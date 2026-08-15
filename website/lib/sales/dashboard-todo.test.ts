import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { haalTodoItems } from "./dashboard-todo";
import { vindActieveScholenZonderVervolgactie } from "./aandacht-nodig";

vi.mock("./aandacht-nodig", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./aandacht-nodig")>();
  return { ...echt, vindActieveScholenZonderVervolgactie: vi.fn() };
});

const mockVeiligheidsnet = vi.mocked(vindActieveScholenZonderVervolgactie);
const mockFind = vi.fn();

function maakPayload(): Payload {
  return { find: mockFind } as unknown as Payload;
}

describe("haalTodoItems", () => {
  beforeEach(() => {
    mockFind.mockReset().mockResolvedValue({ docs: [] });
    mockVeiligheidsnet.mockReset().mockResolvedValue([]);
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
          school: { id: 10, schoolName: "Testschool", relatiestatus: "Prospect", plaats: "Zwolle" },
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
        school: { id: 10, schoolName: "Testschool", relatiestatus: "Prospect", plaats: "Zwolle" },
      },
    ]);
  });

  it("neemt het 'mogelijk afgesloten/inactief'-signaal over van vindActieveScholenZonderVervolgactie — geen tweede takenmodel", async () => {
    mockVeiligheidsnet.mockResolvedValue([
      { id: 20, schoolName: "Stille school", relatiestatus: "Lead", salesfase: null, plaats: "Utrecht", lastMondayActivityAt: null, mondayVolgendeActieDatum: null },
    ]);

    const resultaat = await haalTodoItems(maakPayload());

    expect(resultaat.mogelijkAfgeslotenScholen).toHaveLength(1);
    expect(resultaat.mogelijkAfgeslotenScholen[0]!.schoolName).toBe("Stille school");
    expect(mockVeiligheidsnet).toHaveBeenCalledTimes(1);
  });

  it("geeft lege lijsten terug wanneer er niets is (niet: fout)", async () => {
    const resultaat = await haalTodoItems(maakPayload());
    expect(resultaat).toEqual({ proposals: [], mogelijkAfgeslotenScholen: [] });
  });
});
