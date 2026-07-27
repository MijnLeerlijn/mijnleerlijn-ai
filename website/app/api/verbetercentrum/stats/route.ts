import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { computeStats, type ConversatieVoorStats } from "@/lib/verbetercentrum/compute-stats";

// AI Verbetercentrum: dashboard-KPI's + "meest gebruikte..."-lijsten. Eén
// endpoint voor beide (zelfde databron, zelfde vorm: getallen + top-N-
// lijsten) — de daadwerkelijke berekening staat in
// lib/verbetercentrum/compute-stats.ts (puur, los getest).
//
// Venster: laatste 90 dagen — begrensd genoeg om snel te blijven naarmate
// het logboek groeit, ruim genoeg voor zinvolle week-/dashboardcijfers.
const VENSTER_DAGEN = 90;

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  try {
    const grens = new Date(Date.now() - VENSTER_DAGEN * 24 * 60 * 60 * 1000).toISOString();
    const resultaat = await payload.find({
      collection: "assistant-conversations",
      where: { and: [{ source: { equals: "helpdesk" } }, { createdAt: { greater_than: grens } }] },
      limit: 5000,
      depth: 1,
      overrideAccess: true,
    });

    const stats = computeStats(resultaat.docs as unknown as ConversatieVoorStats[]);
    return NextResponse.json(stats);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/verbetercentrum/stats] Berekenen mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
