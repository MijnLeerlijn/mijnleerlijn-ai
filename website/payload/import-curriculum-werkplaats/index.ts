import { getPayload } from "payload";
import config from "../../payload.config";
import { importeerCurriculumWerkplaatsKennis } from "@/lib/knowledge/import-curriculum-werkplaats";

// Import van de Curriculum Werkplaats-documentatie (Helpdesk-beheerkoppeling
// 2026, punt 12/13/14): de volledige handleiding + 18 losse kennisartikelen,
// via DEZELFDE officiële mechanisme als de bestaande MijnLeerlijn-
// handleidingen (payload/import-handleidingen/index.ts) — de `articles`-
// collectie, idempotent geüpsert op slug via de Payload Local API. Geen
// losse markdown-bestanden, geen nieuwe collectie.
//
// De daadwerkelijke upsert-logica staat sinds de admin-only productieroute
// (2026-08-10, zie app/api/knowledge/import-curriculum-werkplaats/route.ts)
// gedeeld in lib/knowledge/import-curriculum-werkplaats.ts — dit script is
// nu een dunne CLI-wrapper daaromheen (zelfde opzet als lib/knowledge/
// sync-manuals.ts naast app/api/knowledge/sync-manuals/route.ts), bedoeld
// voor lokaal/dev-gebruik tegen de database in .env.
//
// Categorie "curriculum-werkplaats" hoeft niet vooraf via `npm run seed`
// gezaaid te zijn — importeerCurriculumWerkplaatsKennis maakt 'm zelf aan
// (met dezelfde gegevens als lib/data/categories.ts) als hij nog ontbreekt.
//
// Gebruik: node --env-file=.env node_modules/.bin/tsx payload/import-curriculum-werkplaats/index.ts
// (of: npm run import:curriculum-werkplaats, zie package.json)

async function run() {
  const payload = await getPayload({ config });
  console.log("Payload geïnitialiseerd, import van Curriculum Werkplaats-documentatie gestart…");

  const resultaat = await importeerCurriculumWerkplaatsKennis(payload);

  if (resultaat.fouten.length > 0) {
    for (const fout of resultaat.fouten) {
      console.error(`Mislukt (${fout.slug}): ${fout.melding}`);
    }
  }

  console.log(
    `\nImport voltooid: ${resultaat.aangemaakt} aangemaakt, ${resultaat.bijgewerkt} bijgewerkt ` +
      `(${resultaat.verwerkt} van 19 documenten verwerkt).`
  );

  if (resultaat.verwerkt === 0 && resultaat.fouten.length > 0) {
    // Categorie ontbrak (of een andere blokkerende fout vóór de lus) — niets
    // is verwerkt, dat is een harde mislukking, geen gedeeltelijk succes.
    process.exit(1);
  }

  console.log(
    "LET OP: Articles worden NIET automatisch geïndexeerd voor de AI (in tegenstelling tot Handleidingen) — " +
      'klik in het admin-overzicht van Artikelen op "Maak embeddings" voor deze documenten, of roep POST /api/knowledge/embed aan.'
  );
  process.exit(resultaat.fouten.length > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error("Import mislukt:", error);
  process.exit(1);
});
