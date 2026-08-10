import { getPayload, type Payload } from "payload";
import config from "../../payload.config";
import { plainTextToLexical } from "../lexical";
import { handleiding, kennisartikelen, type RawArticle, type RawBlock } from "./data";

// Import van de Curriculum Werkplaats-documentatie (Helpdesk-beheerkoppeling
// 2026, punt 12/13/14): de volledige handleiding + 18 losse kennisartikelen,
// via DEZELFDE officiële mechanisme als de bestaande MijnLeerlijn-
// handleidingen (payload/import-handleidingen/index.ts) — de `articles`-
// collectie, idempotent geüpsert op slug via de Payload Local API. Geen
// losse markdown-bestanden, geen nieuwe collectie.
//
// In tegenstelling tot import-handleidingen/ (JSON, want mechanisch
// geëxtraheerd uit bestaande PDF's) staat deze content als TypeScript-
// literals in ./data.ts — dit is met de hand geschreven documentatie over
// een net gebouwde applicatie, geen brondocument om te parsen; gewone
// TS-objecten zijn dan prettiger te onderhouden dan JSON-escaping.
//
// Categorie "curriculum-werkplaats" moet al bestaan (via `npm run seed`,
// zie lib/data/categories.ts) vóórdat dit script draait.
//
// Gebruik: node --env-file=.env node_modules/.bin/tsx payload/import-curriculum-werkplaats/index.ts
// (of: npm run import:curriculum-werkplaats, zie package.json)

const CATEGORY_SLUG = "curriculum-werkplaats";
const BRON_TITEL = "Curriculum Werkplaats (applicatie)";

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

async function upsertArticleBySlug(payload: Payload, slug: string, data: Record<string, unknown>): Promise<number> {
  const existing = await payload.find({ collection: "articles", where: { slug: { equals: slug } }, limit: 1, depth: 0 });
  if (existing.docs[0]) {
    const updated = await payload.update({
      collection: "articles",
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
      draft: false,
    } as Parameters<typeof payload.update>[0]);
    return Number(updated.id);
  }
  const created = await payload.create({
    collection: "articles",
    data: { ...data, slug },
    overrideAccess: true,
    draft: false,
  } as Parameters<typeof payload.create>[0]);
  return Number(created.id);
}

async function upsertBron(payload: Payload): Promise<number> {
  const existing = await payload.find({ collection: "sources", where: { title: { equals: BRON_TITEL } }, limit: 1 });
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

async function importeerArtikel(payload: Payload, categoryId: number, sourceId: number, ruw: RawArticle): Promise<number> {
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

async function run() {
  const payload = await getPayload({ config });
  console.log("Payload geïnitialiseerd, import van Curriculum Werkplaats-documentatie gestart…");

  const categorie = await payload.find({ collection: "categories", where: { slug: { equals: CATEGORY_SLUG } }, limit: 1 });
  if (!categorie.docs[0]) {
    console.error(`Categorie "${CATEGORY_SLUG}" niet gevonden. Draai eerst "npm run seed" (zie lib/data/categories.ts).`);
    process.exit(1);
  }
  const categoryId = Number(categorie.docs[0].id);

  const sourceId = await upsertBron(payload);

  const geimporteerdeIds: number[] = [];

  const handleidingId = await importeerArtikel(payload, categoryId, sourceId, handleiding);
  geimporteerdeIds.push(handleidingId);
  console.log(`Geïmporteerd (handleiding): "${handleiding.title}"`);

  for (const artikel of kennisartikelen) {
    const id = await importeerArtikel(payload, categoryId, sourceId, artikel);
    geimporteerdeIds.push(id);
    console.log(`Geïmporteerd (kennisartikel): "${artikel.title}"`);
  }

  console.log(`\nImport voltooid: 1 handleiding + ${kennisartikelen.length} kennisartikelen (${geimporteerdeIds.length} documenten totaal).`);
  console.log(
    "LET OP: Articles worden NIET automatisch geïndexeerd voor de AI (in tegenstelling tot Handleidingen) — " +
      'klik in het admin-overzicht van Artikelen op "Maak embeddings" voor deze documenten, of roep POST /api/knowledge/embed aan.'
  );
  process.exit(0);
}

run().catch((error) => {
  console.error("Import mislukt:", error);
  process.exit(1);
});
