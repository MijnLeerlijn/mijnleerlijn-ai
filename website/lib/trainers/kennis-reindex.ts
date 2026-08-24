import type { Payload } from "payload";
import { embedInChunksIfChanged } from "@/lib/embeddings/chunked-embed";

// Productiecontrole (2026-08-23) — Kennis-Q&A-retrieval vond gepubliceerde
// trainerkennis niet terug. Root cause: een trainerversie kon "gepubliceerd"
// worden zonder geldige embedding (TrainerKennisversies.ts se beforeChange-
// hook faalt af en toe stil — een AI-storing mag het publiceren zelf nooit
// blokkeren, zie de toelichting daar). Dit bestand repareert zulke bestaande
// records (herindexeerTrainerKennisversies) en levert de tellingen voor
// praktische diagnose (haalKennisRetrievalDiagnose) — beide uitsluitend op
// basis van embeddingStatus/embeddingTextHash/embedding, dezelfde velden als
// lib/trainers/kennis.ts se retrieval leest. Geen enkele vraag-/
// antwoordinhoud hier, uitsluitend tellingen en record-ID's.
//
// Vervolgronde (2026-08-23), 1e diagnoseronde — de eerste live
// herindexering liet 1 record "mislukt" zien zonder verder detail:
// herindexeerTrainerKennisversies geeft sindsdien ook per mislukking een
// veilige diagnose terug (categorie/stap/HTTP-status/modelnaam) — nooit de
// API-key, prompttekst of volledige kennisinhoud.
//
// Vervolgronde (2026-08-23), 2e diagnoseronde — die diagnose wees op HTTP
// 400 ("openai_verzoek_ongeldig"): de brontekst bleek te lang voor één
// embed()-aanroep (root cause + fix: lib/embeddings/chunked-embed.ts,
// chunk-text.ts). embedInChunksIfChanged vervangt hier embedIfChanged; de
// diagnose bevat nu ook chunkIndex/totaalChunks/inputTekens/geschatTokens.

const MAX_KENNISVERSIES = 200; // zelfde grens als lib/trainers/kennis.ts — "houd het rustig en eenvoudig" op deze schaal.

interface RuweKennisversie {
  id: number;
  titel: string;
  tekst: string;
  embedding?: unknown;
  embeddingTextHash?: string | null;
  embeddingStatus?: string | null;
}

async function haalGepubliceerdeVersiesRuw(payload: Payload): Promise<RuweKennisversie[]> {
  const resultaat = await payload.find({
    collection: "trainer-kennisversies",
    where: { status: { equals: "gepubliceerd" } },
    overrideAccess: true,
    depth: 0,
    limit: MAX_KENNISVERSIES,
  });
  return resultaat.docs as unknown as RuweKennisversie[];
}

// Zelfde definitie van "bruikbaar voor retrieval" als lib/trainers/kennis.ts
// se zoekRelevanteKennis (elke chunk een niet-lege vector — embedding is
// number[][], zie lib/embeddings/chunked-embed.ts) — hier aangevuld met de
// embeddingStatus-check, zodat een record met een toevallig nog aanwezige
// maar VEROUDERDE embedding (hash niet meer actueel) hier ook als "moet
// herindexeren" telt, ook al zou de kale retrieval-filter hem nog meenemen.
function heeftGeldigeEmbedding(versie: RuweKennisversie): boolean {
  if (versie.embeddingStatus !== "indexed" || !Array.isArray(versie.embedding) || versie.embedding.length === 0) return false;
  return (versie.embedding as unknown[]).every((chunk) => Array.isArray(chunk) && chunk.length > 0);
}

export interface KennisRetrievalDiagnose {
  totaalGepubliceerd: number;
  geindexeerd: number;
  zonderEmbedding: number;
}

/** Praktische diagnose (opdrachtseis §2) — uitsluitend tellingen, nooit vraag-/antwoordinhoud. */
export async function haalKennisRetrievalDiagnose(payload: Payload): Promise<KennisRetrievalDiagnose> {
  const versies = await haalGepubliceerdeVersiesRuw(payload);
  const geindexeerd = versies.filter(heeftGeldigeEmbedding).length;
  return { totaalGepubliceerd: versies.length, geindexeerd, zonderEmbedding: versies.length - geindexeerd };
}

/**
 * Eén mislukking, veilig te tonen aan een beheerder — nooit API-key/prompt/
 * kennisinhoud, alleen categorieën en getallen (chunkIndex/totaalChunks/
 * inputTekens/geschatTokens: zie embedInChunksIfChanged, lib/embeddings/
 * chunked-embed.ts).
 */
export interface HerindexeerFoutDetail {
  id: number;
  categorie: string;
  stap: "api_key" | "aanroep" | "respons" | "onbekend";
  httpStatus: number | null;
  model: string;
  inputTekens: number;
  geschatTokens: number;
  chunkIndex: number;
  totaalChunks: number;
}

export interface HerindexeerResultaat {
  totaalGepubliceerd: number;
  algGeindexeerd: number;
  opnieuwGeindexeerd: number;
  mislukt: number;
  mislukteDetails: HerindexeerFoutDetail[];
}

/**
 * Backfill/reindex (opdrachtseis §2: "ik wil niet iedere trainerversie
 * opnieuw handmatig hoeven publiceren"). Herprobeert embedding voor elke
 * gepubliceerde trainerversie die er nu geen geldige heeft — ongeacht bron
 * (articles/knowledge-sources, de hook maakt daar toch al geen onderscheid
 * in). Idempotent en veilig herhaalbaar: een al-geïndexeerde versie wordt
 * overgeslagen, een blijvend mislukkende versie blijft gewoon "pending"
 * staan (nooit een halve/kapotte embedding wegschrijven) — een latere
 * herindexering probeert het dan opnieuw.
 */
export async function herindexeerTrainerKennisversies(payload: Payload): Promise<HerindexeerResultaat> {
  const versies = await haalGepubliceerdeVersiesRuw(payload);
  let algGeindexeerd = 0;
  let opnieuwGeindexeerd = 0;
  let mislukt = 0;
  const mislukteDetails: HerindexeerFoutDetail[] = [];

  for (const versie of versies) {
    if (heeftGeldigeEmbedding(versie)) {
      algGeindexeerd++;
      continue;
    }

    const brontekst = `${versie.titel}\n\n${versie.tekst}`.trim();
    const uitkomst = await embedInChunksIfChanged({
      text: brontekst,
      storedHash: versie.embeddingTextHash,
      storedStatus: versie.embeddingStatus,
    });

    if (uitkomst.type === "embedded") {
      await payload.update({
        collection: "trainer-kennisversies",
        id: versie.id,
        overrideAccess: true,
        data: { embedding: uitkomst.embeddings, embeddingTextHash: uitkomst.hash, embeddingStatus: "indexed" },
      });
      opnieuwGeindexeerd++;
    } else if (uitkomst.type === "failed") {
      const detail: HerindexeerFoutDetail = { id: versie.id, ...uitkomst.diagnose };
      console.error("[trainer-kennisversies] herindexeren mislukt:", detail);
      mislukt++;
      mislukteDetails.push(detail);
    } else {
      // "skipped" zou hier niet moeten voorkomen (heeftGeldigeEmbedding
      // filtert dat al uit vóórdat embedInChunksIfChanged wordt
      // aangeroepen), maar is inhoudelijk gelijk aan "al in orde" mocht het
      // toch gebeuren.
      algGeindexeerd++;
    }
  }

  return { totaalGepubliceerd: versies.length, algGeindexeerd, opnieuwGeindexeerd, mislukt, mislukteDetails };
}
