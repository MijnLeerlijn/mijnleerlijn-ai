import { notFound } from "next/navigation";
import { getVariantBySlug } from "@/services/payload";
import Home from "../page";

// Multi-brand variants — pad-gebaseerde route (2026-07-31): ontbrekende
// route ontdekt via een echte productie-404 op /mijnmonti. proxy.ts
// herkent een pad-gebaseerde variant-slug al correct (zet de
// x-variant-slug-header, zie lib/variant/in-memory-variant-resolver.ts),
// maar zonder een eigen paginaroute op dit niveau bestaat er simpelweg geen
// match voor Next.js — vandaar de 404, geen bug in de herkenning zelf.
//
// Geen aparte weergavelogica: de homepage (../page.tsx) leest de actieve
// variant altijd via getActiveVariant() (leest dezelfde, al door proxy.ts
// gezette header), dus hergebruikt exact dezelfde component. Deze route
// doet uitsluitend de geldigheidscontrole die een 404 hoort te geven voor
// niet-bestaande/niet-actieve/niet-pad-gebaseerde slugs — zonder deze
// check zou proxy.ts een niet-actieve variant stilzwijgend laten
// terugvallen op de standaardvariant, en zou dat pad dus ten onrechte de
// MijnLeerlijn-homepage tonen in plaats van een 404.
export default async function VariantHomePage({
  params,
}: {
  params: Promise<{ variantSlug: string }>;
}) {
  const { variantSlug } = await params;
  const variant = await getVariantBySlug(variantSlug);

  if (!variant || variant.domain.type !== "slug_path" || !variant.actief) {
    notFound();
  }

  return <Home />;
}
