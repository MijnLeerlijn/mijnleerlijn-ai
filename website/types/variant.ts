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

export interface Variant {
  id: string;
  slug: string;
  name: string;
  status: VariantStatus;
  domain: VariantDomain;
  branding: VariantBranding;
  educationType: string;
  terminologyDictionary: TerminologyEntry[];
  contactEmail?: string;
  createdAt: string;
  createdBy: string;
}
