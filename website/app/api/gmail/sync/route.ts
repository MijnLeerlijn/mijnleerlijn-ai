import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin, type AuthUser } from "@/payload/access/roles";
import { syncGmailThreads } from "@/lib/gmail/sync";

// Start een Gmail-synchronisatieronde — zie lib/gmail/sync.ts voor de
// daadwerkelijke logica. In tegenstelling tot app/api/gmail/oauth/callback
// is dit een GEWONE same-origin aanvraag (de "Test synchronisatie"-knop in
// Payload's admin-UI doet een fetch() vanuit /admin zelf), dus de normale
// payload.auth()-sessiecontrole werkt hier gewoon correct — zie het
// commentaar in de callback-route voor waarom dat daar niet kan. Deze route
// blijft daarom ECHT admin-only: geen state-cookie-achtige workaround zoals
// bij de callback, die hoort hier niet (er is geen cross-site-redirect-
// probleem dat dat zou rechtvaardigen).
//
// BEKENDE OORZAAK van "Alleen beheerders..." met een echt ingelogde
// beheerder: Payload's eigen admin-UI stuurt élke interne fetch() met
// expliciet `credentials: 'include'` (bevestigd door de hele
// @payloadcms/ui-broncode na te lopen — geen enkele plek daar vertrouwt op
// het fetch-standaardgedrag). payload/components/GmailSyncButton.tsx deed
// dat aanvankelijk niet, waardoor de sessiecookie niet werd meegestuurd en
// payload.auth() hier terecht `user: null` teruggaf. Gefixt door exact
// hetzelfde patroon te volgen — zie dat bestand.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });
  const authUser = user as AuthUser | null;
  const adminCheck = isAdmin(authUser);

  // Tijdelijke diagnostische logging — uitsluitend structuur, nooit inhoud:
  // geen e-mail, tokens, cookies of overige persoonsgegevens. Bedoeld om te
  // bevestigen dat de fix hierboven het echte probleem oplost; verwijderen
  // zodra dat bevestigd is.
  payload.logger.info(
    {
      userAanwezig: Boolean(user),
      userCollection: (user as { collection?: string } | null)?.collection ?? null,
      userVeldnamen: user ? Object.keys(user) : [],
      adminCheckUitkomst: adminCheck,
    },
    "[api/gmail/sync] diagnose authenticatie"
  );

  if (!adminCheck) {
    return NextResponse.json(
      { error: "Alleen beheerders mogen een synchronisatie starten." },
      { status: 403 }
    );
  }

  try {
    const resultaat = await syncGmailThreads(payload);
    // Alleen aantallen + technische foutmeldingen (nooit berichtinhoud) —
    // zie docs/SECURITY-AND-PRIVACY.md.
    payload.logger.info(
      `[api/gmail/sync] gevonden=${resultaat.gevonden} nieuw=${resultaat.nieuw} bijgewerkt=${resultaat.bijgewerkt} overgeslagen=${resultaat.overgeslagen} mislukt=${resultaat.mislukt}`
    );
    if (resultaat.fouten.length > 0) {
      payload.logger.warn(resultaat.fouten, "[api/gmail/sync] fouten per thread-id");
    }
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/gmail/sync] Synchronisatie mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
