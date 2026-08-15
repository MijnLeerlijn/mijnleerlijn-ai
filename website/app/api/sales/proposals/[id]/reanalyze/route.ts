import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { heranalyseerVoorstel } from "@/lib/sales/proposal-reanalyze";

// Relatie-analyse V1.1 (2026-08-15) — "Opnieuw analyseren". Zelfde
// autorisatiepatroon als alle andere Sales-routes. Object-level: een
// niet-bestaand/al-afgehandeld voorstel-ID geeft een duidelijke fout, nooit
// stilzwijgend iets doen.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    return NextResponse.json({ error: "Ongeldig voorstel-ID." }, { status: 400 });
  }

  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  try {
    const resultaat = await heranalyseerVoorstel(payload, proposalId, sessieControle.user!.id);
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/proposals/reanalyze] mislukt:", boodschap);
    const status = boodschap.includes("niet gevonden") ? 404 : 500;
    return NextResponse.json({ error: boodschap }, { status });
  }
}
