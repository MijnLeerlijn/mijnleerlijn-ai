import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { berekenVerslagUpdateBackfillRapport } from "@/lib/trainers/verslag-backfill-rapport";

/**
 * TIJDELIJKE, STRIKT READ-ONLY productie-diagnoseroute (2026-09-09).
 *
 * Aanleiding: `vercel env pull` retourneert 9 secrets als `[SENSITIVE]`,
 * waardoor `payload.config.ts` lokaal crasht — de dry-run van
 * `payload/scripts/backfill-verslag-updates.ts` (zie commit 6919681) kan
 * daardoor niet lokaal tegen de echte productiedatabase draaien. Deze
 * route voert exact dezelfde, ongewijzigde dry-run-logica uit, maar dan
 * binnen Vercel's eigen productieruntime, waar die secrets wél gewoon
 * beschikbaar zijn.
 *
 * Waarom dit technisch onmogelijk een write kan veroorzaken (niet slechts
 * "roept --apply niet aan", maar structureel):
 *  - Deze route importeert UITSLUITEND `berekenVerslagUpdateBackfillRapport`
 *    uit `lib/trainers/verslag-backfill-rapport.ts` — die module zelf
 *    importeert nergens `schrijfVerslagUpdateIdempotent`,
 *    `schrijfVerslagVelden`, `maakUpdate` of enige andere Monday-/
 *    database-schrijffunctie (zie de doc-comment daar). Er is dus, ook al
 *    zou deze route-code een bug bevatten, in de hele aanroepketen
 *    helemaal niets schrijfbaars om aan te roepen.
 *  - Alleen HTTP GET is geëxporteerd — de Next.js App Router retourneert
 *    voor elke andere methode op dit pad automatisch 405, zonder dat deze
 *    route daar zelf iets voor hoeft te doen.
 *  - Geen `--apply`-equivalent, geen enkele request-parameter (query/body/
 *    header) wordt gelezen of heeft ook maar enig effect op het gedrag.
 *
 * Beveiliging: hergebruikt de BESTAANDE admin-sessie-/rolcontrole (zelfde
 * patroon als bv. app/api/admin/trainers/aandacht/route.ts) — geen nieuw,
 * apart secret nodig. Uitsluitend ingelogde beheerders/redacteuren met de
 * "trainers.dashboard"-permissie kunnen dit endpoint gebruiken.
 *
 * Response bevat uitsluitend ID's/statussen/aantallen — nooit
 * definitieveTekst of enige andere verslagtekst (zie
 * VerslagUpdateBackfillRapport(Regel) in verslag-backfill-rapport.ts).
 *
 * Tijdelijk: dit bestand + de registratie ervan (er is geen aparte
 * registratie nodig binnen de Next.js App Router — dit bestand ZELF is de
 * route) horen na gebruik weer verwijderd te worden.
 */
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }
  if (!heeftAdminPermissie(sessieControle.user, "trainers.dashboard")) {
    return NextResponse.json({ error: "Onvoldoende rechten voor dit onderdeel." }, { status: 403 });
  }

  const rapport = await berekenVerslagUpdateBackfillRapport(payload);
  return NextResponse.json(rapport);
}
