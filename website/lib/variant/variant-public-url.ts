import type { Variant } from "@/types/variant";
import { defaultVariant } from "@/config/variants";

// Multi-brand variants (2026-07-30): zet domain.type/domain.value om naar de
// daadwerkelijke publieke URL van een variant — gebruikt door de Varianten-
// beheerpagina se "Open variant"-knop. Hoofddomein = de standaardvariant se
// eigen domain.value (bv. "mijnleerlijn.chat"), zelfde aanname als
// lib/variant/in-memory-variant-resolver.ts.
export function variantPublicUrl(variant: Variant): string {
  if (variant.domain.type === "custom_domain") {
    return `https://${variant.domain.value}`;
  }
  const hoofddomein = defaultVariant.domain.value;
  if (variant.domain.type === "subdomain") {
    return `https://${variant.domain.value}.${hoofddomein}`;
  }
  return `https://${hoofddomein}/${variant.domain.value}`;
}
