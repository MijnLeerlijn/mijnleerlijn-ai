import { describe, it, expect } from "vitest";
import { normaliseerNederlandsNummer, isGeldigE164 } from "./nummer";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — dekt lib/trainers/telefonie/
// nummer.ts. Spec §2: "geen fuzzy matching", "gebruik een bewezen
// telefoonnummerbibliotheek i.p.v. handgerolde parsing", altijd E.164.

describe("normaliseerNederlandsNummer", () => {
  it("normaliseert een lokaal 06-nummer naar E.164", () => {
    expect(normaliseerNederlandsNummer("0612345678")).toBe("+31612345678");
  });

  it("normaliseert een 0031-genoteerd nummer naar E.164", () => {
    expect(normaliseerNederlandsNummer("0031612345678")).toBe("+31612345678");
  });

  it("normaliseert een reeds-E.164-nummer naar dezelfde vorm", () => {
    expect(normaliseerNederlandsNummer("+31612345678")).toBe("+31612345678");
  });

  it("negeert spaties en streepjes in de invoer", () => {
    expect(normaliseerNederlandsNummer("06-1234 5678")).toBe("+31612345678");
    expect(normaliseerNederlandsNummer("+31 6 1234 5678")).toBe("+31612345678");
  });

  it("lege/whitespace-only invoer -> null", () => {
    expect(normaliseerNederlandsNummer("")).toBeNull();
    expect(normaliseerNederlandsNummer("   ")).toBeNull();
  });

  it("onzinnige/te korte invoer -> null, gooit nooit", () => {
    expect(normaliseerNederlandsNummer("123")).toBeNull();
    expect(normaliseerNederlandsNummer("niet-een-nummer")).toBeNull();
    expect(() => normaliseerNederlandsNummer("###")).not.toThrow();
  });

  it("een geldig buitenlands nummer (met landcode) wordt niet fout naar NL gedwongen", () => {
    // +1 (VS) is een op zichzelf geldig E.164-nummer — defaultCountry:"NL"
    // geldt uitsluitend voor nummers ZONDER expliciete landcode.
    expect(normaliseerNederlandsNummer("+12025551234")).toBe("+12025551234");
  });
});

describe("isGeldigE164", () => {
  it("accepteert een correct genormaliseerd NL-mobiel nummer", () => {
    expect(isGeldigE164("+31612345678")).toBe(true);
  });

  it("verwerpt vormen zonder leidende +, met spaties, of leeg", () => {
    expect(isGeldigE164("31612345678")).toBe(false);
    expect(isGeldigE164("+31 612345678")).toBe(false);
    expect(isGeldigE164("")).toBe(false);
  });
});
