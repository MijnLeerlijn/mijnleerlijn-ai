import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { PAYLOAD_SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { bouwNieuwSalesDashboardData } from "@/lib/sales/nieuw-dashboard-data";

// Zelfde toegang als het bestaande dashboard: sales.overzicht, ook voor een
// beperkt account. Alleen lezen; er gaat niets terug naar Monday.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessie = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!sessie.user || !heeftAdminPermissie(sessie.user, "sales.overzicht")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor het Sales-dashboard." }, { status: 403 });
  }

  try {
    const dashboard = await bouwNieuwSalesDashboardData(payload);
    return NextResponse.json(dashboard, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/dashboard-nieuw] mislukt:", boodschap);
    return NextResponse.json({ error: "Het nieuwe dashboard kon niet worden geladen." }, { status: 500 });
  }
}
