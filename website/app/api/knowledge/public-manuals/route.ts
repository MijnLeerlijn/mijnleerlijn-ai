import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getActiveVariant } from "@/lib/variant/get-active-variant";

// Publieke (geen login) lijst van zichtbare handleidingen, gegroepeerd per
// categorie, voor de "Handleidingen"-sidebar op de helpdesk-homepage —
// Helpdesk MVP 1.0. Geeft ALTIJD de volledige zichtbare set in één keer
// terug (geen zoek-query-param): het zoekveld in de sidebar filtert
// client-side — bij deze omvang (tientallen bronnen) sneller en eenvoudiger
// dan een aparte serverzoekopdracht per toetsaanslag.
//
// Bewust GEEN hergebruik van Payload's generieke REST-API voor
// knowledge-sources (die staat terecht adminOnly, zie KnowledgeSources.ts —
// bevat AI-samenvattingen/embeddings/foutmeldingen die nooit publiek horen).
// Deze route shaped zelf een minimale, publiek-veilige projectie: alleen
// titel, id (voor de downloadlink) en of er een bestand is.
//
// Variant-voorbereiding (opdracht Helpdesk MVP 1.0 "geschikt houden voor
// toekomstige varianten"): filtert op variantContext net als de bestaande
// getActiveVariant()-aanpak elders — leeg = centraal/alle varianten,
// gevuld = alleen de actieve variant. Vandaag lost dit altijd op naar de
// enige bestaande variant (mijnleerlijn), maar de query is al variant-aware.
export async function GET() {
  const payload = await getPayload({ config });
  const variant = await getActiveVariant();

  // Uitsluitend `zichtbaar` als serverzijdige where-filter — "heeft een
  // categorie" en "past bij de actieve variant" gebeuren hieronder in JS.
  // Dat is functioneel identiek (bij deze omvang geen prestatieprobleem) en
  // vermijdt Payload's `exists`-operator, die verder nergens anders in de
  // pijplijn wordt gebruikt.
  const bronnen = await payload.find({
    collection: "knowledge-sources",
    where: { zichtbaar: { equals: true } },
    sort: "volgorde",
    limit: 500,
    overrideAccess: true,
    depth: 1,
  });

  const categorieen = await payload.find({
    collection: "categories",
    sort: "title",
    limit: 100,
    overrideAccess: true,
    depth: 0,
  });

  const manualsPerCategorie = new Map<
    number,
    { id: number; title: string; hasFile: boolean; volgorde: number | null }[]
  >();

  for (const bron of bronnen.docs) {
    const categorieId = typeof bron.categorie === "object" ? bron.categorie?.id : bron.categorie;
    if (!categorieId) continue;

    // Variant.id (types/variant.ts) is een STRING (String(payload-numeriek-id)
    // — zie ook services/payload.ts's `Number(found.id)` voor exact hetzelfde
    // patroon), terwijl variantContext hier de echte numerieke Payload-relatie-
    // id's bevat — vandaar de expliciete Number()-omzetting.
    const actieveVariantId = Number(variant.id);
    const variantContext = (bron.variantContext ?? []) as (number | { id: number })[];
    const isVoorActieveVariant =
      variantContext.length === 0 ||
      variantContext.some((v) => (typeof v === "object" ? v.id : v) === actieveVariantId);
    if (!isVoorActieveVariant) continue;

    const lijst = manualsPerCategorie.get(categorieId) ?? [];
    lijst.push({
      id: bron.id,
      title: bron.title,
      hasFile: Boolean(bron.file),
      volgorde: bron.volgorde ?? null,
    });
    manualsPerCategorie.set(categorieId, lijst);
  }

  const result = categorieen.docs
    .map((categorie) => {
      const manuals = (manualsPerCategorie.get(categorie.id) ?? []).sort((a, b) => {
        if (a.volgorde !== null && b.volgorde !== null && a.volgorde !== b.volgorde) {
          return a.volgorde - b.volgorde;
        }
        if (a.volgorde !== null && b.volgorde === null) return -1;
        if (a.volgorde === null && b.volgorde !== null) return 1;
        return a.title.localeCompare(b.title, "nl");
      });
      return {
        id: categorie.id,
        slug: categorie.slug,
        title: categorie.title,
        icon: categorie.icon,
        color: categorie.color,
        manuals: manuals.map(({ id, title, hasFile }) => ({ id, title, hasFile })),
      };
    })
    .filter((categorie) => categorie.manuals.length > 0);

  return NextResponse.json({ categories: result });
}
