import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { runSupportAnalysis, STANDAARD_LIMIET } from "@/lib/support/run-analysis";

// Start een AI-analyseronde over Gmail-supportthreads — zie
// lib/support/analyze.ts en lib/support/run-analysis.ts voor de
// daadwerkelijke logica. Admin-only via dezelfde, inmiddels in productie
// bevestigd werkende sessieverificatie als app/api/gmail/sync/route.ts
// (lib/auth/verify-session.ts) — géén payload.auth()-call hier, om
// dezelfde Origin-afhankelijke CSRF-gate te vermijden (zie de uitleg in
// verify-session.ts en het commentaar dat eerder in gmail/sync/route.ts
// stond, ondertussen daar opgeruimd nu de fix bevestigd is).
//
// Body (optioneel, beide velden): { threadIds?: number[]; limit?: number }.
// Met expliciete threadIds (bv. de "Analyseer geselecteerde threads"-knop)
// wordt precies die selectie verwerkt (tot een harde veiligheidscap, zie
// lib/support/run-analysis.ts). Zonder threadIds (bv. de "Analyseer nieuwe
// threads"-knop) worden automatisch tot `limit` (standaard 5) nog niet
// (succesvol) geanalyseerde threads gekozen.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen een analyse starten." }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Lege body toegestaan — de "Analyseer nieuwe threads"-knop stuurt er geen mee.
  }
  const { threadIds, limit } = (body ?? {}) as { threadIds?: unknown; limit?: unknown };

  const geldigeThreadIds = Array.isArray(threadIds)
    ? threadIds.filter((id): id is number => typeof id === "number")
    : undefined;
  const geldigLimiet = typeof limit === "number" && limit > 0 ? Math.floor(limit) : STANDAARD_LIMIET;

  try {
    const resultaat = await runSupportAnalysis(payload, {
      threadIds: geldigeThreadIds,
      limiet: geldigLimiet,
    });

    // Alleen aantallen + technische foutmeldingen — nooit e-mailinhoud of
    // persoonsgegevens, zie docs/SECURITY-AND-PRIVACY.md.
    payload.logger.info(
      `[api/support/analyze] geanalyseerd=${resultaat.geanalyseerd} conceptenGemaakt=${resultaat.conceptenGemaakt} bestaandeConceptenBijgewerkt=${resultaat.bestaandeConceptenBijgewerkt} genegeerd=${resultaat.genegeerd} mislukt=${resultaat.mislukt}`
    );
    if (resultaat.fouten.length > 0) {
      payload.logger.warn(resultaat.fouten, "[api/support/analyze] fouten per thread");
    }

    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/support/analyze] Analyse mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
