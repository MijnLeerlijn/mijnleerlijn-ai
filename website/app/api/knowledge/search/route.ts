import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { searchKnowledge } from "@/lib/embeddings/similarity-search";

// Semantische zoekopdracht — zie lib/embeddings/similarity-search.ts. Geen
// chatbot, geen gegenereerd antwoord: uitsluitend een gerangschikte lijst
// treffers met similarity-score. Admin-only via dezelfde sessieverificatie
// als de andere knowledge-routes (lib/auth/verify-session.ts) — dit is een
// interne testroute (zie de "Zoek semantisch"-testpagina), geen publieke
// zoek-API.
//
// Body: { query: string; limit?: number }.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen semantisch zoeken." }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const { query, limit } = (body ?? {}) as { query?: unknown; limit?: unknown };

  if (typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "query is verplicht." }, { status: 400 });
  }
  const geldigLimiet = typeof limit === "number" && limit > 0 ? Math.floor(limit) : undefined;

  try {
    const hits = await searchKnowledge(payload, { query, limiet: geldigLimiet });
    payload.logger.info(`[api/knowledge/search] query-lengte=${query.length} treffers=${hits.length}`);
    return NextResponse.json({ hits });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/knowledge/search] Zoeken mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
