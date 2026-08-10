import type { Payload } from "payload";
import { plainTextToLexical } from "@/payload/lexical";
import { categorieen } from "@/lib/data/categories";
import {
  handleiding,
  kennisartikelen,
  type RawArticle,
  type RawBlock,
} from "@/payload/import-curriculum-werkplaats/data";

// Gedeelde import-logica voor de Curriculum Werkplaats-documentatie (1
// handleiding + 18 kennisartikelen, samen 19 documenten — zie ./data.ts in
// payload/import-curriculum-werkplaats/ voor de vaste inhoud). Twee
// aanroepers, precies zoals lib/knowledge/sync-manuals.ts naast zijn eigen
// route staat:
// - payload/import-curriculum-werkplaats/index.ts (CLI, `npm run
//   import:curriculum-werkplaats`, tegen een lokale/dev-database).
// - app/api/knowledge/import-curriculum-werkplaats/route.ts (admin-only
//   productieroute, Helpdesk-beheerkoppeling-uitbreiding 2026-08-10, "geen
//   productiesecrets buiten Vercel" — de server gebruikt hier gewoon
//   process.env zoals Payload dat toch al doet, niets nieuws daaraan).
//
// Bewust GEEN generieke "importeer willekeurig artikel"-functie: de content
// (`handleiding` + `kennisartikelen`) staat hard in ./data.ts, hier wordt
// nergens een slug/titel/body van buitenaf aangenomen. Upsert-by-slug, dus
// idempotent — een tweede run wijzigt alleen deze exacte 19 documenten
// (bijwerken-als-gelijk-gebleven levert wel een nieuwe revisie op, maar nooit
// een duplicaat), en raakt nooit een ander artikel of andere collectie aan.

const CATEGORY_SLUG = "curriculum-werkplaats";
const BRON_TITEL = "Curriculum Werkplaats (applicatie)";

export interface CurriculumWerkplaatsImportFout {
  slug: string;
  melding: string;
}

// TIJDELIJKE diagnostische logging (2026-08-10, live productie-import gaf
// "aangemaakt=0 bijgewerkt=0 verwerkt=0 fouten=1" zonder herleidbare oorzaak
// in de Vercel-logs — de bestaande payload.logger.warn(resultaat.fouten, …)
// in de route logt de fouten-array wel, maar niet als leesbare platte
// regel, en is in de praktijk niet goed terug te vinden). Root cause
// bevestigd uit de code: dat exacte 0/0/0/1-patroon kon op dat moment
// uitsluitend ontstaan doordat categorie "curriculum-werkplaats" nog
// ontbrak (npm run seed nooit tegen productie gedraaid) — de toenmalige
// vroege return bij een ontbrekende categorie was de enige plek die precies
// dat patroon opleverde. Opgelost via zelfherstel (zie
// upsertCurriculumWerkplaatsCategorie hieronder) i.p.v. een verplichte
// losse seed-stap. Deze logfunctie blijft niettemin nuttig voor de overige,
// wél nog mogelijke faalpaden (bron-upsert, een los artikel, of het
// aanmaken van de categorie zelf) en logt per mislukte stap ÉÉN plat
// leesbare regel (stap/fouttype/melding), ongeacht hoe de logviewer
// objecten weergeeft — de API-respons naar de admin blijft bewust
// ongewijzigd/generiek, dit raakt uitsluitend de serverlogs.
//
// saniteerFoutmelding: sommige database-drivers echoën bij een parse-/
// verbindingsfout de rauwe connectiestring terug in error.message (bv.
// "invalid connection string: postgres://user:wachtwoord@host/db") — dit
// vervangt credentials in een eventuele URL door "***" vóórdat er iets
// gelogd of teruggegeven wordt. Nooit de originele, ongesaniteerde message
// loggen.
function saniteerFoutmelding(ruw: string): string {
  return ruw.replace(/:\/\/[^\s/@]+:[^\s/@]+@/g, "://***:***@");
}

