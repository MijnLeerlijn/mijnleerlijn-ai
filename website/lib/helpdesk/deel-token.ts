import { randomBytes, createHash } from "node:crypto";

// Chat delen via URL (2026-08-24) — zelfde tokenprimitief als de twee
// bestaande OAuth-CSRF-states in dit project (app/api/gmail/oauth/start/
// route.ts, app/api/google/oauth/start/route.ts): randomBytes(32) → base64url
// is hier het enige precedent voor een cryptografisch willekeurige,
// beveiligingsrelevante waarde. Nergens in dit project wordt zo'n token RAUW
// opgeslagen — hier wordt uitsluitend de sha256-hash bewaard (zelfde
// hash-en-vergelijk-idioom als lib/embeddings/text-hash.ts, hier toegepast op
// een toegangsgeheim i.p.v. contentwijziging-detectie): een databaselek geeft
// zo nooit werkende deel-links prijs.

/** 32 random bytes, base64url — 256 bits entropie, niet te raden/op te sommen. */
export function genereerDeelToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256-hex van de ruwe token — dit, nooit de ruwe token zelf, staat in de database. */
export function hashDeelToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
