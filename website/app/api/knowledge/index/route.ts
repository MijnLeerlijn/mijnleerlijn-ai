import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { runKnowledgeIndexing, STANDAARD_LIMIET } from "@/lib/knowledge/run-indexing";

// Start een indexeerronde over kennisbronnen — zie lib/knowledge/index-source.ts,
// process-source.ts en run-indexing.ts voor de daadwerkelijke logica.
// Admin-only via dezelfde sessieverificatie als app/api/support/analyze/route.ts
// (lib/auth/verify-session.ts, geen payload.auth() — zie de uitleg daar).
//
// Body (optioneel, beide velden): { sourceIds?: number[]; limit?: number }.
// Met expliciete sourceIds (de "Indexeer geselecteerde bronnen"-knop) wordt
// precies die selectie verwerkt — dit dekt zowel nieuwe bronnen als
// herindexeren (een reeds geïndexeerde bron opnieuw selecteren verwerkt 'm
// gewoon opnieuw). Zonder sourceIds worden automatisch tot `limit`
// (standaard 5) nog niet (succesvol) geïndexeerde bronnen gekozen.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json(
      { error: "Alleen beheerders mogen een indexeerronde starten." },
      { status: 403 }
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Lege body toegestaan.
  }
  const { sourceIds, limit } = (body ?? {}) as { sourceIds?: unknown; limit?: unknown };

  const geldigeSourceIds = Array.isArray(sourceIds)
    ? sourceIds.filter((id): id is number => typeof id === "number")
    : undefined;
  const geldigLimiet = typeof limit === "number" && limit > 0 ? Math.floor(limit) : STANDAARD_LIMIET;

  try {
    const resultaat = await runKnowledgeIndexing(payload, {
      sourceIds: geldigeSourceIds,
      limiet: geldigLimiet,
    });

    // Alleen aantallen + technische foutmeldingen — nooit brontekst of
    // persoonsgegevens, zie docs/SECURITY-AND-PRIVACY.md.
    payload.logger.info(
      `[api/knowledge/index] verwerkt=${resultaat.verwerkt} geindexeerd=${resultaat.geindexeerd} mislukt=${resultaat.mislukt}`
    );
    if (resultaat.fouten.length > 0) {
      payload.logger.warn(resultaat.fouten, "[api/knowledge/index] fouten per bron");
    }

    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/knowledge/index] Indexeren mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
