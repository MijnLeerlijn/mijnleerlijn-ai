import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./encryption";

describe("lib/gmail/encryption", () => {
  it("versleutelt en ontsleutelt weer tot de oorspronkelijke waarde", () => {
    const origineel = "ya29.a0AfH6SMB_nep_access_token_voorbeeld";
    const ciphertext = encrypt(origineel);
    expect(ciphertext).not.toContain(origineel);
    expect(decrypt(ciphertext)).toBe(origineel);
  });

  it("produceert elke keer een andere ciphertext (willekeurige IV), ook voor dezelfde platte tekst", () => {
    const origineel = "1//nep-refresh-token";
    expect(encrypt(origineel)).not.toBe(encrypt(origineel));
  });

  it("weigert te ontsleutelen wanneer de ciphertext is aangepast (authenticated encryption)", () => {
    const ciphertext = encrypt("geheime-waarde");
    const [iv, authTag, data] = ciphertext.split(".");
    const geknoeid = [iv, authTag, `${data}x`].join(".");
    expect(() => decrypt(geknoeid)).toThrow();
  });

  it("gooit een duidelijke fout bij een onherkenbaar formaat", () => {
    expect(() => decrypt("niet-het-juiste-formaat")).toThrow("Ongeldig versleuteld tokenformaat.");
  });
});
