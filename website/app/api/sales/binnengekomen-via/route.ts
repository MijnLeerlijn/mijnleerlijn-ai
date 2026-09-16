import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM } from "@/lib/sales/monday-columns";
import { haalScholenPagina } from "@/lib/sales/monday-client";

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "sales.scholen")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor de Pipeline." }, { status: 403 });
  }

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

  return NextResponse.json({ waarden });
}
