import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { voerBackfillUit } from "@/lib/sales/backfill";

// Sales-assistent V1 (2026-08-14) — handmatig getriggerde initiële
// analyse/backfill (§26/§27: draait pas ná een werkende sync, admin-only,
// maakt nooit een geaccepteerde actie aan — alleen pending voorstellen).
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Niet geautoriseerd." }, { status: 403 });
  }

  try {
    const resultaat = await voerBackfillUit(payload);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/backfill] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
