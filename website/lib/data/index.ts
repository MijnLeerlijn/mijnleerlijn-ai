import type { ArticleWithContent } from "./factory";
import { startenArtikelen } from "./articles/starten";
import { doelenPlanningArtikelen } from "./articles/doelen-planning";
import { leerlingenGroepenArtikelen } from "./articles/leerlingen-groepen";
import { vaardighedenArtikelen } from "./articles/vaardigheden";
import { documentenMediaArtikelen } from "./articles/documenten-media";
import { analyseRapportageArtikelen } from "./articles/analyse-rapportage";
import { notitiesArtikelen } from "./articles/notities";
import { beheerInstellingenArtikelen } from "./articles/beheer-instellingen";
import { actiesDownloadsArtikelen } from "./articles/acties-downloads";
import { onderwijsvariantenArtikelen } from "./articles/onderwijsvarianten";

export type { ArticleWithContent } from "./factory";
export { categorieen, vindCategorie, type Categorie, type CategorieKleur } from "./categories";
export { varianten, vindVariant } from "./variants";

// Alle 75 artikelen uit de 10 categoriebestanden, samengevoegd tot één
// dataset — zie docs/IMPLEMENTATION-PLAN.md Fase 3. In Fase 5 vervangt een
// Payload-opzoeking deze array met dezelfde ArticleWithContent-vorm.
export const alleArtikelen: ArticleWithContent[] = [
  ...startenArtikelen,
  ...doelenPlanningArtikelen,
  ...leerlingenGroepenArtikelen,
  ...vaardighedenArtikelen,
  ...documentenMediaArtikelen,
  ...analyseRapportageArtikelen,
  ...notitiesArtikelen,
  ...beheerInstellingenArtikelen,
  ...actiesDownloadsArtikelen,
  ...onderwijsvariantenArtikelen,
];

export function vindArtikel(slug: string): ArticleWithContent | undefined {
  return alleArtikelen.find((a) => a.slug === slug);
}

export function artikelenPerCategorie(categorySlug: string): ArticleWithContent[] {
  return alleArtikelen.filter((a) => a.categorySlug === categorySlug);
}

/**
 * Gerelateerd = zelfde categorie, met artikelen die een tag delen eerst.
 * Eenvoudige, voorspelbare regel — geen aanbevelingsalgoritme nodig voor dummydata.
 */
export function gerelateerdeArtikelen(artikel: ArticleWithContent, aantal = 3): ArticleWithContent[] {
  const kandidaten = alleArtikelen.filter(
    (a) => a.slug !== artikel.slug && a.categorySlug === artikel.categorySlug
  );
  const gedeeldeTags = kandidaten.filter((a) => a.tags.some((tag) => artikel.tags.includes(tag)));
  const rest = kandidaten.filter((a) => !gedeeldeTags.includes(a));
  return [...gedeeldeTags, ...rest].slice(0, aantal);
}
