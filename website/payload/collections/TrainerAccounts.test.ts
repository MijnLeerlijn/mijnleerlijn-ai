import { describe, it, expect } from "vitest";
import { TrainerAccounts } from "./TrainerAccounts";

// Vervolgronde (volledig traineraccountbeheer) — dekt de nieuwe
// beforeValidate-hook op mobielNummer rechtstreeks (zelfde patroon als
// TrainerKennisversies.test.ts: Payload-veldhooks zijn kale functies, geen
// echte Payload-instantie nodig). Dit is de enige daadwerkelijk nieuwe
// businesslogica in "volledig traineraccountbeheer" — de rest van bewerken
// loopt via Payload's eigen, ongewijzigde collectie-editor/auth-mechanisme.
// Bewijst spec-eis "valideer formaat volgens bestaande telefoniecode" en
// "geen oude cache of duplicaat" (zie doc-comment bij het veld): normalisatie
// werkt ongeacht welke schrijfplek de admin-editor aanroept.

const mobielNummerVeld = TrainerAccounts.fields.find((veld) => "name" in veld && veld.name === "mobielNummer") as {
  hooks: { beforeValidate: Array<(args: { value?: string | null }) => unknown> };
};
const hook = mobielNummerVeld.hooks.beforeValidate[0]!;

describe("TrainerAccounts mobielNummer beforeValidate-hook — normalisatie", () => {
  it("normaliseert een 06-nummer naar E.164", () => {
    expect(hook({ value: "0612345678" })).toBe("+31612345678");
  });

  it("normaliseert een nummer met spaties/streepjes naar E.164", () => {
    expect(hook({ value: "06-1234 5678" })).toBe("+31612345678");
  });

  it("laat een al-E.164-nummer ongewijzigd (idempotent)", () => {
    expect(hook({ value: "+31612345678" })).toBe("+31612345678");
  });

  it("laat undefined ongewijzigd (veld niet meegestuurd)", () => {
    expect(hook({ value: undefined })).toBeUndefined();
  });

  it("laat null ongewijzigd (veld expliciet leeggemaakt)", () => {
    expect(hook({ value: null })).toBeNull();
  });

  it("laat een lege/whitespace-string ongewijzigd — geen normalisatiepoging, geen throw", () => {
    expect(hook({ value: "   " })).toBe("   ");
  });

  it("gooit een duidelijke Nederlandse foutmelding bij een ongeldig nummer, ongeacht de schrijfplek", () => {
    expect(() => hook({ value: "123" })).toThrow("Ongeldig telefoonnummer");
  });
});
