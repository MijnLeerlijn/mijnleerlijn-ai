import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { optionalEnv } from "@/config/env";
import { synchroniseerScholenBoard } from "@/lib/sales/sync";
import { synchroniseerSalesHistorie } from "@/lib/sales/activity-history";

// Sales-sync: bestaande school/update-sync + de genormaliseerde funnelhistorie.
// Monday blijft bron van waarheid; de historische laag bewaart alleen before/
// after-transities van Relatiestatus en Salesfase met provenance.
async function isGeldigeCronAanvraag(request: NextRequest): Promise<boolean> {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function voerSyncUit(request: NextRequest, vereisAdminBijGeenCron: boolean): Promise<NextResponse> {
  const payload = await getPayload({ config });

  if (!(await isGeldigeCronAanvraag(request))) {
    if (!vereisAdminBijGeenCron) return NextResponse.json({ error: "Niet geautoriseerd." }, { status: 403 });
    const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
    if (!isAdmin(sessieControle.user)) return NextResponse.json({ error: "Niet geautoriseerd." }, { status: 403 });
    if (!heeftAdminPermissie(sessieControle.user, "sales.overzicht")) {
      return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
    }
  }

  try {
    const resultaat = await synchroniseerScholenBoard(payload);
    let historie = null;
    try {
      historie = await synchroniseerSalesHistorie(payload);
    } catch (error) {
      const boodschap = error instanceof Error ? error.message : String(error);
      resultaat.fouten.push(`Sales-historie synchroniseren mislukt: ${boodschap}`);
    }
    return NextResponse.json({ ...resultaat, historie });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/sync] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return voerSyncUit(request, false);
}

export async function POST(request: NextRequest) {
  return voerSyncUit(request, true);
}
