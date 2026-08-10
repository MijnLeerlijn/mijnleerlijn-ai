import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { importeerCurriculumWerkplaatsKennis } from "@/lib/knowledge/import-curriculum-werkplaats";

// Eenmalige, admin-only productie-import van de Curriculum Werkplaats-
// documentatie (1 handleiding + 18 kennisartikelen) — Helpdesk-
// beheerkoppeling-uitbreiding 2026-08-10. Doel: de inhoud staat al kant-en-
// klaar in payload/import-curriculum-werkplaats/data.ts, maar het bestaande
// CLI-script (npm run import:curriculum-werkplaats) kan alleen tegen een
// database draaien waarvan iemand DATABASE_URI/PAYLOAD_SECRET lokaal heeft —
// in productie op Vercel is dat bewust niet gewenst (geen productiesecrets
// die de Vercel-omgeving verlaten). Deze route lost dat op: hij draait
// SERVER-SIDE binnen de al-bestaande Vercel-deployment en gebruikt
// process.env zoals Payload dat toch al overal doet — er wordt hier niets
// nieuws aan secret-blootstelling toegevoegd.
//
// Admin-only via exact hetzelfde sessiepatroon als de andere beheerroutes
// (app/api/knowledge/embed/route.ts, app/api/knowledge/sync-manuals/route.ts):
// verifyAdminSessionCookie + isAdmin. Bewust GEEN generieke request-body:
// deze route accepteert geen enkel veld en voert altijd exact dezelfde vaste
// 19-documenten-import uit — er is geen manier om via deze route een ander
// artikel, een andere collectie, of willekeurige inhoud te importeren.
// Idempotent (upsert-by-slug, zie lib/knowledge/import-curriculum-
// werkplaats.ts): een tweede aanroep maakt nooit duplicaten en raakt nooit
// andere Helpdesk-content aan.
export async function POST(_request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    _request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json(
      { error: "Alleen beheerders mogen de Curriculum Werkplaats-kennis importeren." },
      { status: 403 }
    );
  }

  try {
    const resultaat = await importeerCurriculumWerkplaatsKennis(payload);

    // Alleen aantallen + technische foutmeldingen (nooit artikelinhoud, geen
    // secrets) — zelfde logbeleid als de andere beheerroutes, zie
    // docs/SECURITY-AND-PRIVACY.md.
    payload.logger.info(
      `[api/knowledge/import-curriculum-werkplaats] aangemaakt=${resultaat.aangemaakt} bijgewerkt=${resultaat.bijgewerkt} verwerkt=${resultaat.verwerkt} fouten=${resultaat.fouten.length}`
    );
    if (resultaat.fouten.length > 0) {
      payload.logger.warn(resultaat.fouten, "[api/knowledge/import-curriculum-werkplaats] fouten per document");
    }

    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/knowledge/import-curriculum-werkplaats] Import mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
