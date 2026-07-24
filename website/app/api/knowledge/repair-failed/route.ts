import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { repairFailedKnowledgeSources, STANDAARD_LIMIET } from "@/lib/knowledge/repair-failed-sources";

// Herstelt Knowledge Sources met status "error" (bv. "Kon PDF niet ophalen
// (HTTP 403)" — de private-Blob-URL werd vóór een eerdere fix niet gesigned
// vóór het fetchen, zie lib/knowledge/process-source.ts) — zie
// lib/knowledge/repair-failed-sources.ts voor de volledige logica.
// Herindexeert + herembedt uitsluitend BESTAANDE, al mislukte bronnen —
// raakt Vercel Blob/de sync-pijplijn niet aan, "zonder alles opnieuw te
// importeren". Admin-only, zelfde sessieverificatie als de andere
// beheerroutes (lib/auth/verify-session.ts).
//
// Body (optioneel): { limit?: number } — hoeveel van de gevonden mislukte
// bronnen dit verzoek daadwerkelijk opnieuw probeert (standaard 5). De lijst
// van gevonden mislukte bronnen (`gevonden`) bevat ALTIJD alle bronnen met
// status "error" (tot een harde cap), ongeacht deze limiet — zo blijft
// zichtbaar hoeveel er in totaal nog open staan, ook als er meerdere
// aanroepen nodig zijn om ze allemaal te verwerken.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json(
      { error: "Alleen beheerders mogen mislukte bronnen herstellen." },
      { status: 403 }
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Lege body toegestaan.
  }
  const { limit } = (body ?? {}) as { limit?: unknown };
  const geldigLimiet = typeof limit === "number" && limit > 0 ? Math.floor(limit) : STANDAARD_LIMIET;

  try {
    const resultaat = await repairFailedKnowledgeSources(payload, { limiet: geldigLimiet });

    // Alleen aantallen + technische foutmeldingen — nooit bestandsinhoud of
    // persoonsgegevens, zie docs/SECURITY-AND-PRIVACY.md.
    payload.logger.info(
      `[api/knowledge/repair-failed] gevonden=${resultaat.gevonden.length} verwerkt=${resultaat.verwerkt} heringedexeerd=${resultaat.heringedexeerd} geembed=${resultaat.geembed} nogSteedsMislukt=${resultaat.nogSteedsMislukt}`
    );
    if (resultaat.fouten.length > 0) {
      payload.logger.warn(resultaat.fouten, "[api/knowledge/repair-failed] fouten per bron");
    }

    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/knowledge/repair-failed] Herstellen mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
