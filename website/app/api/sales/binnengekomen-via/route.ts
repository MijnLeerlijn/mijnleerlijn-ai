import { headers } from "next/headers";
import { getPayload } from "payload";
import config from "@payload-config";
import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM } from "@/lib/sales/monday-columns";
import { haalScholenPagina } from "@/lib/sales/monday-client";

export async function GET() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  if (!user) return Response.json({ error: "Niet ingelogd" }, { status: 401 });

  const waarden: Record<string, string | null> = {};
  let cursor: string | null = null;
  do {
    const pagina = await haalScholenPagina({
      boardId: SCHOLEN_BOARD_ID,
      columnIds: [SCHOLEN_KOLOM.binnengekomenVia],
      limit: 100,
      cursor,
    });
    for (const item of pagina.items) {
      waarden[item.id] = item.column_values.find((kolom) => kolom.id === SCHOLEN_KOLOM.binnengekomenVia)?.text?.trim() || null;
    }
    cursor = pagina.cursor;
  } while (cursor);

  return Response.json({ waarden });
}
