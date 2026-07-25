import { cookies as nextCookies } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

// Authenticatie voor de beheeromgeving — zie docs/PLATFORM-FOUNDATION.md §9
// en docs/TODO.md beslissing 3 (Auth.js vs. Clerk). Payload's ingebouwde
// authenticatie (payload/collections/Users.ts, auth: true) is de gekozen
// oplossing: een aparte auth-provider zou een tweede, los sessiesysteem naast
// Payload's eigen rolgebonden access-control introduceren zonder functionele
// meerwaarde. Deze functie leest dezelfde sessie/cookie die Payload's
// admin-UI (/admin) al zet, zodat inloggen op /admin ook AuthProvider (en
// daarmee de eigen /beheer-schermen) authenticeert — één inlogsysteem, geen
// twee. Zie het Fase 4-opleveringsrapport voor de volledige motivatie.
//
// BUG (opgelost, live-verificatie /assistant 2026-07-25): dit riep eerder
// rechtstreeks payload.auth({headers}) aan. Zelfde onderliggende oorzaak als
// destijds gevonden en gefixt voor de POST-routes (zie het uitgebreide
// commentaar in lib/auth/verify-session.ts): Payload's cookie-extractie
// (node_modules/payload/dist/auth/extractJWT.js) verwerpt een overigens
// volkomen geldige sessiecookie zodra er een `Origin`-header aanwezig is die
// niet exact voorkomt in payload.config.csrf (= NEXT_PUBLIC_SERVER_URL), of
// zodra zowel Origin als Sec-Fetch-Site ontbreken (bv. bij server-naar-
// server-aanroepen zonder browsercontext). Live geconstateerd: herhaalde
// verzoeken met exact dezelfde, geldige sessiecookie gaven wisselend wel/geen
// gebruiker terug — puur afhankelijk van welke headers de aanroep toevallig
// meestuurde, niets aan de cookie zelf. lib/auth/verify-session.ts bestond
// al als de vastgestelde, geteste oplossing (rechtstreekse JWT-verificatie,
// zelfde controles als Payload's eigen strategie, zonder de Origin-afhankelijke
// poort) — deze functie was destijds simpelweg nooit meeverhuisd naar die fix.
export interface Sessie {
  gebruikerId: string;
  naam: string;
  rol: "editor" | "admin";
}

export async function haalSessieOp(): Promise<Sessie | null> {
  const payload = await getPayload({ config });
  const cookieStore = await nextCookies();
  const token = cookieStore.get(PAYLOAD_SESSION_COOKIE_NAME)?.value;
  const { user } = await verifyAdminSessionCookie(payload, token);
  if (!user) return null;
  // AuthUser (payload/access/roles.ts) is bewust een minimale interface voor
  // access-control-doeleinden en declareert geen `name` — verifyAdminSessionCookie()
  // geeft er in werkelijkheid het volledige Users-document uit (zie het
  // commentaar daar), dus `name` bestaat altijd op de runtime-waarde.
  const naam = (user as unknown as { name?: string }).name ?? "Onbekend";
  return { gebruikerId: String(user.id), naam, rol: user.role };
}
