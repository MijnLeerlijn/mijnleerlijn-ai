import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { PAYLOAD_SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { buildSalesCycleTimeSummary } from "@/lib/sales/cycle-time";

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessie = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!sessie.user || !heeftAdminPermissie(sessie.user, "sales.overzicht")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor het Sales-dashboard." }, { status: 403 });
  }

  try {
    const summary = await buildSalesCycleTimeSummary(payload);
    return NextResponse.json(summary, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/cycle-time] mislukt:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
