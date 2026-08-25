import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalTodoItems } from "@/lib/sales/dashboard-todo";

// Sales UX-ronde 3 (2026-08-14) — "To do"-tab op het algemene dashboard.
// Pure read, geen nevenerffecten — GET, zelfde patroon als
// app/api/verbetercentrum/stats/route.ts. De daadwerkelijke selectie
// (bestaande proposal-statussen + het bestaande "geen vervolgactie"-
// signaal) staat in lib/sales/dashboard-todo.ts.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  // Admin gebruikersbeheer (2026-08-25) — permissiecheck naast de bestaande rolcheck.
  if (!heeftAdminPermissie(sessieControle.user, "sales.overzicht")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  try {
    const resultaat = await haalTodoItems(payload);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/dashboard/todo] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
