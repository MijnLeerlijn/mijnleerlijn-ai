import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — spec §29, letterlijk: "Bewijs
// expliciet in tests dat geen enkele telefonie-route/module create_update,
// wijzigKolomWaarde, writeback.ts of andere Monday-mutatielaag rechtstreeks
// aanroept." Dit is de STATISCHE bewijslaag (broncodetekst-scan, zelfde
// bewezen patroon als lib/admin-nav/nav-groups.test.ts se admin.group-scan) —
// bewijst het onafhankelijk van of een test toevallig elk codepad raakt.
// gesprek.test.ts se "KRITIEKE ARCHITECTUURTEST" bewijst hetzelfde daarnaast
// nog eens GEDRAGSMATIG (het echte, end-to-end pad roept de gemockte
// Monday-mutatiefuncties daadwerkelijk nooit aan) — de twee zijn bewust
// complementair, niet een vervanging van elkaar.

const PROJECT_ROOT = join(__dirname, "../../..");
const GESCANDE_MAPPEN = [join(PROJECT_ROOT, "lib/trainers/telefonie"), join(PROJECT_ROOT, "app/api/trainers/telefonie")];

// Exacte namen van Monday-MUTATIE-functies/GraphQL-mutaties (nooit lezen —
// uitsluitend schrijven), opgehaald uit lib/sales/monday-client.ts en
// lib/trainers/writeback.ts se eigen exports. Bewust GEEN leesfuncties
// hierin (haalTrainingVoorMutatie, leesKolomWaarden, mondayQuery, ...) — die
// MOGEN de telefonielaag wél gebruiken (bv. via de bestaande
// upsertConcept/structureerVerslag), alleen SCHRIJVEN naar Monday mag nooit.
const VERBODEN_PATRONEN = [
  "create_update", // Monday GraphQL-mutatie (maakUpdate)
  "change_simple_column_value", // Monday GraphQL-mutatie (wijzigKolomWaarde)
  "change_column_value", // Monday GraphQL-mutatie (wijzigKolomWaardeJson)
  "wijzigKolomWaarde", // matcht zowel wijzigKolomWaarde als wijzigKolomWaardeJson
  "maakUpdate",
  "werkTrainingBij", // lib/trainers/writeback.ts se enige export
  "bevestigVerslag", // de portal-bevestigingsfunctie zelf — mag NOOIT vanuit telefonie aangeroepen worden, uitsluitend upsertConcept/structureerVerslag
  "lib/trainers/writeback",
  "lib/sales/monday-client",
];

/**
 * gesprek.ts se eigen "KRITIEKE ARCHITECTUURGRENS"-doc-comment legt exact dít
 * verbod uit uit en noemt de verboden namen daarbij zelf (in negatieve zin:
 * "roept NOOIT ... aan") — een kale substring-scan zou dus op zijn EIGEN,
 * correcte documentatie struikelen. Verwijdert daarom eerst alle
 * blokcommentaar (/* ... * /) en vervolgens regel-commentaar (// tot einde
 * regel), met een guard tegen "://" (bv. in een URL/import-alias) zodat een
 * echte code-URL nooit per ongeluk als commentaarstart gezien wordt.
 */
function verwijderCommentaar(bron: string): string {
  const zonderBlokcommentaar = bron.replace(/\/\*[\s\S]*?\*\//g, "");
  return zonderBlokcommentaar
    .split("\n")
    .map((regel) => regel.replace(/(?<!:)\/\/.*$/, ""))
    .join("\n");
}

function verzamelBestanden(map: string): string[] {
  const resultaat: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) {
      resultaat.push(...verzamelBestanden(pad));
      continue;
    }
    if (!naam.endsWith(".ts") && !naam.endsWith(".tsx")) continue;
    if (naam.endsWith(".test.ts") || naam.endsWith(".test.tsx")) continue; // deze testbestanden zelf noemen de verboden namen bewust (mocks/documentatie)
    resultaat.push(pad);
  }
  return resultaat;
}

describe("Architectuurgrens telefonie (spec §29)", () => {
  const bestanden = [...GESCANDE_MAPPEN.flatMap(verzamelBestanden)];

  // Sanity check op de scan zelf — als dit ooit (bijna) 0 oplevert, bewijst
  // de test hieronder stilzwijgend niets meer (bv. door een mapverplaatsing).
  // Drempel bewust verlaagd bij de Telnyx-providermigratie (2026-08-25
  // vervolg): de 4 losse Twilio-webhookroutes zijn vervangen door ÉÉN
  // dispatcher-route (zie app/api/trainers/telefonie/webhook/route.ts) — een
  // legitieme, kleinere bestandenverzameling, geen verzwakking van de scan.
  it("de scan vindt daadwerkelijk telefonie-bronbestanden (sanity check)", () => {
    expect(bestanden.length).toBeGreaterThan(5);
  });

  it.each(bestanden.map((pad) => [pad.replace(`${PROJECT_ROOT}/`, ""), pad] as const))("%s roept geen enkele Monday-mutatiefunctie/-mutatie aan en importeert nooit de mutatielaag rechtstreeks", (_naam, pad) => {
    const inhoud = readFileSync(pad, "utf-8");
    const codeZonderCommentaar = verwijderCommentaar(inhoud);
    for (const patroon of VERBODEN_PATRONEN) {
      expect(codeZonderCommentaar, `${pad} bevat het verboden patroon "${patroon}" (buiten commentaar)`).not.toContain(patroon);
    }
  });

  it("het complete pad kan uitsluitend definitief naar Monday schrijven via de bestaande, trainer-bevestigde portal-flow (bevestigVerslag in lib/trainers/verslag.ts) — nooit vanuit een telefonie-webhook", () => {
    // Omgekeerde controle: bevestig dat bevestigVerslag() zelf WEL bestaat en
    // WEL de Monday-mutatielaag gebruikt (anders zou de afwezigheid hierboven
    // niets betekenen — dan zou namelijk NIETS in dit hele project ooit
    // schrijft, en is de aanwezigheids-scan hierboven een vals-positief bewijs).
    const verslagBron = readFileSync(join(PROJECT_ROOT, "lib/trainers/verslag.ts"), "utf-8");
    expect(verslagBron).toContain("bevestigVerslag");
    expect(verslagBron).toMatch(/maakUpdate|wijzigKolomWaarde/);
  });
});
