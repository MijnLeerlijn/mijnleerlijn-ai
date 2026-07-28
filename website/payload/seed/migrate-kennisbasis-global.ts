import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPayload } from "payload";
import config from "../../payload.config";
import {
  tekstNaarRichText,
  richTextNaarGestructureerdeTekst,
  normaliseerVoorVergelijking,
} from "@/lib/assistant/kennisbasis-richtext";

// Kennisbasis MijnLeerlijn — Fase 3 (2026-07-28): eenmalige migratie van het
// bestaande achtergrondverhaal (tot nu toe alleen een KnowledgeSource,
// id 9 in productie, bronrol "background-model") naar de nieuwe, centrale
// Payload Global (payload/globals/KennisbasisMijnleerlijn.ts). Leest
// UITSLUITEND de al-versiebeheerde, bevestigd-identieke brontekst hieronder
// — geen herschreven of verzonnen inhoud, zie het onderzoeksrapport.
//
// Publiceert automatisch (`draft: false`) wanneer de mechanische txt→
// richText-conversie aantoonbaar verliesvrij is (round-trip-controle
// hieronder); blijft anders concept (`draft: true`) zodat een beheerder het
// eerst handmatig controleert. Idempotent: een herhaalde run met identieke
// brontekst maakt gewoon een nieuwe, gelijke versie aan (Payload's eigen
// versiehistorie, geen stille overschrijving van een inmiddels handmatig
// bewerkte stand — dat blijft altijd zichtbaar in de versies-lijst).
//
// Gebruik: node --env-file-if-exists=.env node_modules/.bin/tsx payload/seed/migrate-kennisbasis-global.ts

const dirname = path.dirname(fileURLToPath(import.meta.url));
const BRON_PAD = path.resolve(
  dirname,
  "..",
  "import-kennisbasis",
  "data",
  "kennisbasis-mijnleerlijn.txt"
);
const TITEL = "Kennisbasis MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI";

export interface MigratieResultaat {
  gepubliceerd: boolean;
  afwijkingen: string[];
}

/**
 * Puur, los van Payload/bestandssysteem — apart testbaar. Zet de brontekst
 * om, controleert de round-trip, en geeft terug of publiceren veilig is.
 */
export function bepaalMigratieResultaat(brontekst: string): {
  richText: ReturnType<typeof tekstNaarRichText>;
  publiceren: boolean;
  afwijkingen: string[];
} {
  const richText = tekstNaarRichText(brontekst);
  const teruggeconverteerd = richTextNaarGestructureerdeTekst(richText);

  const origineleRegels = normaliseerVoorVergelijking(brontekst).split("\n");
  const teruggeconverteerdeRegels = normaliseerVoorVergelijking(teruggeconverteerd).split("\n");

  const afwijkingen: string[] = [];
  const maxLengte = Math.max(origineleRegels.length, teruggeconverteerdeRegels.length);
  for (let i = 0; i < maxLengte; i++) {
    if (origineleRegels[i] !== teruggeconverteerdeRegels[i]) {
      afwijkingen.push(
        `Regel ${i + 1}: bron="${origineleRegels[i] ?? "(ontbreekt)"}" vs. geconverteerd="${teruggeconverteerdeRegels[i] ?? "(ontbreekt)"}"`
      );
    }
  }

  return { richText, publiceren: afwijkingen.length === 0, afwijkingen };
}

async function run() {
  const brontekst = await readFile(BRON_PAD, "utf-8");
  const { richText, publiceren, afwijkingen } = bepaalMigratieResultaat(brontekst);

  const payload = await getPayload({ config });
  console.log(`Payload geïnitialiseerd. Brontekst gelezen (${brontekst.length} tekens) uit ${BRON_PAD}.`);

  if (!publiceren) {
    console.warn(
      `Round-trip-controle vond ${afwijkingen.length} afwijking(en) — de Global wordt als CONCEPT opgeslagen, niet automatisch gepubliceerd:`
    );
    for (const afwijking of afwijkingen.slice(0, 20)) {
      console.warn(`  - ${afwijking}`);
    }
    if (afwijkingen.length > 20) {
      console.warn(`  … en ${afwijkingen.length - 20} meer.`);
    }
  } else {
    console.log("Round-trip-controle geslaagd (geen inhoudelijke afwijkingen) — wordt automatisch gepubliceerd.");
  }

  // BELANGRIJK, empirisch bevestigd (Payload 3.86.0, globals/operations/
  // update.js): de `draft`-parameter alléén bepaalt NIET de `_status` van
  // het resultaat — zonder een expliciet `_status`-veld in `data` valt
  // Payload terug op de veld-default ("draft"), ongeacht `draft: false`.
  // Publiceren vereist dus `data._status: "published"` expliciet.
  await payload.updateGlobal({
    slug: "kennisbasis-mijnleerlijn",
    overrideAccess: true,
    draft: !publiceren,
    // Lexical's gegenereerde veldtype verwacht een index-signature-vorm;
    // tekstNaarRichText() bouwt bewust een strak getypeerde, geldige
    // SerializedEditorState-structuur (zie kennisbasis-richtext.ts) — cast
    // hier is puur een typemismatch, geen structuurwijziging.
    data: {
      titel: TITEL,
      inhoud: richText as unknown as Record<string, unknown>,
      _status: publiceren ? "published" : "draft",
    },
  });

  console.log(
    `\nMigratie voltooid: Global ${publiceren ? "GEPUBLICEERD" : "opgeslagen als CONCEPT (controleer handmatig)"}.`
  );
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error) => {
    console.error("Migreren van de centrale kennisbasis mislukt:", error);
    process.exit(1);
  });
}
