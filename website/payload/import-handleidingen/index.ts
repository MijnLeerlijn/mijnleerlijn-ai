import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPayload, type Payload } from "payload";
import config from "../../payload.config";
import { plainTextToLexical } from "../lexical";

// Echte contentmigratie van de eerste 25 handleidingen (handleidingen/) naar
// het modulaire contentmodel — zie docs/DATA-MODEL.md en het Fase 5
// livegang-opleveringsrapport. In tegenstelling tot payload/seed/index.ts
// (fictieve Fase 3-demo-artikelen) is dit ECHTE, gepubliceerde productiecontent
// — geen dummy-data.
//
// De bron-JSON's in ./data/ zijn geëxtraheerd uit de originele PDF's in
// handleidingen/ met alleen letterlijke of licht opgeschoonde tekst (nooit
// verzonnen inhoud) — zie het opleveringsrapport voor de aanpak. Bestanden
// met een `waarschuwingVoorImport`-veld bevatten onvoldoende zelfstandige
// instructie-inhoud (bijv. een generieke overzichtspagina) en worden bewust
// overgeslagen, niet als volwaardige handleiding gepubliceerd.
//
// Gebruik: node --env-file=.env node_modules/.bin/tsx payload/import-handleidingen/index.ts

const dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(dirname, "data");

interface RawBlock {
  type: "tekst" | "genummerde_stap" | "waarschuwing" | "tip";
  body: string;
}

interface RawSection {
  title: string;
  blocks: RawBlock[];
}

interface RawHandleiding {
  sourcePdf: string;
  slug: string;
  title: string;
  summary: string;
  categorySlug: string;
  tags: string[];
  sections: RawSection[];
  waarschuwingVoorImport?: string;
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
): Promise<number> {
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

async function upsertSourceVoorHandleiding(payload: Payload, handleiding: RawHandleiding): Promise<number> {
  const existing = await payload.find({
    collection: "sources",
    where: { title: { equals: handleiding.title } },
    limit: 1,
  });
  if (existing.docs[0]) return Number(existing.docs[0].id);

  const created = await payload.create({
    collection: "sources",
    overrideAccess: true,
    data: {
      title: handleiding.title,
      type: "interne_handleiding",
      publisher: `MijnLeerlijn (bron: ${handleiding.sourcePdf})`,
      reliability: "hoog",
      internalStatus: "goedgekeurd",
    },
  });
  return Number(created.id);
}

async function run() {
  const payload = await getPayload({ config });
  console.log("Payload geïnitialiseerd, import van echte handleidingen gestart…");

  const bestandsnamen = (await readdir(DATA_DIR)).filter((f) => f.endsWith(".json")).sort();
  if (bestandsnamen.length === 0) {
    console.error(`Geen JSON-bestanden gevonden in ${DATA_DIR} — niets te importeren.`);
    process.exit(1);
  }

  const categoryIdBySlug = new Map<string, number>();
  const overgeslagen: string[] = [];
  let geimporteerd = 0;

  for (const bestandsnaam of bestandsnamen) {
    const ruw = JSON.parse(await readFile(path.join(DATA_DIR, bestandsnaam), "utf-8")) as RawHandleiding;

    if (ruw.waarschuwingVoorImport) {
      overgeslagen.push(`${bestandsnaam} (${ruw.sourcePdf}): ${ruw.waarschuwingVoorImport}`);
      continue;
    }

    let categoryId = categoryIdBySlug.get(ruw.categorySlug);
    if (!categoryId) {
      const gevonden = await payload.find({
        collection: "categories",
        where: { slug: { equals: ruw.categorySlug } },
        limit: 1,
      });
      if (!gevonden.docs[0]) {
        console.warn(
          `Categorie "${ruw.categorySlug}" niet gevonden voor "${ruw.title}" (${bestandsnaam}) — overgeslagen. Draai eerst "npm run seed" voor de categorieën.`
        );
        overgeslagen.push(`${bestandsnaam}: categorie "${ruw.categorySlug}" ontbreekt`);
        continue;
      }
      categoryId = Number(gevonden.docs[0].id);
      categoryIdBySlug.set(ruw.categorySlug, categoryId);
    }

    const sourceId = await upsertSourceVoorHandleiding(payload, ruw);

    const nu = new Date().toISOString();
    await upsertArticleBySlug(payload, ruw.slug, {
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
      sections: ruw.sections.map((sectie) => ({
        title: sectie.title,
        blocks: sectie.blocks.map(blockToPayload),
      })),
    });

    geimporteerd += 1;
    console.log(`Geïmporteerd: "${ruw.title}" (${bestandsnaam})`);
  }

  console.log(`\nImport voltooid: ${geimporteerd} handleidingen geïmporteerd.`);
  if (overgeslagen.length > 0) {
    console.log(`${overgeslagen.length} bestand(en) bewust overgeslagen:`);
    for (const reden of overgeslagen) console.log(`  - ${reden}`);
  }
  process.exit(0);
}

run().catch((error) => {
  console.error("Import mislukt:", error);
  process.exit(1);
});
