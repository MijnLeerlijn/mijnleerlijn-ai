import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { syncGmailThreads } from "@/lib/gmail/sync";

// Start een Gmail-synchronisatieronde — zie lib/gmail/sync.ts voor de
// daadwerkelijke logica. Deze route blijft ECHT admin-only: geen state-
// cookie-achtige workaround zoals bij de OAuth-callback, die hoort hier niet
// (er is geen cross-site-redirect-probleem dat dat zou rechtvaardigen).
//
// GEVONDEN OORZAAK van "Alleen beheerders..." met een echt ingelogde
// beheerder (ook nadat credentials: 'include' al was toegevoegd aan de
// knop): payload.auth() loopt via Payload's cookie-extractiestrategie
// (extractJWT.js), die een cookie alleen toelaat als de binnenkomende
// `Origin`-header exact voorkomt in payload.config.csrf — een array die
// altijd precies uit serverURL/NEXT_PUBLIC_SERVER_URL bestaat
// (config/sanitize.js). Een GET-navigatie zoals app/api/gmail/oauth/start
// stuurt vaak geen Origin-header en valt terug op een Sec-Fetch-Site-check
// die daar niet van afhangt — vandaar dat die route wél werkte. Een
// fetch()-POST zoals de syncknop stuurt daarentegen ALTIJD een
// Origin-header, en zodra die niet exact overeenkomt met
// NEXT_PUBLIC_SERVER_URL (bv. niet gezet, of een andere host dan de echte
// Vercel-URL) verwerpt Payload de verder geldige sessiecookie stilzwijgend.
//
// Oplossing: lib/auth/verify-session.ts verifieert dezelfde cookie
// rechtstreeks en cryptografisch (JWT-handtekening + actieve sessie),
// zonder die Origin-afhankelijke gate — even streng, niet minder veilig,
// zie de uitleg in dat bestand. payload.auth() wordt hieronder ALLEEN nog
// ter vergelijking/diagnose aangeroepen, nooit voor de daadwerkelijke
// autorisatiebeslissing.
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const cookieHeader = request.headers.get("cookie");
  const cookieNamen = (cookieHeader ?? "")
    .split(";")
    .map((deel) => deel.split("=")[0]?.trim())
    .filter((naam): naam is string => Boolean(naam));

  // Uitsluitend ter vergelijking/diagnose — de autorisatiebeslissing hieronder
  // gebruikt dit resultaat NIET (zie uitleg hierboven).
  const oudeMethode = await payload.auth({ headers: request.headers });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  const adminCheck = isAdmin(sessieControle.user);

  // Tijdelijke diagnostische logging — uitsluitend structuur, nooit inhoud:
  // geen e-mail, tokens, cookiewaarden of overige persoonsgegevens. Bedoeld
  // om te bevestigen dat de fix hierboven het echte probleem oplost;
  // verwijderen zodra dat bevestigd is.
  payload.logger.info(
    {
      cookieHeaderAanwezig: Boolean(cookieHeader),
      cookieNamen,
      authorizationHeaderAanwezig: Boolean(request.headers.get("authorization")),
      payloadAuthStrategie: (oudeMethode.user as { _strategy?: string } | null)?._strategy ?? null,
      payloadAuthUserAanwezig: Boolean(oudeMethode.user),
      nieuweMethodeCookieAanwezig: sessieControle.cookieAanwezig,
      nieuweMethodeAfwijzingReden: sessieControle.reden ?? null,
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
