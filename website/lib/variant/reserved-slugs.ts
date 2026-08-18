// Namen die nooit als variant-slug mogen fungeren — noch als subdomein
// (`{slug}.mijnleerlijn.chat`), noch als eerste padsegment
// (`mijnleerlijn.chat/{slug}`). Twee onafhankelijke gebruikers:
// 1. proxy.ts — beslissend: sluit deze namen uit van zowel de
//    subdomein/pad-variantherkenning als de pad→subdomein-redirect. Zonder
//    deze uitsluiting zou een variant met slug "contact" de échte
//    /contact-pagina kunnen kapen, omdat proxy.ts vóór Next.js' eigen
//    "statische route wint van dynamische route"-resolutie draait.
// 2. payload/collections/Variants.ts (beforeValidate-hook) — voorkomt dat
//    zo'n slug ooit wordt opgeslagen, als tweede verdedigingslaag.
//
// BELANGRIJK: deze lijst kan niet automatisch van Next.js' routeringstabel
// worden afgeleid — bij een nieuwe top-level route onder app/(frontend)/
// hier handmatig aanvullen.
export const RESERVED_VARIANT_SLUGS: readonly string[] = [
  // Publieke routes — app/(frontend)/(public)/*
  "artikel",
  "categorie",
  "contact",
  "handleidingen",
  "kies-variant",
  "updates",
  "zoeken",
  // Overige frontend-routes — app/(frontend)/*
  "assistant",
  "dev",
  // Beheeromgeving — app/(frontend)/(admin)/beheer, app/(payload)/admin
  "beheer",
  "admin",
  // API — app/api/* én Payload's eigen REST-API (app/(payload)/api/*)
  "api",
  // Infrastructuur — de hoofdsite zelf, het aparte Curriculum
  // Werkplaats-project (curriculum.mijnleerlijn.chat), en de Traineromgeving
  // (trainers.mijnleerlijn.chat, zie proxy.ts se host-short-circuit) — geen
  // van drieën ooit door de Helpdesk-wildcard over te nemen.
  "www",
  "curriculum",
  "trainers",
];

export function isReservedSlug(slug: string): boolean {
  return RESERVED_VARIANT_SLUGS.includes(slug.toLowerCase());
}
