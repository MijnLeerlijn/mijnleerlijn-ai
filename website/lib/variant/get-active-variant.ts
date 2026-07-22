import { headers } from "next/headers";
import type { Variant } from "@/types/variant";
import { defaultVariant } from "@/config/variants";
import { getVariantBySlug } from "@/services/payload";
import { isProduction } from "@/config/env";

// Leest de variant-slug die proxy.ts per request al herkend heeft (header
// x-variant-slug, zie proxy.ts en docs/ARCHITECTURE.md
// §Variant-herkenningsmechanisme) en haalt de bijbehorende Variant-data op
// via services/payload.ts. In productie mag dit NOOIT stilzwijgend
// terugvallen op de hardcoded standaardvariant (zie Fase 4 §Belangrijke
// regels: "Geen stilzwijgende fallback naar dummydata in productie") — een
// mislukte opzoeking daar geeft de echte fout door aan Next's foutgrens
// (app/(frontend)/error.tsx). Alleen in development, wanneer de database nog
// niet gezaaid is, valt dit terug op de lokale standaardvariant, met een
// zichtbare waarschuwing.
export async function getActiveVariant(): Promise<Variant> {
  const headerList = await headers();
  const slug = headerList.get("x-variant-slug") ?? defaultVariant.slug;

  try {
    const variant = await getVariantBySlug(slug);
    if (variant) return variant;
    if (isProduction()) {
      throw new Error(
        `Variant "${slug}" niet gevonden in Payload — is de database gezaaid? Zie payload/seed/index.ts.`
      );
    }
    console.warn(
      `[getActiveVariant] Variant "${slug}" niet gevonden in Payload — development-fallback naar de hardcoded standaardvariant. Draai "npm run seed" om dit op te lossen.`
    );
    return defaultVariant;
  } catch (error) {
    if (isProduction()) throw error;
    console.warn(
      `[getActiveVariant] Kon variant "${slug}" niet ophalen uit Payload (${error instanceof Error ? error.message : String(error)}) — development-fallback naar de hardcoded standaardvariant.`
    );
    return defaultVariant;
  }
}
