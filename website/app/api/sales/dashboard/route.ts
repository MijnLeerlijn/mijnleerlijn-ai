import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { PAYLOAD_SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { bouwSalesDashboardData } from "@/lib/sales/dashboard-data";

// Dashboard is bewust NIET admin-only: een aandeelhouder krijgt een gewoon
// Payload users-account met permissionMode=restricted en uitsluitend
// sales.overzicht. De response bevat geen contactpersonen, mail, notities of
// andere persoonlijke CRM-data.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessie = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!sessie.user || !heeftAdminPermissie(sessie.user, "sales.overzicht")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor het Sales-dashboard." }, { status: 403 });
  }

  try {
    const dashboard = await bouwSalesDashboardData(payload);
    return NextResponse.json(dashboard, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/dashboard] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
