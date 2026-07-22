import type { Variant } from "@/types/variant";

// Enige, hardcoded variant in Fase 1 — bewijst het mechanisme (branding,
// terminologie, accentkleur) zonder dat Payload/echte variantdata al bestaat.
// Vanaf Fase 4 komt dit uit de "variants"-collection, zie docs/DATA-MODEL.md.
export const defaultVariant: Variant = {
  id: "default",
  slug: "mijnleerlijn",
  name: "MijnLeerlijn",
  status: "actief",
  domain: {
    type: "custom_domain",
    value: "mijnleerlijn.nl",
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
  createdAt: new Date(0).toISOString(),
  createdBy: "system",
};
