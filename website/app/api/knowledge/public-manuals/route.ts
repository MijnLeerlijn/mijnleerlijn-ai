import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getActiveVariant } from "@/lib/variant/get-active-variant";

// Publieke (geen login) lijst van zichtbare handleidingen, gegroepeerd per
// categorie, voor de "Handleidingen"-sidebar op de helpdesk-homepage —
// Helpdesk MVP 1.0, uitgebreid met de Handleidingbouwer: PDF's
// (knowledge-sources, `zichtbaar`) en gestructureerde handleidingen
// (`handleidingen`, gepubliceerd + `zichtbaarInSidebar`) staan hier
// SAMENGEVOEGD, per item onderscheiden via `kind`. Geeft ALTIJD de volledige
// zichtbare set in één keer terug (geen zoek-query-param): het zoekveld in
// de sidebar filtert client-side — bij deze omvang (tientallen bronnen)
// sneller en eenvoudiger dan een aparte serverzoekopdracht per toetsaanslag.
//
// Bewust GEEN hergebruik van Payload's generieke REST-API voor
// knowledge-sources/handleidingen (die staan terecht adminOnly — bevatten
// AI-samenvattingen/embeddings/foutmeldingen/interne notities die nooit
// publiek horen). Deze route shaped zelf een minimale, publiek-veilige
// projectie per item: titel, kind, href (waar naartoe linken — een
// handleiding-pagina of de downloadroute) en of er een apart download-icoon
// getoond moet worden (alleen bij een PDF met bestand).
//
// Variant-voorbereiding (opdracht Helpdesk MVP 1.0 "geschikt houden voor
// toekomstige varianten"): filtert op variantContext net als de bestaande
// getActiveVariant()-aanpak elders — leeg = centraal/alle varianten,
// gevuld = alleen de actieve variant. Vandaag lost dit altijd op naar de
// enige bestaande variant (mijnleerlijn), maar de query is al variant-aware.
interface SidebarItem {
  id: number;
  title: string;
  kind: "handleiding" | "pdf";
  href: string | null;
  downloadable: boolean;
  volgorde: number | null;
}

// Gedeeld tussen items ÉN categorieën (Downloadbeheer/Downloadcategorieën,
// 2026-07-27): numerieke `volgorde` wint, `volgorde` altijd vóór geen-
// `volgorde`, tie-break op `localeCompare(title, "nl")`. Categorieën
// gebruikten hiervoor `sort: "title"` (puur alfabetisch) — nu hetzelfde
// principe als items, met hun nieuwe `volgorde`-veld (Categories.ts).
function vergelijkOpVolgorde(a: { volgorde: number | null; title: string }, b: { volgorde: number | null; title: string }): number {
  if (a.volgorde !== null && b.volgorde !== null && a.volgorde !== b.volgorde) {
    return a.volgorde - b.volgorde;
  }
  if (a.volgorde !== null && b.volgorde === null) return -1;
  if (a.volgorde === null && b.volgorde !== null) return 1;
  return a.title.localeCompare(b.title, "nl");
}

export async function GET() {
  const payload = await getPayload({ config });
  const variant = await getActiveVariant();

  // Variant.id (types/variant.ts) is een STRING (String(payload-numeriek-id)
  // — zie ook services/payload.ts's `Number(found.id)` voor exact hetzelfde
  // patroon), terwijl variantContext hier de echte numerieke Payload-relatie-
  // id's bevat — vandaar de expliciete Number()-omzetting.
  const actieveVariantId = Number(variant.id);
  function isVoorActieveVariant(variantContext: unknown): boolean {
    const context = (variantContext ?? []) as (number | { id: number })[];
    return context.length === 0 || context.some((v) => (typeof v === "object" ? v.id : v) === actieveVariantId);
  }

  // Uitsluitend `zichtbaar`/`zichtbaarInSidebar` als serverzijdige where-
  // filter — "heeft een categorie" en "past bij de actieve variant" gebeuren
  // hieronder in JS. Dat is functioneel identiek (bij deze omvang geen
  // prestatieprobleem) en vermijdt Payload's `exists`-operator, die verder
  // nergens anders in de pijplijn wordt gebruikt.
  const [bronnen, handleidingen, categorieen] = await Promise.all([
    payload.find({
      collection: "knowledge-sources",
      where: { zichtbaar: { equals: true } },
      sort: "volgorde",
      limit: 500,
      overrideAccess: true,
      depth: 1,
    }),
    // Handleidingbouwer: de PRIMAIRE bron naast bestaande PDF's — zelfde
    // sidebar, samengevoegd. `zichtbaarInSidebar` is los van `status`: alleen
    // een GEPUBLICEERDE handleiding kan hier ooit in komen, zichtbaarInSidebar
    // bepaalt daarbovenop nog een keer of hij ook echt getoond wordt (zelfde
    // twee-lagen-patroon als KnowledgeSources.zichtbaar).
    payload.find({
      collection: "handleidingen",
      where: { and: [{ status: { equals: "gepubliceerd" } }, { zichtbaarInSidebar: { equals: true } }] },
      sort: "volgorde",
      limit: 500,
      overrideAccess: true,
      depth: 0,
    }),
    payload.find({
      collection: "categories",
      limit: 100,
      overrideAccess: true,
      depth: 0,
    }),
  ]);

  const itemsPerCategorie = new Map<number, SidebarItem[]>();

  for (const bron of bronnen.docs) {
    const categorieId = typeof bron.categorie === "object" ? bron.categorie?.id : bron.categorie;
    if (!categorieId) continue;
    if (!isVoorActieveVariant(bron.variantContext)) continue;

    const lijst = itemsPerCategorie.get(categorieId) ?? [];
    const heeftBestand = Boolean(bron.file);
    lijst.push({
      id: bron.id,
      title: bron.title,
      kind: "pdf",
      href: heeftBestand ? `/api/knowledge/download/${bron.id}` : null,
      downloadable: heeftBestand,
      volgorde: bron.volgorde ?? null,
    });
    itemsPerCategorie.set(categorieId, lijst);
  }

  for (const handleiding of handleidingen.docs) {
    const categorieId = typeof handleiding.categorie === "object" ? handleiding.categorie?.id : handleiding.categorie;
    if (!categorieId) continue;
    if (!isVoorActieveVariant(handleiding.variantContext)) continue;

    const lijst = itemsPerCategorie.get(categorieId) ?? [];
    lijst.push({
      id: handleiding.id,
      title: handleiding.titel,
      kind: "handleiding",
      href: `/handleidingen/${handleiding.slug}`,
      downloadable: false,
      volgorde: handleiding.volgorde ?? null,
    });
    itemsPerCategorie.set(categorieId, lijst);
  }

  const result = [...categorieen.docs]
    .map((c) => ({ ...c, volgorde: c.volgorde ?? null }))
    .sort(vergelijkOpVolgorde)
    .map((categorie) => {
      const items = (itemsPerCategorie.get(categorie.id) ?? []).sort(vergelijkOpVolgorde);
      return {
        id: categorie.id,
        slug: categorie.slug,
        title: categorie.title,
        icon: categorie.icon,
        color: categorie.color,
        manuals: items.map(({ id, title, kind, href, downloadable }) => ({ id, title, kind, href, downloadable })),
      };
    })
    .filter((categorie) => categorie.manuals.length > 0);

  return NextResponse.json({ categories: result });
}
