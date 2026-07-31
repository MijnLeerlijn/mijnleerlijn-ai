import { getPayload } from "payload";
import config from "../../payload.config";
import { richTextNaarGestructureerdeTekst, normaliseerVoorVergelijking } from "@/lib/assistant/kennisbasis-richtext";
import { vindAchtergrondDocumentenVoorVariant } from "@/lib/assistant/kennisbasis-context";
import { defaultVariant } from "@/config/variants";

// Kennisbasis per variant — migratie (2026-07-31): zet de HUIDIGE,
// gepubliceerde inhoud van de Global `kennisbasis-mijnleerlijn` 1-op-1 over
// naar het per-variant achtergronddocument van MijnLeerlijn (een gewone
// `knowledge-sources`-rij, `type: intern_document`, gekoppeld via
// `variantContext`) — zie lib/assistant/kennisbasis-context.ts voor het
// leespad dat dit document daarna gebruikt.
//
// GEEN hardcoded document-id of titelmatching: het bestaande (of te maken)
// document wordt uitsluitend gevonden via `vindAchtergrondDocumentenVoorVariant()`
// — exact dezelfde functie die de AI-pijplijn gebruikt, dus dit script en de
// retrieval kunnen nooit uit de pas lopen. Onderzoek vooraf (zie het
// technisch ontwerp) bevestigde dat productie GEEN bestaand achtergrond-
// document voor MijnLeerlijn heeft (in tegenstelling tot een eerdere, alleen
// lokale aanname) — dit script maakt er dus voor het eerst één aan, of
// werkt een reeds aanwezige (bv. door een eerdere, deels gelukte run) bij.
//
// Idempotent: een tweede run vindt het net aangemaakte/bijgewerkte document
// via hetzelfde kenmerk en werkt het bij — nooit een tweede document. De
// content wordt bij elke run herschreven naar de dan-actuele Global-inhoud
// (bewust: dit is een brug tijdens de overgang, geen eenmalige kopie die
// stil kan verouderen als iemand de Global nog bewerkt vóór deze migratie
// definitief wordt afgerond).
//
// Expliciete verificatie ná het schrijven: leest het zojuist opgeslagen
// document terug en vergelijkt (genormaliseerd, zelfde vergelijking als
// migrate-kennisbasis-global.ts) tegen de brontekst uit de Global — meldt
// elke afwijking, in plaats van blind te vertrouwen op de schrijfactie.
//
// Gebruik: node --env-file-if-exists=.env node_modules/.bin/tsx payload/seed/migreer-kennisbasis-naar-variant.ts

/**
 * Puur, los van Payload/bestandssysteem — apart testbaar. Vergelijkt twee
 * teksten regel-voor-regel na normalisatie (zelfde vergelijking als
 * migrate-kennisbasis-global.ts se bepaalMigratieResultaat).
 */
export function vergelijkTekst(bron: string, opgeslagen: string): { gelijk: boolean; afwijkingen: string[] } {
  const bronRegels = normaliseerVoorVergelijking(bron).split("\n");
  const opgeslagenRegels = normaliseerVoorVergelijking(opgeslagen).split("\n");
  const afwijkingen: string[] = [];
  const maxLengte = Math.max(bronRegels.length, opgeslagenRegels.length);
  for (let i = 0; i < maxLengte; i++) {
    if (bronRegels[i] !== opgeslagenRegels[i]) {
      afwijkingen.push(
        `Regel ${i + 1}: bron="${bronRegels[i] ?? "(ontbreekt)"}" vs. opgeslagen="${opgeslagenRegels[i] ?? "(ontbreekt)"}"`
      );
    }
  }
  return { gelijk: afwijkingen.length === 0, afwijkingen };
}

