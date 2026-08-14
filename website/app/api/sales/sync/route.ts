import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { optionalEnv } from "@/config/env";
import { synchroniseerScholenBoard } from "@/lib/sales/sync";

// Sales-assistent V1 (2026-08-14) — sync-route, twee ingangen:
// 1. Vercel Cron (zie vercel.json — GET, Vercels eigen conventie, ÉÉN keer
//    per dag als voorlopig, aanpasbaar interval — het abonnementsniveau van
//    dit Vercel-account is niet bekend, zie het opleveringsrapport),
//    geauthenticeerd via CRON_SECRET (Bearer-header — Vercel voegt die
//    automatisch toe zodra de env var bestaat).
// 2. Handmatige "Sync nu" vanuit de admin-UI (POST), admin-only via dezelfde
//    directe cookieverificatie als andere eigen POST-routes (payload.auth()
//    heeft hier het bekende Origin/CSRF-probleem, zie lib/auth/verify-session.ts).
async function isGeldigeCronAanvraag(request: NextRequest): Promise<boolean> {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function voerSyncUit(request: NextRequest, vereisAdminBijGeenCron: boolean): Promise<NextResponse> {
  const payload = await getPayload({ config });

  if (!(await isGeldigeCronAanvraag(request))) {
    if (!vereisAdminBijGeenCron) {
      return NextResponse.json({ error: "Niet geautoriseerd." }, { status: 403 });
    }
    const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
    if (!isAdmin(sessieControle.user)) {
      return NextResponse.json({ error: "Niet geautoriseerd." }, { status: 403 });
    }
  }

  try {
    const resultaat = await synchroniseerScholenBoard(payload);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/sync] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}

/** Vercel Cron-ingang — GEEN sessiecookie-fallback: een niet-geldig CRON_SECRET betekent hier altijd 403, nooit "probeer als admin". */
export async function GET(request: NextRequest) {
  return voerSyncUit(request, false);
}

/** Handmatige "Sync nu"-knop — admin-sessie vereist. */
export async function POST(request: NextRequest) {
  return voerSyncUit(request, true);
}
