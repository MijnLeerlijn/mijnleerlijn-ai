import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor, type AuthUser } from "@/payload/access/roles";
import { buildGoogleAuthUrl, GOOGLE_OAUTH_STATE_COOKIE, GOOGLE_OAUTH_UID_COOKIE } from "@/lib/google-calendar/oauth";
import { isProduction } from "@/config/env";

const STATE_COOKIE_MAX_AGE_S = 10 * 60; // 10 minuten — ruim genoeg om het Google-consentscherm af te ronden

// Start van de persoonlijke Google Calendar-koppeling — elke ingelogde
// gebruiker mag dit starten (isEditor, NIET isAdmin zoals
// app/api/gmail/oauth/start: hier koppelt IEDEREEN zijn eigen account, geen
// gedeeld beheerdersaccount). Zelfde CSRF-state-cookie-aanpak als de
// Gmail-koppeling, plus een TWEEDE httpOnly-cookie met de initiërende
// gebruiker-ID — zie lib/google-calendar/oauth.ts se toelichting bij
// GOOGLE_OAUTH_UID_COOKIE (nodig omdat de callback naar een Collection
// schrijft — één rij per gebruiker — niet naar een Global met precies één
// rij zoals bij Gmail).
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });

  if (!isEditor(user as AuthUser | null)) {
    return NextResponse.json({ error: "Log in op /admin om je Google Agenda te koppelen." }, { status: 403 });
  }

  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(buildGoogleAuthUrl(state));
  const cookieOpties = {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    maxAge: STATE_COOKIE_MAX_AGE_S,
    path: "/api/google/oauth",
  };
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, cookieOpties);
  response.cookies.set(GOOGLE_OAUTH_UID_COOKIE, String((user as AuthUser).id), cookieOpties);
  return response;
}
