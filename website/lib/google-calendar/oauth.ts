import { requireEnv } from "@/config/env";

// Google OAuth 2.0 "web server application"-flow voor persoonlijke Google-
// koppelingen — zie app/api/google/oauth/start en .../callback. Zelfde stijl
// als lib/gmail/oauth.ts: rechtstreekse fetch-aanroepen naar Google's
// endpoints, geen googleapis-SDK.
//
// Dit bestand heet naar zijn EERSTE gebruiker (Calendar), maar
// exchangeCodeForTokens/refreshAccessToken/buildGoogleAuthUrl hieronder zijn
// generieke OAuth-clientplumbing voor dit ene GOOGLE_CLIENT_ID/SECRET-paar,
// niet Calendar-specifiek — Mijn Werk Fase 3 (2026-08-17, Gmail) hergebruikt
// ze ongewijzigd (zie lib/google-gmail/oauth.ts voor de Gmail-scope-
// constante + Gmail-specifieke profiel-fetch). Bewust geen bestandsverplaatsing
// naar bv. lib/google-account/: dat zou de import-paden van alle al-werkende
// Fase 2-bestanden aanraken zonder functionele winst.

export const GOOGLE_CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

/** Naam van de kortlevende httpOnly CSRF-state-cookie, gedeeld tussen /start en /callback. */
export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
/**
 * Naam van de kortlevende httpOnly cookie met de initiërende gebruiker-ID.
 * Nodig omdat dit — anders dan gmail-connection — een Collection is (één rij
 * per gebruiker, geen gedeelde Global): de callback moet weten VOOR WIE hij
 * schrijft. Bewust een aparte cookie i.p.v. de state zelf te coderen: state
 * blijft zo een gewone, opake CSRF-nonce, geen eigen pack/unpack-formaat.
 * Nooit aan Google doorgegeven (staat niet in buildGoogleAuthUrl).
 */
export const GOOGLE_OAUTH_UID_COOKIE = "google_oauth_uid";

/**
 * Mijn Werk Fase 3 (2026-08-17) — welke capability ("agenda" of "gmail") deze
 * koppelpoging aanvraagt. Nodig zodra er meer dan één scope-bundel bestaat:
 * de callback moet weten welke profiel-fetch-functie hij mag gebruiken om
 * het gekoppelde adres te tonen (fetchPrimaryCalendar vereist
 * calendar.readonly, fetchGmailProfileAddress vereist een gmail-scope — een
 * gebruiker kan de een zonder de ander gekoppeld hebben). Bewust een derde,
 * even kortlevende/httpOnly/eenmalige cookie i.p.v. in `state` coderen —
 * zelfde reden als GOOGLE_OAUTH_UID_COOKIE hierboven: state blijft een pure,
 * opake CSRF-nonce.
 */
export const GOOGLE_OAUTH_CAPABILITY_COOKIE = "google_oauth_capability";
export type GoogleOAuthCapability = "agenda" | "gmail";

/** Onbekende/ontbrekende waarde valt terug op "agenda" — bestaande links (vóór Fase 3) zonder ?capability=... blijven zo exact hetzelfde gedrag houden. */
export function naarGoogleOAuthCapability(waarde: string | null | undefined): GoogleOAuthCapability {
  return waarde === "gmail" ? "gmail" : "agenda";
}

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_PRIMARY_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary";

function googleEnv() {
  return {
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: requireEnv("GOOGLE_REDIRECT_URI"),
  };
}

/**
 * Bouwt de Google-consentscherm-URL. `access_type=offline` + `prompt=consent`
 * garanderen een refresh_token, ook bij een herkoppeling. `scope` is
 * verplicht (Fase 3: Agenda en Gmail vragen elk hun eigen, minimale
 * scope-bundel aan — nooit een impliciete standaardwaarde die de aanroeper
 * per ongeluk de verkeerde/bredere scope laat aanvragen).
 * `include_granted_scopes=true` is essentieel voor incrementele autorisatie:
 * zonder deze vlag zou een latere, aparte koppelactie (bv. Gmail na Agenda)
 * de eerder toegekende scope uit het teruggegeven `scope`-veld laten
 * verdwijnen — met deze vlag bevat elke volgende tokenwisseling altijd de
 * VOLLEDIGE, opgetelde scope-set die deze gebruiker ooit aan dit
 * GOOGLE_CLIENT_ID heeft toegekend (zie upsertGoogleConnection, dat dit veld
 * ongewijzigd overneemt).
 */
export function buildGoogleAuthUrl(state: string, scope: string): string {
  const { clientId, redirectUri } = googleEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
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
  const { clientId, clientSecret, redirectUri } = googleEnv();
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

export interface GoogleRefreshResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/**
 * Vernieuwt een verlopen access token met de refresh token — Google geeft bij
 * een refresh normaal GEEN nieuwe refresh_token terug (de bestaande blijft
 * geldig). Gooit bij een ingetrokken/ongeldige toestemming (Google geeft dan
 * 400 invalid_grant) — de aanroeper (lib/google-calendar/connection.ts) zet
 * de koppeling in dat geval op status "verlopen".
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleRefreshResponse> {
  const { clientId, clientSecret } = googleEnv();
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const tekst = await response.text().catch(() => "");
    throw new Error(`Google token-vernieuwing mislukt (${response.status}): ${tekst}`);
  }

  return (await response.json()) as GoogleRefreshResponse;
}

export interface GooglePrimaryCalendar {
  emailAddress: string;
  timeZone: string;
}

/** Haalt e-mailadres (= id van de primary-agenda) + tijdzone op — leestoegang via calendar.readonly, geen extra scope nodig. */
export async function fetchPrimaryCalendar(accessToken: string): Promise<GooglePrimaryCalendar> {
  const response = await fetch(GOOGLE_CALENDAR_PRIMARY_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const tekst = await response.text().catch(() => "");
    throw new Error(`Ophalen Google-agendaprofiel mislukt (${response.status}): ${tekst}`);
  }

  const profiel = (await response.json()) as { id?: string; timeZone?: string };
  if (!profiel.id) {
    throw new Error("Google-agendaprofiel bevatte geen id (e-mailadres).");
  }
  return { emailAddress: profiel.id, timeZone: profiel.timeZone ?? "UTC" };
}
