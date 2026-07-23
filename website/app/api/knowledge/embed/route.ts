import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import {
  runKnowledgeEmbedding,
  STANDAARD_LIMIET,
  type EmbeddableCollectie,
} from "@/lib/embeddings/run-embedding";

const GELDIGE_COLLECTIES: EmbeddableCollectie[] = ["knowledge-sources", "knowledge-drafts", "articles"];

// Maakt/vernieuwt embeddings — zie lib/embeddings/ voor de daadwerkelijke
// logica. Admin-only via dezelfde sessieverificatie als
// app/api/support/analyze en app/api/knowledge/index (lib/auth/verify-session.ts).
//
// Body (optioneel, alle velden): { collection?: "knowledge-sources" |
// "knowledge-drafts" | "articles"; ids?: number[]; limit?: number }.
// `ids` vereist `collection` (ID's zijn niet uniek over collecties heen) —
// zonder `collection` EN zonder `ids` worden alle drie collecties verwerkt
// (elk tot `limit` documenten met status "pending"/"stale").
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen embeddings maken." }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Lege body toegestaan.
  }
  const { collection, ids, limit } = (body ?? {}) as { collection?: unknown; ids?: unknown; limit?: unknown };

  const geldigeCollectie =
    typeof collection === "string" && GELDIGE_COLLECTIES.includes(collection as EmbeddableCollectie)
      ? (collection as EmbeddableCollectie)
      : undefined;
  if (collection !== undefined && !geldigeCollectie) {
    return NextResponse.json({ error: `Ongeldige collection: ${String(collection)}` }, { status: 400 });
  }

  const geldigeIds = Array.isArray(ids)
    ? ids.filter((id): id is number => typeof id === "number")
    : undefined;
  if (geldigeIds && geldigeIds.length > 0 && !geldigeCollectie) {
    return NextResponse.json({ error: "ids vereist ook een collection." }, { status: 400 });
  }

  const geldigLimiet = typeof limit === "number" && limit > 0 ? Math.floor(limit) : STANDAARD_LIMIET;

  try {
    const resultaat = await runKnowledgeEmbedding(payload, {
      collection: geldigeCollectie,
      ids: geldigeIds,
      limiet: geldigLimiet,
    });

    payload.logger.info(
      `[api/knowledge/embed] verwerkt=${resultaat.verwerkt} geembed=${resultaat.geembed} overgeslagen=${resultaat.overgeslagen} genegeerd=${resultaat.genegeerd} mislukt=${resultaat.mislukt}`
    );
    if (resultaat.fouten.length > 0) {
      payload.logger.warn(resultaat.fouten, "[api/knowledge/embed] fouten per document");
    }

    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/knowledge/embed] Embedden mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
