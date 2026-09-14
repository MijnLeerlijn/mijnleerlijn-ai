import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { PAYLOAD_SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { synchroniseerSalesHistorie } from "@/lib/sales/activity-history";

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessie = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isAdmin(sessie.user) || !heeftAdminPermissie(sessie.user, "sales.overzicht")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor Sales-historie." }, { status: 403 });
  }

  try {
    return NextResponse.json(await synchroniseerSalesHistorie(payload));
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/history/sync] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
