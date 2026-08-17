import type { Payload } from "payload";
import { refreshAccessToken, GOOGLE_CALENDAR_READONLY_SCOPE } from "./oauth";
import { encryptMetSleutel, decryptMetSleutel } from "@/lib/security/token-crypto";
import { requireEnv } from "@/config/env";

// Persistentielaag voor de per-gebruiker Google Calendar-koppeling — zie
// payload/collections/GoogleConnections.ts. Zelfde overrideAccess:true+
// expliciete where-scoping-conventie als de rest van lib/ (bv.
// lib/embeddings/similarity-search.ts, lib/creator/approve-mail-knowledge.ts):
// de AANROEPENDE route bepaalt via verifyAdminSessionCookie WIE, deze
// functies scopen vervolgens altijd expliciet op die userId — nooit
// Payload's request-gebonden access control hier, er is geen HTTP-request.
//
// Refresh-before-use hergebruikt exact het patroon van lib/gmail/sync.ts se
// verkrijgGeldigAccessToken, maar dan gescoped op één rij per gebruiker
// (find i.p.v. findGlobal) én met een status-veld: een mislukte vernieuwing
// (ingetrokken/ongeldige toestemming) zet de koppeling op "verlopen" i.p.v.
// bij elke volgende lezing opnieuw tegen Google's token-endpoint te falen —
// alleen een nieuwe OAuth-koppeling ("Opnieuw verbinden") herstelt dat.

const TOKEN_REFRESH_BUFFER_MS = 60_000;

function sleutel(): string {
  return requireEnv("GOOGLE_TOKEN_ENCRYPTION_KEY");
}

export interface GoogleConnectionDoc {
  id: number;
  emailAddress: string | null;
  status: "actief" | "verlopen";
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string | null;
  /** Mijn Werk Fase 3 (2026-08-17) — toegevoegd zodat aanroepers (bv. lib/werk/mail-reply.ts) kunnen controleren of een specifieke scope (Agenda/Gmail) daadwerkelijk is toegekend, i.p.v. aan te nemen dat elk geldig token elke scope dekt. */
  scopes: string[] | null;
}

/** Haalt de eigen Google-koppeling op, of null wanneer niet (meer) gekoppeld. */
export async function haalGoogleConnection(payload: Payload, userId: number): Promise<GoogleConnectionDoc | null> {
  const resultaat = await payload.find({
    collection: "google-connections",
    where: { eigenaar: { equals: userId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return (resultaat.docs[0] as unknown as GoogleConnectionDoc | undefined) ?? null;
}

export interface UpsertGoogleConnectionInput {
  emailAddress: string;
  accessToken: string;
  /** Optioneel — Google geeft bij een refresh geen nieuwe refresh_token terug; de bestaande (versleuteld) blijft dan behouden. */
  refreshToken?: string;
  expiresInSeconds: number;
  scope: string;
}

/**
 * Maakt de koppeling aan, of werkt de bestaande bij (per gebruiker hoogstens
 * één rij, zie de unique index in de migratie). Uitsluitend aangeroepen door
 * app/api/google/oauth/callback — daar met overrideAccess: true om exact
 * dezelfde, gedocumenteerde reden als app/api/gmail/oauth/callback (cross-
 * site OAuth-redirect zonder bruikbare payload.auth()-sessie).
 */
export async function upsertGoogleConnection(
  payload: Payload,
  userId: number,
  input: UpsertGoogleConnectionInput
): Promise<void> {
  const bestaand = await haalGoogleConnection(payload, userId);

  const encryptedRefreshToken = input.refreshToken
    ? encryptMetSleutel(input.refreshToken, sleutel())
    : (bestaand?.encryptedRefreshToken ?? undefined);

  const data = {
    eigenaar: userId,
    emailAddress: input.emailAddress,
    status: "actief" as const,
    encryptedAccessToken: encryptMetSleutel(input.accessToken, sleutel()),
    encryptedRefreshToken,
    tokenExpiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
    scopes: input.scope ? input.scope.split(" ") : [GOOGLE_CALENDAR_READONLY_SCOPE],
    connectedAt: new Date().toISOString(),
  };

  if (bestaand) {
    await payload.update({ collection: "google-connections", id: bestaand.id, overrideAccess: true, data });
  } else {
    await payload.create({ collection: "google-connections", overrideAccess: true, data });
  }
}

export interface GeldigeToegang {
  accessToken: string;
  connectionId: number;
  /** Mijn Werk Fase 3 (2026-08-17) — de daadwerkelijk toegekende scopes op deze koppeling (ongewijzigd door een refresh — Google geeft bij een refresh dezelfde grant terug). Zie lib/google-gmail/oauth.ts se heeftGmailScopes voor de bijbehorende controle. */
  scopes: string[];
}

/**
 * Geeft een geldig access token terug voor deze gebruiker, of null wanneer er
 * geen (bruikbare) koppeling is — null betekent voor de aanroeper altijd
 * "toon de koppel-CTA / Opnieuw verbinden", nooit een crash. Geeft een geldig
 * token terug ONGEACHT welke scopes zijn toegekend — de aanroeper controleert
 * zelf (via het scopes-veld) of de gewenste scope er daadwerkelijk bij zit
 * vóórdat een scope-specifieke API wordt aangeroepen (zie lib/werk/mail-reply.ts).
 */
export async function verkrijgGeldigeToegang(payload: Payload, userId: number): Promise<GeldigeToegang | null> {
  const connection = await haalGoogleConnection(payload, userId);
  if (!connection?.encryptedAccessToken || !connection?.encryptedRefreshToken) {
    return null;
  }
  if (connection.status === "verlopen") {
    return null;
  }
  const scopes = connection.scopes ?? [];

  const verlooptOp = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : 0;
  if (Date.now() < verlooptOp - TOKEN_REFRESH_BUFFER_MS) {
    return { accessToken: decryptMetSleutel(connection.encryptedAccessToken, sleutel()), connectionId: connection.id, scopes };
  }

  try {
    const refreshToken = decryptMetSleutel(connection.encryptedRefreshToken, sleutel());
    const vernieuwd = await refreshAccessToken(refreshToken);
    await payload.update({
      collection: "google-connections",
      id: connection.id,
      overrideAccess: true,
      data: {
        encryptedAccessToken: encryptMetSleutel(vernieuwd.access_token, sleutel()),
        tokenExpiresAt: new Date(Date.now() + vernieuwd.expires_in * 1000).toISOString(),
      },
    });
    return { accessToken: vernieuwd.access_token, connectionId: connection.id, scopes };
  } catch {
    await payload
      .update({ collection: "google-connections", id: connection.id, overrideAccess: true, data: { status: "verlopen" } })
      .catch(() => {});
    return null;
  }
}

/** Zet lastUsedAt — uitsluitend na een geslaagde live agenda-lezing (app/api/werk/agenda). */
export async function markeerGoogleConnectionGebruikt(payload: Payload, connectionId: number): Promise<void> {
  await payload
    .update({
      collection: "google-connections",
      id: connectionId,
      overrideAccess: true,
      data: { lastUsedAt: new Date().toISOString() },
    })
    .catch(() => {});
}
