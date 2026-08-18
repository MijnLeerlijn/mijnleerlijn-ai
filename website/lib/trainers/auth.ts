import { jwtVerify } from "jose";
import type { Payload } from "payload";
import { PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

// Traineromgeving V1, Ronde 1 (2026-08-19) — sessieverificatie voor de
// "trainers"-auth-collectie, rechtstreekse voortzetting van lib/auth/
// verify-session.ts se aanpak (zelfde reden: Payload's eigen cookie-
// extractiestrategie valt terug op een Origin/CSRF-allowlist-check die een
// fetch()-POST vanaf trainers.mijnleerlijn.chat evengoed kan raken).
//
// KERNVERSCHIL met verify-session.ts, en de reden dat dit bestand bestaat
// i.p.v. verifyAdminSessionCookie te hergebruiken (architectuurrapport §11,
// rechtstreeks bevestigd tegen de geïnstalleerde Payload-broncode,
// node_modules/payload/dist/auth/cookies.js/login.js): het sessiecookie
// heet ALTIJD "${cookiePrefix}-token", en cookiePrefix is een GLOBALE
// payload.config.ts-instelling — niet per auth-collectie. Een geldig
// "users"-token (admin/editor) en een geldig "trainers"-token delen dus
// LETTERLIJK dezelfde cookienaam (PAYLOAD_SESSION_COOKIE_NAME,
// hergebruikt — geen eigen kopie van die constante, juist om de gedeelde
// naam expliciet te houden). Het JWT zelf draagt wél een eigen
// `collection`-claim ("trainers" vs. "users") — de controle hieronder op
// die claim is daarom de ENIGE plek waar de twee sessietypes uit elkaar
// gehouden worden. Cookie-aanwezigheid alleen is nooit voldoende: een
// geldig, ondertekend users-token moet hier hard geweigerd worden, en
// vice versa (zie auth.test.ts — expliciet getest in beide richtingen).

interface TrainerJwtClaims {
  id: number;
  collection: string;
  sid?: string;
  exp: number;
}

/** Minimale, voor autorisatie/weergave benodigde velden — zelfde bewuste keuze als AuthUser in payload/access/roles.ts, geen volledige gegenereerde Trainer-rij. */
export interface AuthTrainer {
  id: number;
  name: string;
  email: string;
  mondayTrainerboardId: string;
  mondayUitvoerderItemId: string;
  actief: boolean;
}

export type TrainerSessieAfwijzingReden =
  | "geen-cookie"
  | "ongeldig-token"
  | "verkeerde-collectie"
  | "trainer-niet-gevonden"
  | "sessie-niet-actief"
  | "trainer-inactief";

export interface TrainerSessieControleResultaat {
  trainer: AuthTrainer | null;
  cookieAanwezig: boolean;
  reden?: TrainerSessieAfwijzingReden;
}

export async function verifyTrainerSessionCookie(
  payload: Payload,
  cookieHeaderWaarde: string | undefined
): Promise<TrainerSessieControleResultaat> {
  if (!cookieHeaderWaarde) {
    return { trainer: null, cookieAanwezig: false, reden: "geen-cookie" };
  }

  try {
    const secretKey = new TextEncoder().encode(payload.secret);
    const { payload: claims } = await jwtVerify(cookieHeaderWaarde, secretKey);
    const typedClaims = claims as unknown as TrainerJwtClaims;

    // KERNCONTROLE — zie moduletoelichting hierboven. Nooit weglaten, ook
    // niet als een aanroeper "vast wel" alleen trainers doorstuurt.
    if (typedClaims.collection !== "trainers") {
      return { trainer: null, cookieAanwezig: true, reden: "verkeerde-collectie" };
    }

    const trainer = await payload.findByID({
      collection: "trainers",
      id: typedClaims.id,
      overrideAccess: true,
      depth: 0,
    });
    if (!trainer) {
      return { trainer: null, cookieAanwezig: true, reden: "trainer-niet-gevonden" };
    }

    const sessies = (trainer.sessions ?? []) as { id: string }[];
    if (!typedClaims.sid || !sessies.some((sessie) => sessie.id === typedClaims.sid)) {
      return { trainer: null, cookieAanwezig: true, reden: "sessie-niet-actief" };
    }

    if (!trainer.actief) {
      return { trainer: null, cookieAanwezig: true, reden: "trainer-inactief" };
    }

    return {
      trainer: {
        id: trainer.id,
        name: trainer.name,
        email: trainer.email ?? "",
        mondayTrainerboardId: trainer.mondayTrainerboardId,
        mondayUitvoerderItemId: trainer.mondayUitvoerderItemId,
        actief: Boolean(trainer.actief),
      },
      cookieAanwezig: true,
    };
  } catch {
    return { trainer: null, cookieAanwezig: true, reden: "ongeldig-token" };
  }
}

export { PAYLOAD_SESSION_COOKIE_NAME as TRAINER_SESSION_COOKIE_NAME };
