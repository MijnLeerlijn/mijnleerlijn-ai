import { requireEnv } from "@/config/env";
import { decryptMetSleutel, encryptMetSleutel } from "@/lib/security/token-crypto";

// Versleuteling-at-rest voor de Gmail OAuth-tokens (payload/globals/
// GmailConnection.ts) — dunne wrapper rond lib/security/token-crypto.ts met
// GMAIL_TOKEN_ENCRYPTION_KEY als sleutel (Mijn Werk Fase 2, 2026-08-17: de
// AES-256-GCM-implementatie zelf verhuisde naar token-crypto.ts zodat de
// nieuwe Google Calendar-koppeling hem kan hergebruiken met een eigen
// sleutel — zie dat bestand). Bewust NIET PAYLOAD_SECRET: die tekent
// Payload's eigen sessies/JWT's, een heel ander beveiligingsdomein. Eén
// sleutel voor twee doelen zou een rotatie van de één de ander laten breken,
// en versleutel- en ondertekensleutels horen sowieso gescheiden te zijn.
//
// Publieke API (encrypt/decrypt, één string-argument) blijft ongewijzigd —
// lib/gmail/sync.ts, app/api/gmail/oauth/callback/route.ts en dit bestand se
// eigen test blijven zonder aanpassing werken.

/** Versleutelt platte tekst (bv. een OAuth-token) tot `iv.authTag.ciphertext`, alles base64url. */
export function encrypt(plaintext: string): string {
  return encryptMetSleutel(plaintext, requireEnv("GMAIL_TOKEN_ENCRYPTION_KEY"));
}

/** Ontsleutelt een door `encrypt` geproduceerde string. Gooit een fout bij een ongeldige/aangepaste waarde (authenticated encryption). */
export function decrypt(payload: string): string {
  return decryptMetSleutel(payload, requireEnv("GMAIL_TOKEN_ENCRYPTION_KEY"));
}
