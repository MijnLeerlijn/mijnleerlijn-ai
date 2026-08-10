import type { Payload } from "payload";
import { plainTextToLexical } from "@/payload/lexical";
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
 * kennisartikelen, upsert-by-slug. Verwerkt elk document onafhankelijk (één
 * mislukt document blokkeert de andere 18 niet) en telt aangemaakt/
 * bijgewerkt apart. Ontbreekt de categorie "curriculum-werkplaats" (zou
 * betekenen dat `npm run seed` nooit gedraaid is), dan wordt dat als één
 * fout gerapporteerd en verder niets geïmporteerd — er is dan geen geldige
 * category-relatie om artikelen aan te hangen.
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

  const categorie = await payload.find({
    collection: "categories",
    where: { slug: { equals: CATEGORY_SLUG } },
    limit: 1,
  });
  if (!categorie.docs[0]) {
    resultaat.fouten.push({
      slug: CATEGORY_SLUG,
      melding: `Categorie "${CATEGORY_SLUG}" bestaat niet — draai eerst "npm run seed" (zie lib/data/categories.ts).`,
    });
    return resultaat;
  }
  const categoryId = Number(categorie.docs[0].id);
  const sourceId = await upsertBron(payload);

  const alleArtikelen: RawArticle[] = [handleiding, ...kennisartikelen];
  for (const ruw of alleArtikelen) {
    try {
      const { aangemaakt } = await importeerArtikel(payload, categoryId, sourceId, ruw);
      if (aangemaakt) resultaat.aangemaakt += 1;
      else resultaat.bijgewerkt += 1;
      resultaat.verwerkt += 1;
    } catch (error) {
      resultaat.fouten.push({
        slug: ruw.slug,
        melding: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return resultaat;
}
