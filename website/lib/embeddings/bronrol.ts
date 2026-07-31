// Bronrol (2026-07-31): losgetrokken uit similarity-search.ts naar een
// eigen, verder afhankelijkheidsvrije module. Reden: lib/assistant/
// kennisbasis-context.ts moet dit ook kunnen gebruiken, maar meerdere
// testbestanden mocken heel `similarity-search.ts` (`vi.mock(...)`) om de
// retrievallaag te isoleren — daarmee zou bepaalBronrol() ongemerkt
// `undefined` worden voor elke consument die het via die module importeert.
// similarity-search.ts importeert dit hieronder terug en re-exporteert het,
// zodat bestaande imports (bv. build-context.ts se `BronRol`-type) intact
// blijven.

export type BronRol = "release-note" | "handleidingstap" | "manual" | "background-model" | "faq" | "support";

const TYPE_NAAR_BRONROL: Record<string, BronRol> = {
  pdf: "manual",
  handleiding: "manual",
  website: "manual",
  release_notes: "release-note",
  faq: "faq",
  intern_document: "background-model",
};

/**
 * Bepaalt de bronrol van een Knowledge Source: het handmatige veld `purpose`
 * (payload/collections/KnowledgeSources.ts) wint altijd, anders een
 * redelijke default op basis van `type`. Onbekende/ontbrekende combinaties
 * vallen terug op "manual" (de meest voorkomende, minst risicovolle
 * default — nooit undefined).
 *
 * Dit is ook het enige, canonieke kenmerk waarmee het per-variant
 * achtergronddocument wordt herkend (zie lib/assistant/kennisbasis-
 * context.ts) — nooit op id/titel, altijd op
 * `bepaalBronrol(...) === "background-model"` gecombineerd met
 * `variantContext`. Eén functie, geen tweede afgeleide implementatie.
 */
export function bepaalBronrol(type: string, purpose: string | null | undefined): BronRol {
  if (
    purpose === "background-model" ||
    purpose === "manual" ||
    purpose === "release-note" ||
    purpose === "faq" ||
    purpose === "support"
  ) {
    return purpose;
  }
  return TYPE_NAAR_BRONROL[type] ?? "manual";
}
