import { jwtVerify } from "jose";
import type { Payload } from "payload";
import type { AuthUser } from "@/payload/access/roles";

// Rechtstreekse, cryptografische verificatie van Payload's eigen
// sessiecookie — zonder via payload.auth()/executeAuthStrategies te lopen.
//
// WAAROM dit nodig is (gevonden tijdens het onderzoek naar "beheerder
// ingelogd, maar route ziet geen gebruiker"): Payload's cookie-
// extractiestrategie (node_modules/payload/dist/auth/extractJWT.js) valt
// een cookie alleen toe wanneer de binnenkomende `Origin`-header exact
// voorkomt in `payload.config.csrf` — een array die (sanitize.js) altijd
// precies uit `payload.config.serverURL` bestaat, d.w.z. uit
// NEXT_PUBLIC_SERVER_URL. Een gewone top-level GET-navigatie (zoals
// app/api/gmail/oauth/start, dat wél werkt) stuurt vaak HELEMAAL GEEN
// Origin-header en valt terug op een Sec-Fetch-Site: same-origin-check, die
// niet van die array afhangt. Een fetch()-POST (zoals de "Test
// synchronisatie"-knop) stuurt daarentegen ALTIJD een Origin-header — en
// zodra NEXT_PUBLIC_SERVER_URL in de omgeving niet exact (protocol + host,
// geen trailing slash) overeenkomt met de echte aanvraag-origin, wordt de
// verder volkomen geldige sessiecookie stilzwijgend verworpen. Dat is
// precies waarom /start wél en /sync niet werkte, met identieke
// payload.auth()-code in beide routes.
//
// Deze functie omzeilt die Origin-afhankelijke gate volledig, maar is
// NIET minder veilig: ze accepteert uitsluitend een token met een geldige
// HS256-handtekening, niet verlopen, én met een sessie-id dat nog voorkomt
// in de gebruiker.sessions-array — exact dezelfde controles als Payload's
// eigen JWTAuthentication-strategie (node_modules/payload/dist/auth/
// strategies/jwt.js), op de Origin-check na. Geen hardcoded bypass: een
// vervalst, verlopen of uitgelogde token wordt nog steeds geweigerd.
//
// BELANGRIJK, tijdens het bouwen ontdekt: Payload ondertekent NIET met de
// ruwe PAYLOAD_SECRET-string. Bij het opstarten leidt Payload een intern
// signeersleutel af — `sha256(config.secret).hex().slice(0, 32)`, zie
// node_modules/payload/dist/index.js regel ~321 — en gebruikt uitsluitend
// díe afgeleide waarde voor jwtSign/jwtVerify. Zelf opnieuw sha256(...)
// uitrekenen op de env-var zou dus (en deed dat eerst ook, zie de
// commit-geschiedenis) een compleet andere sleutel opleveren dan waarmee
// Payload daadwerkelijk ondertekent. `payload.secret` is die al-afgeleide
// waarde rechtstreeks op de Payload-instance — dat is de correcte,
// enige-juiste bron, geen eigen (opnieuw) afleiding nodig of gewenst.

const COOKIE_NAME = "payload-token"; // Payload's default cookiePrefix ("payload") — payload.config.ts wijzigt dit niet.

interface PayloadJwtClaims {
  id: number;
  collection: string;
  sid?: string;
  exp: number;
}

export type SessieAfwijzingReden =
  "geen-cookie" | "ongeldig-token" | "verkeerde-collectie" | "gebruiker-niet-gevonden" | "sessie-niet-actief";

export interface SessieControleResultaat {
  user: AuthUser | null;
  cookieAanwezig: boolean;
  reden?: SessieAfwijzingReden;
}

export async function verifyAdminSessionCookie(
  payload: Payload,
  cookieHeaderWaarde: string | undefined
): Promise<SessieControleResultaat> {
  if (!cookieHeaderWaarde) {
    return { user: null, cookieAanwezig: false, reden: "geen-cookie" };
  }

  try {
    const secretKey = new TextEncoder().encode(payload.secret);
    const { payload: claims } = await jwtVerify(cookieHeaderWaarde, secretKey);
    const typedClaims = claims as unknown as PayloadJwtClaims;

    if (typedClaims.collection !== "users") {
      return { user: null, cookieAanwezig: true, reden: "verkeerde-collectie" };
    }

    const gebruiker = await payload.findByID({
      collection: "users",
      id: typedClaims.id,
      overrideAccess: true,
      depth: 0,
    });
    if (!gebruiker) {
      return { user: null, cookieAanwezig: true, reden: "gebruiker-niet-gevonden" };
    }

    // Users.ts gebruikt `auth: true` → useSessions staat standaard aan
    // (payload/dist/collections/config/defaults.js) — een token zonder
    // (nog) actieve sessie-vermelding hoort net zo min te werken als bij
    // Payload's eigen strategie (bv. na uitloggen op een ander apparaat).
    const sessies = (gebruiker.sessions ?? []) as { id: string }[];
    if (!typedClaims.sid || !sessies.some((sessie) => sessie.id === typedClaims.sid)) {
      return { user: null, cookieAanwezig: true, reden: "sessie-niet-actief" };
    }

    return { user: gebruiker as unknown as AuthUser, cookieAanwezig: true };
  } catch {
    return { user: null, cookieAanwezig: true, reden: "ongeldig-token" };
  }
}

export { COOKIE_NAME as PAYLOAD_SESSION_COOKIE_NAME };
