// Mijn Werk Fase 3 (2026-08-17) — Gmail-specifieke OAuth-stukjes voor de
// PERSOONLIJKE koppeling. Volledig los van lib/gmail/oauth.ts (de
// Helpdesk-koppeling): eigen bestand, geen enkele import daaruit of daarnaar
// — de twee integraties mogen nooit kruisen (aparte env-vars, aparte
// encryptiesleutel, aparte collectie/global, zie payload/collections/
// GoogleConnections.ts en payload/globals/GmailConnection.ts).
//
// De generieke tokenwissel-/vernieuw-/authUrl-plumbing (exchangeCodeForTokens/
// refreshAccessToken/buildGoogleAuthUrl) staat in lib/google-calendar/oauth.ts
// en wordt ONGEWIJZIGD hergebruikt — die functies zijn niet Calendar-
// specifiek, ze werken voor elk GOOGLE_CLIENT_ID-scope-verzoek. Dit bestand
// voegt alleen toe wat Gmail-specifiek is: de scope-bundel en het ophalen
// van het gekoppelde adres via de Gmail-profiel-endpoint (i.p.v. via de
// Calendar-primary-endpoint, die zonder calendar.readonly-scope niet werkt).

// Bewust alleen readonly + send, geen gmail.modify/gmail.compose (breder dan
// nodig). Losse constanten (voor scopes.includes(...)-controles, zowel
// server- als client-side — dit bestand heeft geen server-only imports) én
// een spatie-gescheiden bundel (voor buildGoogleAuthUrl — "Gmail koppelen"
// is voor de gebruiker één actie, geen twee losse toestemmingen).
export const GOOGLE_GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GOOGLE_GMAIL_SCOPES = `${GOOGLE_GMAIL_READONLY_SCOPE} ${GOOGLE_GMAIL_SEND_SCOPE}`;

/**
 * Of een koppeling (diens `scopes`-array, zoals opgeslagen op
 * GoogleConnections) daadwerkelijk BEIDE Gmail-scopes bevat — een gebruiker
 * kan een koppeling hebben die uitsluitend calendar.readonly bevat (nog
 * nooit Gmail gekoppeld) of andersom. Puur, geen server-only afhankelijkheden
 * — bruikbaar zowel server-side (routes) als client-side (koppelstatus-UI),
 * zelfde bron van waarheid op beide plekken.
 */
export function heeftGmailScopes(scopes: string[] | null | undefined): boolean {
  return Boolean(scopes?.includes(GOOGLE_GMAIL_READONLY_SCOPE) && scopes?.includes(GOOGLE_GMAIL_SEND_SCOPE));
}

const GMAIL_PROFILE_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

/**
 * Haalt het gekoppelde Gmail-adres op — leestoegang via de gmail.readonly-
 * scope, geen extra scope nodig. Eigen, onafhankelijke implementatie (niet
 * geïmporteerd uit lib/gmail/oauth.ts se fetchGmailAddress) — zelfde
 * "elke OAuth-integratie heeft zijn eigen kleine profiel-fetch"-conventie
 * als lib/google-calendar/oauth.ts se fetchPrimaryCalendar, nooit een
 * gedeelde abstractie tussen de Helpdesk- en de persoonlijke koppeling.
 */
export async function fetchGmailProfileAddress(accessToken: string): Promise<string> {
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
