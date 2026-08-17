import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  exchangeCodeForTokens,
  fetchPrimaryCalendar,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_UID_COOKIE,
  GOOGLE_OAUTH_CAPABILITY_COOKIE,
  naarGoogleOAuthCapability,
} from "@/lib/google-calendar/oauth";
import { fetchGmailProfileAddress } from "@/lib/google-gmail/oauth";
import { upsertGoogleConnection } from "@/lib/google-calendar/connection";

// Callbackroute van de persoonlijke Google-OAuth-koppeling (Agenda én,
// sinds Mijn Werk Fase 3, Gmail). Zelfde architectuur als app/api/gmail/
// oauth/callback/route.ts — zie dat bestand voor de volle toelichting waarom
// hier BEWUST GEEN payload.auth()-hercontrole gebeurt: Google's redirect
// terug is voor de browser een cross-site top-level navigatie, en Payload's
// eigen cookie-auth-extractie verwerpt de sessiecookie daar altijd
// (Sec-Fetch-Site "cross-site"), ook voor een echt ingelogde gebruiker. De
// autorisatie loopt hier via DRIE httpOnly-cookies i.p.v. Gmail-Helpdesk se
// ene: de state-cookie (CSRF, identiek aan Gmail) plus de uid-cookie (WELKE
// gebruiker — nodig omdat dit een Collection is met één rij PER GEBRUIKER,
// geen Global met precies één rij) plus de capability-cookie (welke
// scope-bundel net is aangevraagd, zie hieronder). Alle drie alleen ooit
// gezet door /start ná een geslaagde isEditor-controle (gewone same-origin
// aanvraag, geen probleem daar), httpOnly, willekeurig/kortlevend/eenmalig —
// dat is hier zowel de CSRF- als de autorisatiewaarborg.

// `message` mag beperkte inline HTML bevatten (bv. <strong>) — dynamische
// waarden moeten daarom door de aanroeper al met escapeHtml() zijn ontsnapt
// vóórdat ze in `message` terechtkomen. `title` komt nooit van buitenaf.
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
  // Alle drie eenmalige cookies altijd opruimen, ongeacht de uitkomst.
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/api/google/oauth" });
  response.cookies.set(GOOGLE_OAUTH_UID_COOKIE, "", { maxAge: 0, path: "/api/google/oauth" });
  response.cookies.set(GOOGLE_OAUTH_CAPABILITY_COOKIE, "", { maxAge: 0, path: "/api/google/oauth" });
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
  const cookieState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const cookieUid = request.cookies.get(GOOGLE_OAUTH_UID_COOKIE)?.value;
  const capability = naarGoogleOAuthCapability(request.cookies.get(GOOGLE_OAUTH_CAPABILITY_COOKIE)?.value);
  const userId = cookieUid ? Number(cookieUid) : NaN;
  if (!state || !cookieState || state !== cookieState || !Number.isInteger(userId)) {
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
    // Welke profiel-endpoint we mogen aanroepen hangt af van WELKE scope
    // deze specifieke koppelpoging aanvroeg (capability-cookie) — niet van
    // wat er eventueel al eerder gekoppeld was. Een gebruiker die uitsluitend
    // Gmail koppelt (nooit Agenda) heeft geen calendar.readonly-scope, dus
    // zou fetchPrimaryCalendar altijd laten falen; omgekeerd voor agenda.
    const emailAddress =
      capability === "gmail"
        ? await fetchGmailProfileAddress(tokens.access_token)
        : (await fetchPrimaryCalendar(tokens.access_token)).emailAddress;

    await upsertGoogleConnection(payload, userId, {
      emailAddress,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
      scope: tokens.scope,
    });

    const titel = capability === "gmail" ? "Gmail gekoppeld" : "Google Agenda gekoppeld";
    return htmlResponse(200, titel, `Succesvol gekoppeld: <strong>${escapeHtml(emailAddress)}</strong>. Je kunt dit tabblad sluiten.`);
  } catch (error) {
    console.error("[api/google/oauth/callback] Koppelen mislukt:", error);
    return htmlResponse(500, "Koppelen mislukt", "Er ging iets mis bij het koppelen. Probeer het opnieuw.");
  }
}