function logImportFout(payload: Payload, stap: string, error: unknown): string {
  const fouttype = error instanceof Error ? error.constructor.name : typeof error;
  const meldingRuw = error instanceof Error ? error.message : String(error);
  const melding = saniteerFoutmelding(meldingRuw);
  payload.logger.error(
    `[import-curriculum-werkplaats] stap="${stap}" fouttype=${fouttype} melding="${melding}"`
  );
  return melding;
}

export interface CurriculumWerkplaatsImportResultaat {
  aangemaakt: number;
  bijgewerkt: number;
  verwerkt: number;
  fouten: CurriculumWerkplaatsImportFout[];
}

function blockToPayload(block: RawBlock): Record<string, unknown> {
  switch (block.type) {
    case "tekst":
      return { blockType: "tekst", body: plainTextToLexical(block.body) };
    case "genummerde_stap":
      return { blockType: "genummerde_stap", body: block.body };
    case "waarschuwing":
      return { blockType: "waarschuwing", body: block.body };
    case "tip":
      return { blockType: "tip", body: block.body };
  }
}

async function upsertArticleBySlug(
  payload: Payload,
  slug: string,
  data: Record<string, unknown>
): Promise<{ id: number; aangemaakt: boolean }> {
  const existing = await payload.find({
    collection: "articles",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  });
  if (existing.docs[0]) {
    const updated = await payload.update({
      collection: "articles",
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
      draft: false,
    } as Parameters<typeof payload.update>[0]);
    return { id: Number(updated.id), aangemaakt: false };
  }
  const created = await payload.create({
    collection: "articles",
    data: { ...data, slug },
    overrideAccess: true,
    draft: false,
  } as Parameters<typeof payload.create>[0]);
  return { id: Number(created.id), aangemaakt: true };
}

/**
 * Categorie "curriculum-werkplaats" — normaal gezaaid door `npm run seed`
 * (payload/seed/index.ts, dezelfde upsert-by-slug-aanpak met exact dezelfde
 * velden: title/icon/color/description uit lib/data/categories.ts). Root
 * cause van de eerdere "aangemaakt=0 bijgewerkt=0 verwerkt=0 fouten=1" in
 * productie: die categorie bestond daar simpelweg nog niet (npm run seed is
 * nooit tegen de productiedatabase gedraaid — logisch, dat script zaait ook
 * de 10 andere, niet-Curriculum-Werkplaats-categorieën/demo-artikelen, wat
 * je normaal niet als losse actie op een levende productie-Helpdesk wil
 * draaien). In plaats van daarvoor een aparte deployment/seed-actie te eisen,
 * maakt de import voortaan **uitsluitend deze ene, met naam genoemde
 * categorie** zelf aan als hij ontbreekt — met identieke gegevens als de
 * officiële seed, dus geen enkel verschil in eindresultaat t.o.v. wél eerst
 * `npm run seed` gedraaid hebben. Bestaat de categorie al (lokaal/dev, of
 * een productie die ooit wél geseed is), dan wordt hij gewoon hergebruikt —
 * nooit een tweede aangemaakt, nooit een ándere categorie aangeraakt of
 * gewijzigd.
 */
async function upsertCurriculumWerkplaatsCategorie(payload: Payload): Promise<number> {
  const bestaand = await payload.find({
    collection: "categories",
    where: { slug: { equals: CATEGORY_SLUG } },
    limit: 1,
  });
  if (bestaand.docs[0]) return Number(bestaand.docs[0].id);

  const definitie = categorieen.find((c) => c.slug === CATEGORY_SLUG);
  if (!definitie) {
    // Kan in de praktijk niet gebeuren (statische lijst in lib/data/
    // categories.ts) — expliciet afgevangen zodat een toekomstige
    // verwijdering van die entry een duidelijke fout geeft i.p.v. straks
    // een categorie met lege/undefined velden aan te maken.
    throw new Error(
      `Categorie-definitie "${CATEGORY_SLUG}" ontbreekt in lib/data/categories.ts — kan de categorie niet aanmaken.`
    );
  }

  const created = await payload.create({
    collection: "categories",
    overrideAccess: true,
    data: {
      slug: definitie.slug,
      title: definitie.titel,
      icon: definitie.icoon,
      color: definitie.kleur,
      description: definitie.uitleg,
    },
  });
  return Number(created.id);
}

