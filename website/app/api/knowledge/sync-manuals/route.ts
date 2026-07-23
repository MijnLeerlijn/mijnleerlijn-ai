import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { syncManuals, STANDAARD_LIMIET } from "@/lib/knowledge/sync-manuals";

// Synchroniseert website/handleidingen/ met knowledge-sources — zie
// lib/knowledge/sync-manuals.ts voor de volledige logica. Admin-only (niet
// "elke ingelogde gebruiker" zoals /api/assistant/*: dit schrijft naar de
// kennisbank zelf, niet alleen een gesprek) via dezelfde sessieverificatie
// als de andere beheerroutes (lib/auth/verify-session.ts).
//
// Body (optioneel): { limit?: number } — hoeveel NIEUWE/GEWIJZIGDE bestanden
// dit verzoek maximaal (her)indexeert + (her)embedt (standaard 5, zie
// lib/knowledge/sync-manuals.ts voor waarom). Scannen/hashen van de hele map
// gebeurt altijd volledig, ongeacht deze limiet.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen handleidingen synchroniseren." }, { status: 403 });
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
    const resultaat = await syncManuals(payload, { limiet: geldigLimiet });

    // Alleen aantallen + technische foutmeldingen — nooit bestandsinhoud of
    // persoonsgegevens, zie docs/SECURITY-AND-PRIVACY.md.
    payload.logger.info(
      `[api/knowledge/sync-manuals] gevonden=${resultaat.gevonden} nieuw=${resultaat.nieuw} bijgewerkt=${resultaat.bijgewerkt} ongewijzigd=${resultaat.ongewijzigdOvergeslagen} duplicaat=${resultaat.duplicaatOvergeslagen} geindexeerd=${resultaat.geindexeerd} geembed=${resultaat.geembed} mislukt=${resultaat.mislukt}`
    );
    if (resultaat.fouten.length > 0) {
      payload.logger.warn(resultaat.fouten, "[api/knowledge/sync-manuals] fouten per bestand");
    }

    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/knowledge/sync-manuals] Synchroniseren mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
