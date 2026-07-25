import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPayload } from "payload";
import config from "../../payload.config";
import { processKnowledgeSource } from "../../lib/knowledge/process-source";
import { embedKnowledgeSource } from "../../lib/embeddings/process-embedding";

// Importeert het interne achtergronddocument "Kennisbasis MijnLeerlijn —
// achtergrondverhaal voor de Helpdesk AI" als Knowledge Source — zie de
// chatbot-evaluatieopdracht. Bron: handleidingen/Kennisbasis MijnLeerlijn —
// achtergrondverhaal voor de Helpdesk AI.docx, ÉÉN KEER omgezet naar platte
// tekst (macOS `textutil -convert txt`, geen inhoudelijke wijziging) en hier
// als data-bestand meegecommit — zelfde aanpak als payload/import-
// handleidingen/data/*.json (vooraf geëxtraheerde tekst, geen docx-parser
// als applicatieafhankelijkheid). Het document zelf bevat GEEN klik-voor-
// klik-instructies (dat blijft de taak van de bestaande handleidingen) —
// uitsluitend de onderliggende visie/samenhang, vandaar purpose
// "background-model" (zie lib/embeddings/similarity-search.ts, BronRol).
//
// type "intern_document" i.p.v. "pdf": er is geen PDF-bestand, de tekst gaat
// via het "content"-veld (payload/collections/KnowledgeSources.ts) direct
// de indexeerpijplijn in — zie lib/knowledge/index-source.ts, de content-
// vóór-url-branch.
//
// Idempotent: upsert op title, net als upsertArticleBySlug() in
// payload/import-handleidingen/index.ts — opnieuw draaien na een gewijzigd
// brondocument werkt dus gewoon (herindexeert + herembed).
//
// Gebruik: node --env-file=.env node_modules/.bin/tsx payload/import-kennisbasis/index.ts

const TITEL = "Kennisbasis MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PAD = path.resolve(dirname, "data", "kennisbasis-mijnleerlijn.txt");

async function run() {
  const payload = await getPayload({ config });
  console.log("Payload geïnitialiseerd, import van de kennisbasis (achtergronddocument) gestart…");

  const content = await readFile(DATA_PAD, "utf-8");
  if (!content.trim()) {
    console.error(`Geen inhoud gevonden in ${DATA_PAD} — niets te importeren.`);
    process.exit(1);
  }

  const bestaande = await payload.find({
    collection: "knowledge-sources",
    where: { title: { equals: TITEL } },
    limit: 1,
    overrideAccess: true,
  });

  const data = {
    title: TITEL,
    type: "intern_document" as const,
    priority: "core" as const,
    purpose: "background-model" as const,
    content,
    status: "new" as const,
    embeddingStatus: "pending" as const,
  };

  let sourceId: number;
  if (bestaande.docs[0]) {
    sourceId = Number(bestaande.docs[0].id);
    await payload.update({
      collection: "knowledge-sources",
      id: sourceId,
      overrideAccess: true,
      data,
    });
    console.log(`Bestaande Knowledge Source bijgewerkt (id ${sourceId}).`);
  } else {
    const created = await payload.create({
      collection: "knowledge-sources",
      overrideAccess: true,
      data,
    });
    sourceId = Number(created.id);
    console.log(`Nieuwe Knowledge Source aangemaakt (id ${sourceId}).`);
  }

  const indexUitkomst = await processKnowledgeSource(payload, {
    id: sourceId,
    title: TITEL,
    type: "intern_document",
    content,
  });
  if (indexUitkomst.type === "failed") {
    console.error(`Indexeren mislukt: ${indexUitkomst.foutmelding}`);
    process.exit(1);
  }
  console.log("Geïndexeerd (samenvatting/trefwoorden/categorie).");

  const embedUitkomst = await embedKnowledgeSource(payload, sourceId);
  if (embedUitkomst.type === "failed") {
    console.error(`Embedden mislukt: ${embedUitkomst.foutmelding}`);
    process.exit(1);
  }
  console.log(`Geëmbed (status: ${embedUitkomst.type}).`);

  console.log(`\nImport voltooid: "${TITEL}" (Knowledge Source id ${sourceId}).`);
  process.exit(0);
}

run().catch((error) => {
  console.error("Import mislukt:", error);
  process.exit(1);
});