async function upsertBron(payload: Payload): Promise<number> {
  const existing = await payload.find({
    collection: "sources",
    where: { title: { equals: BRON_TITEL } },
    limit: 1,
  });
  if (existing.docs[0]) return Number(existing.docs[0].id);

  const created = await payload.create({
    collection: "sources",
    overrideAccess: true,
    data: {
      title: BRON_TITEL,
      type: "interne_handleiding",
      publisher: "MijnLeerlijn — Curriculum Werkplaats",
      reliability: "hoog",
      internalStatus: "goedgekeurd",
    },
  });
  return Number(created.id);
}

async function importeerArtikel(
  payload: Payload,
  categoryId: number,
  sourceId: number,
  ruw: RawArticle
): Promise<{ id: number; aangemaakt: boolean }> {
  const nu = new Date().toISOString();
  return upsertArticleBySlug(payload, ruw.slug, {
    title: ruw.title,
    summary: ruw.summary,
    category: categoryId,
    tags: ruw.tags,
    knowledgeType: "product",
    articleStatus: "gepubliceerd",
    aiApprovalStatus: "n.v.t.",
    publishedAt: nu,
    lastContentUpdate: nu,
    sources: [sourceId],
    sections: ruw.sections.map((sectie) => ({ title: sectie.title, blocks: sectie.blocks.map(blockToPayload) })),
  });
}

/**
 * Voert de vaste Curriculum Werkplaats-import uit: 1 handleiding + 18
 * kennisartikelen, upsert-by-slug. Volledig zelfstandig/idempotent — maakt
 * de categorie "curriculum-werkplaats" zelf aan (met de officiële
 * seed-gegevens) als die nog ontbreekt, i.p.v. te falen en `npm run seed`
 * te vereisen (zie upsertCurriculumWerkplaatsCategorie hierboven). Verwerkt
 * elk document onafhankelijk (één mislukt document blokkeert de andere 18
 * niet) en telt aangemaakt/bijgewerkt apart.
 */
export async function importeerCurriculumWerkplaatsKennis(
  payload: Payload
): Promise<CurriculumWerkplaatsImportResultaat> {
  const resultaat: CurriculumWerkplaatsImportResultaat = {
    aangemaakt: 0,
    bijgewerkt: 0,
    verwerkt: 0,
    fouten: [],
  };

  let categoryId: number;
  try {
    categoryId = await upsertCurriculumWerkplaatsCategorie(payload);
  } catch (error) {
    const melding = logImportFout(payload, "categorie-upsert", error);
    resultaat.fouten.push({ slug: CATEGORY_SLUG, melding });
    return resultaat;
  }

  let sourceId: number;
  try {
    sourceId = await upsertBron(payload);
  } catch (error) {
    const melding = logImportFout(payload, "bron-upsert", error);
    resultaat.fouten.push({ slug: BRON_TITEL, melding });
    return resultaat;
  }

  const alleArtikelen: RawArticle[] = [handleiding, ...kennisartikelen];
  for (const ruw of alleArtikelen) {
    try {
      const { aangemaakt } = await importeerArtikel(payload, categoryId, sourceId, ruw);
      if (aangemaakt) resultaat.aangemaakt += 1;
      else resultaat.bijgewerkt += 1;
      resultaat.verwerkt += 1;
    } catch (error) {
      const melding = logImportFout(payload, `artikel:${ruw.slug}`, error);
      resultaat.fouten.push({ slug: ruw.slug, melding });
    }
  }

  return resultaat;
}
