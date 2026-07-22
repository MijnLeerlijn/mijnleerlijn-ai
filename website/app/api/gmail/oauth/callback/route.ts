import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  exchangeCodeForTokens,
  fetchGmailAddress,
  GMAIL_OAUTH_STATE_COOKIE,
  GMAIL_READONLY_SCOPE,
} from "@/lib/gmail/oauth";
import { encrypt } from "@/lib/gmail/encryption";

// Callbackroute van de Gmail-OAuth-koppeling. Verifieert de CSRF-state
// (tegen de httpOnly-cookie die /start zette), wisselt de authorization
// code server-side in voor tokens (client secret verlaat de server nooit),
// versleutelt beide tokens (lib/gmail/encryption.ts) en slaat uitsluitend
// de ciphertext op in de gmail-connection-global. Importeert nog geen
// e-mails — dat is een latere, aparte stap. Toont na afloop uitsluitend een
// succesmelding + het gekoppelde adres, verder niets (geen tokens, geen
// scopes) — zie de expliciete eis in de opdracht.
//
// BEWUST GEEN payload.auth()/isAdmin-hercontrole hier — dat lijkt de eerste
// intuïtie ("controleer overal de beheerder"), maar is hier zowel overbodig
// als kapot: Google's redirect terug naar deze route is voor de browser een
// CROSS-SITE top-level navigatie (van accounts.google.com naar onze eigen
// origin). Payload's eigen cookie-auth-extractie (extractJWT.js) verwerpt
// de sessiecookie op zo'n aanvraag opzettelijk zodra er een csrf-allowlist
// geconfigureerd is (Origin ontbreekt bij een gewone GET-navigatie, dus valt
// terug op Sec-Fetch-Site — en dat is hier "cross-site", nooit "same-origin"
// /"same-site"/"none") — dit is Payload's eigen CSRF-hardening, geen bug.
// Een verse payload.auth()-aanroep hier geeft dus ALTIJD user: null, ook voor
// een echt ingelogde beheerder in dezelfde browser. De autorisatie voor deze
// route loopt daarom uitsluitend via de state-cookie hieronder: die wordt
// alleen ooit gezet door /start ná een geslaagde isAdmin-controle
// (gewone same-origin aanvraag, geen probleem daar), is httpOnly (niet
// uitleesbaar/te forgen via JS), willekeurig (32 bytes), kortlevend (10 min)
// en eenmalig (altijd opgeruimd na gebruik, ongeacht de uitkomst) — dat is
// precies waar een OAuth-state-parameter voor bestaat, en is hier zowel de
// CSRF- als de autorisatiewaarborg tegelijk.

// `message` mag beperkte inline HTML bevatten (bv. <strong>) — dynamische
// waarden (zoals het door Google teruggegeven `error`-queryparameter, direct
// client-controleerbaar) moeten daarom door de aanroeper al met escapeHtml()
// zijn ontsnapt vóórdat ze in `message` terechtkomen. `title` komt nooit van
// buitenaf.
function escapeHtml(tekst: string): string {
  return tekst
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlResponse(status: number, title: string, message: string): NextResponse {
  const html = `<!doctype html>
<html lang="nl">
<head><meta charset="utf-8" /><title>${title} — MijnLeerlijn</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 15vh auto; padding: 0 24px; color: #1a1a1a; text-align: center; }
  h1 { font-size: 1.25rem; }
  p { color: #555; }
</style>
</head>
<body><h1>${title}</h1><p>${message}</p></body>
</html>`;
  const response = new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  // Eenmalige state-cookie altijd opruimen, ongeacht de uitkomst.
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/api/gmail/oauth" });
  return response;
}

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });

  const { searchParams } = request.nextUrl;
  const googleError = searchParams.get("error");
  if (googleError) {
    return htmlResponse(
      400,
      "Koppeling geannuleerd",
      `Google gaf een fout terug (${escapeHtml(googleError)}) — er is niets gekoppeld.`
    );
  }

  const state = searchParams.get("state");
  const cookieState = request.cookies.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  if (!state || !cookieState || state !== cookieState) {
    return htmlResponse(
      400,
      "Ongeldige of verlopen aanvraag",
      "De koppelingsaanvraag kon niet worden geverifieerd (state komt niet overeen). Start de koppeling opnieuw."
    );
  }

  const code = searchParams.get("code");
  if (!code) {
    return htmlResponse(400, "Ongeldige aanvraag", "Er ontbreekt een autorisatiecode van Google.");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const emailAddress = await fetchGmailAddress(tokens.access_token);

    // Google geeft een refresh_token normaal alleen bij de EERSTE toestemming
    // terug; buildGoogleAuthUrl gebruikt prompt=consent om dit ook bij een
    // herkoppeling af te dwingen. Mocht Google er onverhoopt toch geen
    // teruggeven, dan behouden we de al opgeslagen (versleutelde) refresh
    // token in plaats van hem leeg te maken.
    let encryptedRefreshToken: string | undefined;
    if (tokens.refresh_token) {
      encryptedRefreshToken = encrypt(tokens.refresh_token);
    } else {
      const bestaand = await payload.findGlobal({ slug: "gmail-connection", overrideAccess: true });
      encryptedRefreshToken = (bestaand?.encryptedRefreshToken as string | undefined) ?? undefined;
    }

    await payload.updateGlobal({
      slug: "gmail-connection",
      overrideAccess: true,
      data: {
        emailAddress,
        encryptedAccessToken: encrypt(tokens.access_token),
        encryptedRefreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scopes: tokens.scope ? tokens.scope.split(" ") : [GMAIL_READONLY_SCOPE],
        connectedAt: new Date().toISOString(),
      },
    });

    return htmlResponse(
      200,
      "Gmail gekoppeld",
      `Succesvol gekoppeld: <strong>${escapeHtml(emailAddress)}</strong>`
    );
  } catch (error) {
    console.error("[api/gmail/oauth/callback] Koppelen mislukt:", error);
    return htmlResponse(500, "Koppelen mislukt", "Er ging iets mis bij het koppelen. Probeer het opnieuw.");
  }
}
