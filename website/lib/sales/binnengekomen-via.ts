import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM } from "./monday-columns";
import { haalScholenPagina } from "./monday-client";

const CACHE_MS = 5 * 60 * 1000;
let cache: { expiresAt: number; waarden: Map<string, string | null> } | null = null;
let lopend: Promise<Map<string, string | null>> | null = null;

async function laadBinnengekomenVia(): Promise<Map<string, string | null>> {
  const waarden = new Map<string, string | null>();
  let cursor: string | null = null;

  do {
    const pagina = await haalScholenPagina({
      boardId: SCHOLEN_BOARD_ID,
      columnIds: [SCHOLEN_KOLOM.binnengekomenVia],
      limit: 100,
      cursor,
    });

    for (const item of pagina.items) {
      const tekst = item.column_values.find((kolom) => kolom.id === SCHOLEN_KOLOM.binnengekomenVia)?.text?.trim();
      waarden.set(item.id, tekst || null);
    }
    cursor = pagina.cursor;
  } while (cursor);

  cache = { expiresAt: Date.now() + CACHE_MS, waarden };
  return waarden;
}

export async function binnengekomenViaVoorMondayItem(mondayItemId: string | null | undefined): Promise<string | null> {
  if (!mondayItemId) return null;
  if (cache && cache.expiresAt > Date.now()) return cache.waarden.get(mondayItemId) ?? null;

  if (!lopend) {
    lopend = laadBinnengekomenVia().finally(() => {
      lopend = null;
    });
  }

  const waarden = await lopend;
  return waarden.get(mondayItemId) ?? null;
}
