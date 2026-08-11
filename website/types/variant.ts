// Canoniek datamodel — zie docs/DATA-MODEL.md §Variant en
// docs/MULTI-VARIANT-STRATEGY.md.

export type VariantStatus = "concept" | "actief" | "gearchiveerd";
export type VariantDomainType = "custom_domain" | "subdomain" | "slug_path";
export type VariantDomainStatus = "slug_path" | "subdomain" | "custom_domain";

export interface VariantDomain {
  type: VariantDomainType;
  value: string;
  domainStatus: VariantDomainStatus;
}

export interface VariantBranding {
  logoUrl: string;
  /** De enige merk-brede kleur die per variant verschilt — zie PLATFORM-FOUNDATION.md §7/§8. */
  accentColor: string;
  productName: string;
  tagline: string;
  /** True zolang definitieve merkbestanden nog niet zijn aangeleverd. */
  isPlaceholder: boolean;
}

export interface TerminologyEntry {
  centralTerm: string;
  variantTerm: string;
}

// Multi-brand variants (2026-07-30): optionele, publiek zichtbare teksten
// per variant — zie payload/collections/Variants.ts se `websiteTeksten` en
// lib/variant/default-website-teksten.ts voor de fallback-logica. Op dit
// niveau (na services/payload.ts's mapVariant()) altijd volledig ingevuld,
// nooit een leeg veld — consumers hoeven zelf geen fallback te schrijven.
export interface WebsiteTeksten {
  welkomsttitel: string;
  welkomsttekst: string;
  zoekveldPlaceholder: string;
  helpdeskIntro: string;
  contactTekst: string;
  footerTekst: string;
}

export interface Variant {
  id: string;
  slug: string;
  name: string;
  status: VariantStatus;
  /** Bepaalt bereikbaarheid (hostname-resolutie/AI) — los van `status`, zie Variants.ts. */
  actief: boolean;
  domain: VariantDomain;
  branding: VariantBranding;
  educationType: string;
  terminologyDictionary: TerminologyEntry[];
  websiteTeksten: WebsiteTeksten;
  contactEmail?: string;
  createdAt: string;
  createdBy: string;
}
