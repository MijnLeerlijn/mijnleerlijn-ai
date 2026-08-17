import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import {
  buildGoogleAuthUrl,
  GOOGLE_CALENDAR_READONLY_SCOPE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_UID_COOKIE,
  GOOGLE_OAUTH_CAPABILITY_COOKIE,
  naarGoogleOAuthCapability,
} from "@/lib/google-calendar/oauth";
import { GOOGLE_GMAIL_SCOPES } from "@/lib/google-gmail/oauth";
import { isProduction } from "@/config/env";

const STATE_COOKIE_MAX_AGE_S = 10 * 60; // 10 minuten — ruim genoeg om het Google-consentscherm af te ronden

// Start van een persoonlijke Google-koppeling — elke ingelogde gebruiker mag
// dit starten (isEditor, NIET isAdmin zoals app/api/gmail/oauth/start: hier
// koppelt IEDEREEN zijn eigen account, geen gedeeld beheerdersaccount).
// Zelfde CSRF-state-cookie-aanpak als de Helpdesk-Gmail-koppeling, plus een
// TWEEDE httpOnly-cookie met de initiërende gebruiker-ID — zie
// lib/google-calendar/oauth.ts se toelichting bij GOOGLE_OAUTH_UID_COOKIE
// (nodig omdat de callback naar een Collection schrijft — één rij per
// gebruiker — niet naar een Global met precies één rij zoals bij Gmail-Helpdesk).
//
// Mijn Werk Fase 3 (2026-08-17) — ?capability=agenda|gmail bepaalt welke
// scope-bundel wordt aangevraagd (ontbrekend/onbekend valt terug op
// "agenda", zie naarGoogleOAuthCapability — bestaande "Agenda koppelen"-
// links zonder deze parameter blijven dus ongewijzigd werken). Een DERDE
// cookie onthoudt welke capability dit was, zodat de callback weet welke
// profiel-fetch-functie hij mag gebruiken (zie dat bestand).
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });

  if (!isEditor(user as AuthUser | null)) {
    return NextResponse.json({ error: "Log in op /admin om te koppelen." }, { status: 403 });
  }

  const capability = naarGoogleOAuthCapability(request.nextUrl.searchParams.get("capability"));
  const scope = capability === "gmail" ? GOOGLE_GMAIL_SCOPES : GOOGLE_CALENDAR_READONLY_SCOPE;

  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(buildGoogleAuthUrl(state, scope));
  const cookieOpties = {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    maxAge: STATE_COOKIE_MAX_AGE_S,
    path: "/api/google/oauth",
  };
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, cookieOpties);
  response.cookies.set(GOOGLE_OAUTH_UID_COOKIE, String((user as AuthUser).id), cookieOpties);
  response.cookies.set(GOOGLE_OAUTH_CAPABILITY_COOKIE, capability, cookieOpties);
  return response;
}
