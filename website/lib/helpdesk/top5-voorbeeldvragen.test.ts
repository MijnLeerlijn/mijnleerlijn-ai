import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { haalTop5VoorbeeldVragen } from "./top5-voorbeeldvragen";

const mockFind = vi.fn();
const VARIANT_ID = "1";

function maakPayload(): Payload {
  return { find: mockFind } as unknown as Payload;
}

function variantFilter() {
  return { or: [{ variantContext: { equals: VARIANT_ID } }, { variantContext: { exists: false } }] };
}

beforeEach(() => {
  mockFind.mockReset();
});

// Homepage-herontwerp (2026-07-29): eerst vastgezette vragen, dan aangevuld
// tot 5 met de meest gestelde — zie app/(frontend)/(public)/page.tsx en de
// toelichting in payload/components/HelpdeskVragenView.tsx.
// Multi-brand variants (2026-07-30): elke selectie is beperkt tot vragen
// die leeg (universeel) of aan de opgegeven variant gekoppeld zijn.
describe("haalTop5VoorbeeldVragen", () => {
  it("toont eerst alle vastgezette vragen, dan aangevuld met de meest gestelde", async () => {
    mockFind
      .mockResolvedValueOnce({ docs: [{ vraag: "Vastgezette vraag 1" }, { vraag: "Vastgezette vraag 2" }] })
      .mockResolvedValueOnce({
        docs: [{ vraag: "Meest gestelde vraag A" }, { vraag: "Meest gestelde vraag B" }, { vraag: "Meest gestelde vraag C" }],
      });

    const resultaat = await haalTop5VoorbeeldVragen(maakPayload(), VARIANT_ID);

    expect(resultaat).toEqual([
      "Vastgezette vraag 1",
      "Vastgezette vraag 2",
      "Meest gestelde vraag A",
      "Meest gestelde vraag B",
      "Meest gestelde vraag C",
    ]);
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "helpdesk-vragen",
        where: { and: [{ pinned: { equals: true } }, { verborgen: { equals: false } }, variantFilter()] },
        limit: 5,
      })
    );
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "helpdesk-vragen",
        where: { and: [{ pinned: { equals: false } }, { verborgen: { equals: false } }, variantFilter()] },
        limit: 3,
      })
    );
  });

  it("vult niet aan als er al 5 vastgezette vragen zijn (aanvulling wordt niet eens opgehaald)", async () => {
    mockFind.mockResolvedValueOnce({
      docs: [
        { vraag: "1" }, { vraag: "2" }, { vraag: "3" }, { vraag: "4" }, { vraag: "5" }, { vraag: "6 (te veel)" },
      ],
    });

    const resultaat = await haalTop5VoorbeeldVragen(maakPayload(), VARIANT_ID);

    expect(resultaat).toEqual(["1", "2", "3", "4", "5"]);
    expect(mockFind).toHaveBeenCalledTimes(1);
  });

  it("geeft alleen de meest gestelde vragen terug als er geen vastgezette vragen zijn", async () => {
    mockFind
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ vraag: "Populair" }] });

    const resultaat = await haalTop5VoorbeeldVragen(maakPayload(), VARIANT_ID);

    expect(resultaat).toEqual(["Populair"]);
  });

  it("geeft een lege lijst terug als er nog helemaal geen vragen zijn", async () => {
    mockFind.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [] });

    const resultaat = await haalTop5VoorbeeldVragen(maakPayload(), VARIANT_ID);

    expect(resultaat).toEqual([]);
  });
});
