import { describe, it, expect } from "vitest";
import { haalHeadingsOp } from "@/lib/content/markdown-headings";
import { HANDLEIDING_TITEL, HANDLEIDING_MARKDOWN } from "./handleiding";

// Handleidingronde (2026-08-25) — dekt de inhoudseisen uit de opdracht:
// alle 14 hoofdstukken uit het goedgekeurde artifact aanwezig, in dezelfde
// volgorde, met stabiele deep-link-ankers — en dat een "Nog te
// verifiëren"-punt (het telefoonnummer) niet als feit is ingevuld.

const VERWACHTE_HOOFDSTUKTITELS = [
  "Welkom in de traineromgeving",
  "Inloggen en je profiel",
  "Je dashboard",
  "Werken met je trainingen",
  "Werken met scholen",
  "Een training voorbereiden",
  "Een verslag maken en afronden",
  "Een verslag telefonisch inspreken",
  "Het logboek gebruiken",
  "Bestanden bij een school",
  "Je eigen bestanden en bestanden delen",
  "Kennis gebruiken",
  "Vragen stellen aan de kennisassistent",
  "Veelgestelde vragen en problemen",
];

describe("handleiding-inhoud", () => {
  it("heeft een titel, los van de hoofdstukken zelf (KennisReader se enige h1)", () => {
    expect(HANDLEIDING_TITEL).toBe("Handleiding Trainerportal");
  });

  it("bevat exact de 14 hoofdstukken uit het goedgekeurde artifact, in dezelfde volgorde", () => {
    const hoofdstukken = haalHeadingsOp(HANDLEIDING_MARKDOWN).filter((h) => h.level === 1);
    expect(hoofdstukken.map((h) => h.text)).toEqual(VERWACHTE_HOOFDSTUKTITELS);
  });

  it("gebruikt uitsluitend niveau 1 en 2 (geen ### dieper) — sluit aan bij KennisMarkdown se h2/h3-afspraak", () => {
    const niveaus = new Set(haalHeadingsOp(HANDLEIDING_MARKDOWN).map((h) => h.level));
    expect(niveaus.has(3)).toBe(false);
  });

  it("het exacte deep-link-voorbeeld uit de opdracht (#een-verslag-maken-en-afronden) bestaat écht", () => {
    const slugs = haalHeadingsOp(HANDLEIDING_MARKDOWN).map((h) => h.slug);
    expect(slugs).toContain("een-verslag-maken-en-afronden");
  });

  it("elk hoofdstuk heeft een unieke slug (geen dubbele top-level ankers)", () => {
    const hoofdstukSlugs = haalHeadingsOp(HANDLEIDING_MARKDOWN)
      .filter((h) => h.level === 1)
      .map((h) => h.slug);
    expect(new Set(hoofdstukSlugs).size).toBe(hoofdstukSlugs.length);
  });

  it("vult het telefoonnummer (Nog te verifiëren) niet als feit in — houdt een zichtbare placeholder aan", () => {
    expect(HANDLEIDING_MARKDOWN).toContain("[telefoonnummer nog aan te vullen door MijnLeerlijn]");
    // Geen los, verzonnen 06/0800/+31-nummer ergens anders in de tekst.
    expect(/\b(?:\+31|0031|0)6\s?-?\d{8}\b/.test(HANDLEIDING_MARKDOWN)).toBe(false);
  });

  it("bevat de 📸-screenshotplaceholders (geen verzonnen afbeeldingen — geen markdown-afbeeldingssyntax aanwezig)", () => {
    expect(HANDLEIDING_MARKDOWN).toMatch(/📸/);
    expect(HANDLEIDING_MARKDOWN).not.toMatch(/!\[[^\]]*\]\(/);
  });

  it("noemt geen technisch/admin-jargon dat een trainer niet hoeft te kennen", () => {
    const verboden = ["Payload", "API", "Monday-ID", "database", "webhook", "Telnyx", "writeback"];
    for (const term of verboden) {
      expect(HANDLEIDING_MARKDOWN.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });
});
