import type { Variant } from "@/types/variant";

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
    domain: { type: "custom_domain", value: "mijnleerlijn.nl", domainStatus: "custom_domain" },
    branding: {
      logoUrl: "/brand/logo-kleur.svg",
      accentColor: "#1588c9",
      productName: "MijnLeerlijn",
      tagline: "Onderwijs vanuit Inzicht",
      isPlaceholder: false,
    },
    educationType: "algemeen",
    terminologyDictionary: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "system",
  },
  {
    id: "variant-mijnmonti",
    slug: "mijnmonti",
    name: "MijnMonti",
    status: "actief",
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
    createdAt: "2026-04-01T00:00:00.000Z",
    createdBy: "system",
  },
  {
    id: "variant-mijnd",
    slug: "mijnd",
    name: "MijnD",
    status: "concept",
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
    createdAt: "2026-05-01T00:00:00.000Z",
    createdBy: "system",
  },
];

export function vindVariant(slug: string): Variant | undefined {
  return varianten.find((v) => v.slug === slug);
}