async function run() {
  const payload = await getPayload({ config });
  console.log("Payload geïnitialiseerd. Migratie kennisbasis → per-variant achtergronddocument gestart…");

  const global = await payload.findGlobal({
    slug: "kennisbasis-mijnleerlijn",
    draft: false,
    overrideAccess: true,
    depth: 0,
  });
  const status = (global as unknown as { _status?: string })._status;
  if (status !== "published") {
    console.error(`De Global 'kennisbasis-mijnleerlijn' is niet gepubliceerd (status: ${status ?? "onbekend"}) — migratie afgebroken, niets aangepast.`);
    process.exit(1);
  }
  const brontekst = richTextNaarGestructureerdeTekst(global.inhoud);
  if (!brontekst.trim()) {
    console.error("De Global heeft geen (leesbare) inhoud — migratie afgebroken, niets aangepast.");
    process.exit(1);
  }
  console.log(`Brontekst gelezen uit de Global (${brontekst.length} tekens).`);

  const variantResultaat = await payload.find({
    collection: "variants",
    where: { slug: { equals: defaultVariant.slug } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  });
  const variant = variantResultaat.docs[0];
  if (!variant) {
    console.error(`Geen variant gevonden met slug "${defaultVariant.slug}" — migratie afgebroken, niets aangepast.`);
    process.exit(1);
  }
  const variantId = Number(variant.id);
  const productNaam =
    (variant as unknown as { branding?: { productName?: string } }).branding?.productName ||
    (variant as unknown as { name?: string }).name ||
    "MijnLeerlijn";
  console.log(`Variant gevonden: "${productNaam}" (id ${variantId}).`);

  // Uitsluitend op kenmerk zoeken (variantContext + bronrol) — nooit op id/titel.
  const bestaande = await vindAchtergrondDocumentenVoorVariant(payload, variantId);
  if (bestaande.length > 1) {
    console.error(
      `Variant ${variantId} heeft al ${bestaande.length} achtergronddocumenten (zou uniek moeten zijn door de nieuwe validatie) — migratie afgebroken, controleer knowledge-sources handmatig.`
    );
    process.exit(1);
  }

  let documentId: number;
  if (bestaande[0]) {
    documentId = bestaande[0].id;
    await payload.update({
      collection: "knowledge-sources",
      id: documentId,
      overrideAccess: true,
      data: { content: brontekst },
    });
    console.log(`Bestaand achtergronddocument bijgewerkt (id ${documentId}) — geen nieuw document aangemaakt.`);
  } else {
    const aangemaakt = await payload.create({
      collection: "knowledge-sources",
      overrideAccess: true,
      draft: false,
      data: {
        title: `Kennisbasis ${productNaam}`,
        type: "intern_document",
        priority: "core",
        status: "new",
        embeddingStatus: "pending",
        content: brontekst,
        variantContext: [variantId],
      },
    });
    documentId = Number(aangemaakt.id);
    console.log(`Nieuw achtergronddocument aangemaakt (id ${documentId}).`);
  }

  // Expliciete verificatie: teruglezen en vergelijken, niet blind vertrouwen.
  const teruggelezen = await payload.findByID({
    collection: "knowledge-sources",
    id: documentId,
    overrideAccess: true,
    depth: 0,
  });
  const opgeslagenTekst = String((teruggelezen as unknown as { content?: string }).content ?? "");
  const { gelijk, afwijkingen } = vergelijkTekst(brontekst, opgeslagenTekst);

  if (!gelijk) {
    console.error(`Verificatie MISLUKT: ${afwijkingen.length} afwijkende regel(s) tussen brontekst en opgeslagen document:`);
    for (const afwijking of afwijkingen.slice(0, 20)) console.error(`  - ${afwijking}`);
    process.exit(1);
  }

  console.log("Verificatie geslaagd: opgeslagen inhoud is regel-voor-regel identiek aan de Global se brontekst.");
  console.log(`\nMigratie voltooid: achtergronddocument van "${productNaam}" (knowledge-sources id ${documentId}) bevat nu de volledige, ongewijzigde Global-inhoud.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error) => {
    console.error("Migratie mislukt:", error);
    process.exit(1);
  });
}
