import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { bepaalWachtenOp } from "./wachten-op";

const mockFind = vi.fn();
function maakPayload(): Payload {
  return { find: mockFind } as unknown as Payload;
}

function actie(overrides: Record<string, unknown>) {
  return {
    id: 1,
    dueDate: "2026-08-25T09:00:00.000Z",
    school: { id: 10, schoolName: "Testschool", relatiestatus: "Prospect", plaats: "Zwolle", actief: true },
    sourceProposal: {
      id: 5,
      relatieAnalyse: {
        wieIsAanZet: "school",
        laatsteContactSamenvatting: "School bespreekt intern en komt terug.",
        laatsteEchteContactDatum: "2026-08-10T00:00:00.000Z",
        afspraken: [{ tekst: "We bespreken dit intern en laten het weten", wie: "school" }],
      },
    },
    ...overrides,
  };
}

describe("bepaalWachtenOp — uitsluitend bestaande Sales-data, geen nieuwe opslag", () => {
  beforeEach(() => {
    mockFind.mockReset().mockResolvedValue({ docs: [] });
  });

  it("vraagt uitsluitend open sales-actions op, met depth:1 voor school + sourceProposal", async () => {
    await bepaalWachtenOp(maakPayload());

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "sales-actions", where: { status: { equals: "open" } }, depth: 1 })
    );
  });

  it("neemt een school op wiens open actie voortkomt uit een voorstel met wieIsAanZet: 'school'", async () => {
    mockFind.mockResolvedValue({ docs: [actie({})] });

    const items = await bepaalWachtenOp(maakPayload());

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      schoolId: 10,
      schoolName: "Testschool",
      waaropWachten: "We bespreken dit intern en laten het weten",
      sindsWanneer: "2026-08-10T00:00:00.000Z",
      vervolgdatum: "2026-08-25",
      actionId: 1,
    });
  });

  it("valt terug op laatsteContactSamenvatting wanneer er geen afspraak van de school zelf is", async () => {
    mockFind.mockResolvedValue({
      docs: [actie({ sourceProposal: { id: 5, relatieAnalyse: { wieIsAanZet: "school", laatsteContactSamenvatting: "Laatste contact was positief.", afspraken: [] } } })],
    });

    const items = await bepaalWachtenOp(maakPayload());

    expect(items[0]!.waaropWachten).toBe("Laatste contact was positief.");
  });

  it("sluit een actie uit waarvan wieIsAanZet 'michel' of 'onduidelijk' is — dat is geen 'wachten op de school'", async () => {
    mockFind.mockResolvedValue({
      docs: [
        actie({ id: 1, sourceProposal: { id: 5, relatieAnalyse: { wieIsAanZet: "michel" } } }),
        actie({ id: 2, sourceProposal: { id: 6, relatieAnalyse: { wieIsAanZet: "onduidelijk" } } }),
      ],
    });

    const items = await bepaalWachtenOp(maakPayload());

    expect(items).toEqual([]);
  });

  it("sluit een handmatig aangemaakte actie uit — geen sourceProposal betekent geen basis voor 'wie is aan zet'", async () => {
    mockFind.mockResolvedValue({ docs: [actie({ sourceProposal: null })] });

    const items = await bepaalWachtenOp(maakPayload());

    expect(items).toEqual([]);
  });

  it("sluit een niet-actieve school uit (Inactief/Gestopt), ook met wieIsAanZet: 'school'", async () => {
    mockFind.mockResolvedValue({
      docs: [actie({ school: { id: 10, schoolName: "Testschool", actief: false } })],
    });

    const items = await bepaalWachtenOp(maakPayload());

    expect(items).toEqual([]);
  });

  it("sorteert op langst-wachtend eerst (oudste sindsWanneer), ontbrekende datum altijd achteraan", async () => {
    mockFind.mockResolvedValue({
      docs: [
        actie({ id: 1, school: { id: 1, schoolName: "Recent", actief: true }, sourceProposal: { id: 1, relatieAnalyse: { wieIsAanZet: "school", laatsteEchteContactDatum: "2026-08-15T00:00:00.000Z", laatsteContactSamenvatting: "x" } } }),
        actie({ id: 2, school: { id: 2, schoolName: "Onbekend", actief: true }, sourceProposal: { id: 2, relatieAnalyse: { wieIsAanZet: "school", laatsteEchteContactDatum: null, laatsteContactSamenvatting: "x" } } }),
        actie({ id: 3, school: { id: 3, schoolName: "Langst", actief: true }, sourceProposal: { id: 3, relatieAnalyse: { wieIsAanZet: "school", laatsteEchteContactDatum: "2026-07-01T00:00:00.000Z", laatsteContactSamenvatting: "x" } } }),
      ],
    });

    const items = await bepaalWachtenOp(maakPayload());

    expect(items.map((i) => i.schoolName)).toEqual(["Langst", "Recent", "Onbekend"]);
  });

  it("geeft een lege lijst terug wanneer er niets is (niet: fout)", async () => {
    const items = await bepaalWachtenOp(maakPayload());
    expect(items).toEqual([]);
  });
});
