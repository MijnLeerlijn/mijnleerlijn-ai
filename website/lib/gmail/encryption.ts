import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { requireEnv } from "@/config/env";

// Versleuteling-at-rest voor de Gmail OAuth-tokens (payload/globals/
// GmailConnection.ts) — AES-256-GCM met een eigen, losse sleutel
// (GMAIL_TOKEN_ENCRYPTION_KEY), bewust NIET PAYLOAD_SECRET: die tekent
// Payload's eigen sessies/JWT's, een heel ander beveiligingsdomein. Eén
// sleutel voor twee doelen zou een rotatie van de één de ander laten breken,
// en versleutel- en ondertekensleutels horen sowieso gescheiden te zijn.
//
// GMAIL_TOKEN_ENCRYPTION_KEY mag een willekeurige, voldoende lange
// geheime string zijn (geen exacte lengte-eis) — met SHA-256 afgeleid tot
// een geldige 256-bit AES-sleutel, zodat er geen fragiele "moet precies
// 32 bytes zijn"-eis aan de operator wordt gesteld.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // aanbevolen IV-lengte voor GCM

function sleutel(): Buffer {
  return createHash("sha256").update(requireEnv("GMAIL_TOKEN_ENCRYPTION_KEY")).digest();
}

/** Versleutelt platte tekst (bv. een OAuth-token) tot `iv.authTag.ciphertext`, alles base64url. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, sleutel(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64url")).join(".");
}

/** Ontsleutelt een door `encrypt` geproduceerde string. Gooit een fout bij een ongeldige/aangepaste waarde (authenticated encryption). */
export function decrypt(payload: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Ongeldig versleuteld tokenformaat.");
  }
  const decipher = createDecipheriv(ALGORITHM, sleutel(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
