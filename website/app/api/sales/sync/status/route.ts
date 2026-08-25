import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { haalLaatsteSyncStatus } from "@/lib/sales/sync";

// Sales-logica productiecorrectie 2026-08-16 (punt 1) — pure read, geen
// nevenerffecten, zelfde patroon als app/api/sales/dashboard/todo/route.ts.
// Losse GET i.p.v. deze info meesturen met POST /api/sales/sync (die route
// blijft ONGEWIJZIGD — "hergebruik exact dezelfde sync-route/logica",
// opdrachtseis): de dashboard-knop en Sales Overzicht moeten de laatste
// sync-status ook kunnen tonen VÓÓR iemand zelf op "Sync" klikt, bv. na een
// paginaverversing of wanneer de laatste sync via de cron liep.
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
    const status = await haalLaatsteSyncStatus(payload);
    return NextResponse.json(status);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/sync/status] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
