import { getRootDomain } from "@/config/env";

// Multi-brand variants (2026-07-30), dubbele bereikbaarheid (2026-08-11):
// zet een variant om naar z'n daadwerkelijke, canonieke publieke URL —
// gebruikt door de Varianten-beheerpagina se "Open variant"-knop. Subdomein
// is de canonieke vorm voor elke variant zonder eigen custom_domain (zelfde
// aanname als lib/variant/in-memory-variant-resolver.ts en proxy.ts, die de
// pad-vorm permanent naar deze URL doorverwijst) — "subdomain" en
// "slug_path" leveren dus bewust dezelfde URL op. Hoofddomein komt uit
// config/env.ts se getRootDomain(), nooit uit een variant-databaserecord
// (voorkwam eerder een www/non-www-mismatch, zie die functie).
//
// Parametertype bewust smaller dan het volledige `Variant`-model (alleen
// `slug`+`domain`) zodat zowel het canonieke type (server-side) als de
// lichtere REST-vorm die de admin-UI gebruikt (VariantenView.tsx,
// client-side) 'm zonder cast kunnen aanroepen.
interface VariantVoorPubliekeUrl {
  slug: string;
  domain: { type: "custom_domain" | "subdomain" | "slug_path"; value: string };
}

export function variantPublicUrl(variant: VariantVoorPubliekeUrl): string {
  if (variant.domain.type === "custom_domain") {
    return `https://${variant.domain.value}`;
  }
  return `https://${variant.slug}.${getRootDomain()}`;
}
