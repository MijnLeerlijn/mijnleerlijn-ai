import { requireEnv } from "@/config/env";

// Google OAuth 2.0 "web server application"-flow voor de Gmail-helpdesk-
// koppeling — zie app/api/gmail/oauth/start en .../callback. Rechtstreekse
// fetch-aanroepen naar Google's endpoints (geen googleapis-SDK): het gaat om
// twee simpele HTTP-aanroepen (code-inwisseling, profiel ophalen), een hele
// SDK toevoegen voor zo weinig gebruik is onnodige complexiteit.
//
// Scope is bewust minimaal: uitsluitend gmail.readonly (leestoegang,
// inclusief users.getProfile — genoeg om het gekoppelde adres op te halen,
// geen aparte userinfo/profiel-scope nodig). Er wordt in deze stap nog
// niets geïmporteerd — dat is een latere, aparte stap.

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** Naam van de kortlevende httpOnly CSRF-state-cookie, gedeeld tussen /start en /callback. */
export const GMAIL_OAUTH_STATE_COOKIE = "gmail_oauth_state";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_PROFILE_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

function gmailEnv() {
  return {
    clientId: requireEnv("GMAIL_CLIENT_ID"),
    clientSecret: requireEnv("GMAIL_CLIENT_SECRET"),
    redirectUri: requireEnv("GMAIL_REDIRECT_URI"),
  };
}

/** Bouwt de Google-consentscherm-URL. `access_type=offline` + `prompt=consent` garanderen een refresh_token, ook bij een herkoppeling. */
export function buildGoogleAuthUrl(state: string): string {
  const { clientId, redirectUri } = gmailEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  /** Alleen aanwezig bij de eerste toestemming (of met prompt=consent, dus hier altijd verwacht) — zie buildGoogleAuthUrl. */
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/** Wisselt de authorization code server-side in voor tokens — de client secret verlaat deze functie nooit. */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = gmailEnv();
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const tekst = await response.text().catch(() => "");
    throw new Error(`Google token-inwisseling mislukt (${response.status}): ${tekst}`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

/** Haalt het gekoppelde Gmail-adres op — leestoegang via de gmail.readonly-scope, geen extra scope nodig. */
export async function fetchGmailAddress(accessToken: string): Promise<string> {
  const response = await fetch(GMAIL_PROFILE_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const tekst = await response.text().catch(() => "");
    throw new Error(`Ophalen Gmail-profiel mislukt (${response.status}): ${tekst}`);
  }

  const profiel = (await response.json()) as { emailAddress?: string };
  if (!profiel.emailAddress) {
    throw new Error("Gmail-profiel bevatte geen e-mailadres.");
  }
  return profiel.emailAddress;
}
