import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { haalItemsMetKolomWaarden } from "./monday-client";

// Root-cause-fix (2026-09-03, vervolg op de Board-5/Mijn-scholen-fix) —
// dekt UITSLUITEND de limit-regressie in haalItemsMetKolomWaarden: Monday's
// `items(ids:)`-veld heeft een EIGEN `limit`-argument met `defaultValue: "25"`
// (live bevestigd via schema-introspectie), dat ook gold wanneer er méér dan
// 25 ID's in `ids:` stonden — geen fout, gewoon stilzwijgend de eerste 25.
// Live gereproduceerd tegen Michels 37 echte school-ID's (37 aangevraagd, 25
// terug) en verholpen door `limit: $limit` expliciet op MAX_ITEMS_PER_QUERY
// (100) te zetten. Bewust GEEN bredere dekking van monday-client.ts hier —
// dat is buiten de scope van deze reparatieronde.
//
// mondayLikeFetchMock() bootst Monday's EIGEN kortingsgedrag na (limit
// ongeacht ids.length, default 25 zonder expliciete limit) — dat maakt dit
// een échte regressietest: zonder de fix in de productiecode (geen
// limit-variabele meegegeven) zou test 1 hieronder weer maar 25 items
// teruggeven i.p.v. 37, en falen.

const MONDAY_ITEMS_DEFAULT_LIMIET = 25; // Monday's eigen items(ids:)-default, zie de toelichting in monday-client.ts
const MAX_ITEMS_PER_QUERY = 100; // gespiegeld van de private const in monday-client.ts — batchgrens van haalItemsMetKolomWaarden

function mondayLikeFetchMock() {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { variables: { ids: string[]; limit?: number } };
    const limiet = body.variables.limit ?? MONDAY_ITEMS_DEFAULT_LIMIET;
    const teruggegeven = body.variables.ids.slice(0, limiet);
    return {
      ok: true,
      json: async () => ({
        data: {
          items: teruggegeven.map((id) => ({ id, name: `School ${id}`, updated_at: "2026-09-03T00:00:00.000Z", column_values: [] })),
        },
      }),
    };
  });
}

beforeEach(() => {
  vi.stubEnv("MONDAY_API_TOKEN", "test-monday-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("haalItemsMetKolomWaarden — limit-regressie (root-cause-fix 2026-09-03 vervolg)", () => {
  it("37 ID's (Michels live-bevestigde aantal) -> alle 37 terug, niet afgekapt op Monday's eigen default van 25", async () => {
    const fetchMock = mondayLikeFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const ids = Array.from({ length: 37 }, (_, i) => `school-${i + 1}`);

    const resultaat = await haalItemsMetKolomWaarden(ids, ["dropdown_mm4v9rvg"]);

    expect(resultaat).toHaveLength(37);
    expect(resultaat.map((item) => item.id).sort()).toEqual([...ids].sort());
    // De fix zelf: de query moet expliciet een limit meegeven, anders past
    // mondayLikeFetchMock (net als de echte Monday-API) de default van 25 toe.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const verzonden = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as { variables: { limit?: number } };
    expect(verzonden.variables.limit).toBe(MAX_ITEMS_PER_QUERY);
  });

  it("meer dan MAX_ITEMS_PER_QUERY ID's worden in batches van ten hoogste 100 opgevraagd, elke batch met limit: 100", async () => {
    const fetchMock = mondayLikeFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const ids = Array.from({ length: 150 }, (_, i) => `school-${i + 1}`);

    const resultaat = await haalItemsMetKolomWaarden(ids, ["dropdown_mm4v9rvg"]);

    expect(resultaat).toHaveLength(150);
    expect(fetchMock).toHaveBeenCalledTimes(2); // ceil(150 / 100)
    const eersteBatch = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as { variables: { ids: string[]; limit?: number } };
    const tweedeBatch = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string) as { variables: { ids: string[]; limit?: number } };
    expect(eersteBatch.variables.ids).toHaveLength(100);
    expect(tweedeBatch.variables.ids).toHaveLength(50);
    expect(eersteBatch.variables.limit).toBe(MAX_ITEMS_PER_QUERY);
    expect(tweedeBatch.variables.limit).toBe(MAX_ITEMS_PER_QUERY);
  });

  it("kleine aantallen (1 en 25 ID's) blijven ongewijzigd correct werken", async () => {
    const fetchMockEen = mondayLikeFetchMock();
    vi.stubGlobal("fetch", fetchMockEen);
    const resultaatEen = await haalItemsMetKolomWaarden(["school-1"], ["dropdown_mm4v9rvg"]);
    expect(resultaatEen).toHaveLength(1);
    expect(resultaatEen[0]!.id).toBe("school-1");

    const idsVijfentwintig = Array.from({ length: 25 }, (_, i) => `school-${i + 1}`);
    const fetchMockVijfentwintig = mondayLikeFetchMock();
    vi.stubGlobal("fetch", fetchMockVijfentwintig);
    const resultaatVijfentwintig = await haalItemsMetKolomWaarden(idsVijfentwintig, ["dropdown_mm4v9rvg"]);
    expect(resultaatVijfentwintig).toHaveLength(25);
    expect(resultaatVijfentwintig.map((item) => item.id).sort()).toEqual([...idsVijfentwintig].sort());
  });
});
