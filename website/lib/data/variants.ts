import type { Variant, WebsiteTeksten } from "@/types/variant";

// Leeg websiteTeksten-blok — Payload's tekstvelden staan dan leeg, waardoor
// mapVariant() (services/payload.ts) automatisch op de MijnLeerlijn-
// standaardtekst terugvalt (zie lib/variant/default-website-teksten.ts).
// Geen van deze drie seed-varianten heeft eigen websiteTeksten nodig.
const LEGE_WEBSITETEKSTEN: WebsiteTeksten = {
  welkomsttitel: "",
  welkomsttekst: "",
  zoekveldPlaceholder: "",
  helpdeskIntro: "",
  contactTekst: "",
  footerTekst: "",
};

// Drie varianten uit de dummydataset — zie docs/MULTI-VARIANT-STRATEGY.md.
// De actieve variant (accentkleur/logo, zie config/variants.ts en
// providers/VariantProvider.tsx) blijft in Fase 3 nog MijnLeerlijn: echte
// domein-/subdomeinherkenning is Fase 4-werk. Deze lijst voedt het
// Variantwissel-scherm (UX-DESIGN.md scherm 9), waar een bezoeker alvast kan
// zien welke varianten er zijn.
export const varianten: Variant[] = [
  {
    id: "variant-mijnleerlijn",
    slug: "mijnleerlijn",
    name: "MijnLeerlijn",
    status: "actief",
    actief: true,
    domain: { type: "custom_domain", value: "mijnleerlijn.chat", domainStatus: "custom_domain" },
    branding: {
      logoUrl: "/brand/logo-kleur.svg",
      accentColor: "#1588c9",
      productName: "MijnLeerlijn",
      tagline: "Onderwijs vanuit Inzicht",
      isPlaceholder: false,
    },
    educationType: "algemeen",
    terminologyDictionary: [],
    websiteTeksten: LEGE_WEBSITETEKSTEN,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "system",
  },
  {
    id: "variant-mijnmonti",
    slug: "mijnmonti",
    name: "MijnMonti",
    status: "actief",
    actief: true,
    domain: { type: "slug_path", value: "mijnmonti", domainStatus: "slug_path" },
    branding: {
      logoUrl: "/brand/logo-kleur.svg",
      accentColor: "#1588c9",
      productName: "MijnMonti",
      tagline: "Onderwijs vanuit Inzicht",
      isPlaceholder: true,
    },
    educationType: "montessori",
    terminologyDictionary: [{ centralTerm: "leerdoel", variantTerm: "ontwikkelingsdoel" }],
    websiteTeksten: LEGE_WEBSITETEKSTEN,
    createdAt: "2026-04-01T00:00:00.000Z",
    createdBy: "system",
  },
  {
    id: "variant-mijnd",
    slug: "mijnd",
    name: "MijnD",
    status: "concept",
    actief: false,
    domain: { type: "slug_path", value: "mijnd", domainStatus: "slug_path" },
    branding: {
      logoUrl: "/brand/logo-kleur.svg",
      accentColor: "#1588c9",
      productName: "MijnD",
      tagline: "Onderwijs vanuit Inzicht",
      isPlaceholder: true,
    },
    educationType: "dalton",
    terminologyDictionary: [{ centralTerm: "groep", variantTerm: "stamgroep" }],
    websiteTeksten: LEGE_WEBSITETEKSTEN,
    createdAt: "2026-05-01T00:00:00.000Z",
    createdBy: "system",
  },
];

export function vindVariant(slug: string): Variant | undefined {
  return varianten.find((v) => v.slug === slug);
}
