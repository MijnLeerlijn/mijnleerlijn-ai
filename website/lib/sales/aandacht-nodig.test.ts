import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { vindActieveScholenZonderVervolgactie } from "./aandacht-nodig";

const mockFind = vi.fn();
function maakPayload(): Payload {
  return { find: mockFind } as unknown as Payload;
}

describe("vindActieveScholenZonderVervolgactie", () => {
  beforeEach(() => {
    mockFind.mockReset();
  });

  it("sluit een school met een open actie uit", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ id: 1, schoolName: "A" }, { id: 2, schoolName: "B" }] });
      if (collection === "sales-actions") return Promise.resolve({ docs: [{ school: 1 }] });
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindActieveScholenZonderVervolgactie(maakPayload());

    expect(resultaat.map((s) => s.id)).toEqual([2]);
  });

  it("sluit een school met een pending volgende_actie- of bestaande_vervolgdatum-voorstel uit", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ id: 1 }, { id: 2 }] });
      if (collection === "sales-proposals") return Promise.resolve({ docs: [{ school: 2 }] });
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindActieveScholenZonderVervolgactie(maakPayload());

    expect(resultaat.map((s) => s.id)).toEqual([1]);
  });

  it("bevraagt pending voorstellen uitsluitend op volgende_actie/bestaande_vervolgdatum — een veld_correctie-voorstel sluit een school niet uit", async () => {
    mockFind.mockImplementation(({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ id: 1 }] });
      if (collection === "sales-proposals") {
        // De aanroep zelf moet al filteren op proposalType — bevestig dat hier.
        expect(where?.proposalType).toEqual({ in: ["volgende_actie", "bestaande_vervolgdatum"] });
        return Promise.resolve({ docs: [] });
      }
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await vindActieveScholenZonderVervolgactie(maakPayload());

    expect(resultaat.map((s) => s.id)).toEqual([1]);
  });

  it("bevraagt sales-schools altijd met actief: true", async () => {
    mockFind.mockImplementation(({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
      if (collection === "sales-schools") {
        expect(where).toEqual({ actief: { equals: true } });
        return Promise.resolve({ docs: [] });
      }
      return Promise.resolve({ docs: [] });
    });

    await vindActieveScholenZonderVervolgactie(maakPayload());
  });
});
