import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Gedeelde AES-256-GCM-encryptie voor OAuth-tokens at rest — geëxtraheerd uit
// lib/gmail/encryption.ts (Mijn Werk Fase 2, 2026-08-17) zodat de nieuwe
// per-gebruiker Google Calendar-koppeling (payload/collections/
// GoogleConnections.ts) dezelfde beproefde encryptie kan gebruiken zonder de
// Gmail-koppeling aan te raken. lib/gmail/encryption.ts blijft bestaan als
// dunne wrapper (exact dezelfde encrypt/decrypt-signatuur, GMAIL_TOKEN_
// ENCRYPTION_KEY) — bestaande imports/tests breken niet.
//
// Elke aanroeper geeft zijn EIGEN omgevingsvariabele-sleutel mee — bewust
// geen gedeelde sleutel tussen features: rotatie van de ene mag de andere
// niet raken, en PAYLOAD_SECRET (Payload's eigen sessie/JWT-sleutel) is een
// ander beveiligingsdomein dan tokenversleuteling.
//
// De meegegeven sleutel mag een willekeurige, voldoende lange geheime string
// zijn (geen exacte lengte-eis) — met SHA-256 afgeleid tot een geldige
// 256-bit AES-sleutel, zodat er geen fragiele "moet precies 32 bytes
// zijn"-eis aan de operator wordt gesteld.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // aanbevolen IV-lengte voor GCM

function afgeleideSleutel(ruweSleutel: string): Buffer {
  return createHash("sha256").update(ruweSleutel).digest();
}

/** Versleutelt platte tekst (bv. een OAuth-token) tot `iv.authTag.ciphertext`, alles base64url. */
export function encryptMetSleutel(plaintext: string, ruweSleutel: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, afgeleideSleutel(ruweSleutel), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64url")).join(".");
}

/** Ontsleutelt een door `encryptMetSleutel` geproduceerde string. Gooit een fout bij een ongeldige/aangepaste waarde (authenticated encryption). */
export function decryptMetSleutel(payload: string, ruweSleutel: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Ongeldig versleuteld tokenformaat.");
  }
  const decipher = createDecipheriv(ALGORITHM, afgeleideSleutel(ruweSleutel), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
