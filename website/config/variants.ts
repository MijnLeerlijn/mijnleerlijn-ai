import type { Variant } from "@/types/variant";
import { STANDAARD_WEBSITETEKSTEN, standaardFooterTekst } from "@/lib/variant/default-website-teksten";

// Hardcoded noodvariant — gebruikt als (a) lokale dev-fallback vóórdat de
// database gezaaid is, en (b) sinds multi-brand variants (2026-07-30) als
// de laatste, altijd-beschikbare veiligheidsklep in productie wanneer de
// standaardvariant zelf niet uit Payload opgehaald kan worden (zie
// lib/variant/get-active-variant.ts) — de publieke site mag hierdoor nooit
// stukgaan. Reguliere variantdata komt uit de "variants"-collection, zie
// docs/DATA-MODEL.md.
export const defaultVariant: Variant = {
  id: "default",
  slug: "mijnleerlijn",
  name: "MijnLeerlijn",
  status: "actief",
  actief: true,
  domain: {
    type: "custom_domain",
    value: "mijnleerlijn.chat",
    domainStatus: "custom_domain",
  },
  branding: {
    logoUrl: "/brand/logo-kleur.svg",
    accentColor: "#1588c9",
    productName: "MijnLeerlijn",
    tagline: "Onderwijs vanuit Inzicht",
    isPlaceholder: false,
  },
  educationType: "algemeen",
  terminologyDictionary: [],
  websiteTeksten: { ...STANDAARD_WEBSITETEKSTEN, footerTekst: standaardFooterTekst() },
  createdAt: new Date(0).toISOString(),
  createdBy: "system",
};
