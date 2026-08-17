import { describe, it, expect } from "vitest";
import { encryptMetSleutel, decryptMetSleutel } from "./token-crypto";

describe("lib/security/token-crypto", () => {
  const sleutel = "test-sleutel-A-niet-voor-productie";

  it("versleutelt en ontsleutelt weer tot de oorspronkelijke waarde", () => {
    const origineel = "ya29.a0AfH6SMB_nep_access_token_voorbeeld";
    const ciphertext = encryptMetSleutel(origineel, sleutel);
    expect(ciphertext).not.toContain(origineel);
    expect(decryptMetSleutel(ciphertext, sleutel)).toBe(origineel);
  });

  it("produceert elke keer een andere ciphertext (willekeurige IV), ook voor dezelfde platte tekst", () => {
    const origineel = "1//nep-refresh-token";
    expect(encryptMetSleutel(origineel, sleutel)).not.toBe(encryptMetSleutel(origineel, sleutel));
  });

  it("weigert te ontsleutelen wanneer de ciphertext is aangepast (authenticated encryption)", () => {
    const ciphertext = encryptMetSleutel("geheime-waarde", sleutel);
    const [iv, authTag, data] = ciphertext.split(".");
    const geknoeid = [iv, authTag, `${data}x`].join(".");
    expect(() => decryptMetSleutel(geknoeid, sleutel)).toThrow();
  });

  it("gooit een duidelijke fout bij een onherkenbaar formaat", () => {
    expect(() => decryptMetSleutel("niet-het-juiste-formaat", sleutel)).toThrow("Ongeldig versleuteld tokenformaat.");
  });

  it("twee verschillende sleutels zijn niet onderling uitwisselbaar", () => {
    const ciphertext = encryptMetSleutel("geheim", sleutel);
    expect(() => decryptMetSleutel(ciphertext, "een-andere-sleutel-B")).toThrow();
  });
});
