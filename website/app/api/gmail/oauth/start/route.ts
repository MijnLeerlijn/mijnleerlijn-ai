import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin, type AuthUser } from "@/payload/access/roles";
import { buildGoogleAuthUrl, GMAIL_OAUTH_STATE_COOKIE } from "@/lib/gmail/oauth";
import { isProduction } from "@/config/env";

const STATE_COOKIE_MAX_AGE_S = 10 * 60; // 10 minuten — ruim genoeg om het Google-consentscherm af te ronden

// Start van de Gmail-OAuth-koppeling — uitsluitend voor ingelogde
// beheerders (zie payload/access/roles.ts isAdmin). Genereert een
// willekeurige `state` als CSRF-bescherming, bewaart die in een korte-duur
// httpOnly-cookie (geen serverside sessiestore nodig), en stuurt door naar
// Google's consentscherm. Zie app/api/gmail/oauth/callback/route.ts voor de
// verificatie van deze state.
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });

  if (!isAdmin(user as AuthUser | null)) {
    return NextResponse.json(
      { error: "Alleen beheerders mogen de Gmail-koppeling starten. Log in op /admin." },
      { status: 403 }
    );
  }

  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(buildGoogleAuthUrl(state));
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    maxAge: STATE_COOKIE_MAX_AGE_S,
    path: "/api/gmail/oauth",
  });
  return response;
}
