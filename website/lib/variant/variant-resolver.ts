// Multi-brand variants (2026-07-30): het contract voor host-/pad-gebaseerde
// variant-herkenning. proxy.ts en al het andere kennen uitsluitend deze
// interface, nooit de concrete implementatie (zie
// variant-resolver-instance.ts) — een latere overstap naar bijvoorbeeld
// Vercel Edge Config/KV betekent alleen een nieuwe klasse die dit contract
// implementeert, geen wijziging aan proxy.ts of iets anders.
export interface VariantResolver {
  /**
   * Bepaalt welke variant-slug bij dit request hoort, gegeven de `Host`-
   * header en het pad. Geeft ALTIJD een slug terug (nooit null/undefined) —
   * bij geen enkele match de slug van de standaardvariant.
   */
  resolveSlug(host: string, pathname: string): Promise<string>;
}
