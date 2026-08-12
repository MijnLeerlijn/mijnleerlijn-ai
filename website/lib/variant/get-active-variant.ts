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
//
// Multi-brand variants (2026-07-30) — EXPLICIETE UITZONDERING op de regel
// hierboven, alléén voor de standaardvariant zelf: als de opgeloste slug de
// standaardvariant se slug is (defaultVariant.slug) én die niet gevonden
// wordt of de opzoeking faalt, valt dit — OOK IN PRODUCTIE — terug op de
// hardcoded `defaultVariant`, met een luide console.error (zichtbaar/
// alerting, geen stille fout) i.p.v. de hele publieke site plat te leggen.
// Een verkeerd geconfigureerde ANDERE variant blijft wél hard falen (kleine
// blast radius, geen reden om de veiligheidsklep breder te maken dan nodig).
// Puur/synchroon, geen next/headers-afhankelijkheid — zodat Route Handlers
// die de NextRequest al als parameter hebben (app/api/feedback/route.ts,
// app/api/contact/route.ts) 'm rechtstreeks op `request.headers` kunnen
// toepassen i.p.v. via de ambient next/headers()-context te moeten gaan
// (die laatste vereist Next's request-scoped AsyncLocalStorage — onnodige
// koppeling voor code die de headers al in de hand heeft, en lastiger te
// unit-testen: rechtstreeks een NextRequest bouwen volstaat dan). Eén
// implementatie van "hoe lees je het x-variant-slug-signaal", door
// getActiveVariant() hieronder en beide routes hergebruikt.
export function variantSlugFromHeaders(headerList: Pick<Headers, "get">): string {
  return headerList.get("x-variant-slug") ?? defaultVariant.slug;
}

export async function getActiveVariant(): Promise<Variant> {
  const headerList = await headers();
  const slug = variantSlugFromHeaders(headerList);
  const isDefaultSlug = slug === defaultVariant.slug;

  try {
    const variant = await getVariantBySlug(slug);
    if (variant) return variant;
    if (isProduction() && !isDefaultSlug) {
      throw new Error(
        `Variant "${slug}" niet gevonden in Payload — is de database gezaaid? Zie payload/seed/index.ts.`
      );
    }
    if (isProduction()) {
      console.error(
        `[getActiveVariant] Standaardvariant "${slug}" niet gevonden in Payload — valt terug op de hardcoded standaardvariant zodat de site bereikbaar blijft. Controleer de "variants"-collectie.`
      );
    } else {
      console.warn(
        `[getActiveVariant] Variant "${slug}" niet gevonden in Payload — development-fallback naar de hardcoded standaardvariant. Draai "npm run seed" om dit op te lossen.`
      );
    }
    return defaultVariant;
  } catch (error) {
    if (isProduction() && !isDefaultSlug) throw error;
    if (isProduction()) {
      console.error(
        `[getActiveVariant] Kon de standaardvariant "${slug}" niet ophalen uit Payload (${error instanceof Error ? error.message : String(error)}) — valt terug op de hardcoded standaardvariant zodat de site bereikbaar blijft.`
      );
    } else {
      console.warn(
        `[getActiveVariant] Kon variant "${slug}" niet ophalen uit Payload (${error instanceof Error ? error.message : String(error)}) — development-fallback naar de hardcoded standaardvariant.`
      );
    }
    return defaultVariant;
  }
}
