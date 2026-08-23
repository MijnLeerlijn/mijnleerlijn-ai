import type { Payload } from "payload";
import { embedIfChanged } from "@/lib/embeddings/embed-record";
import type { EmbeddingFoutDiagnose } from "@/services/ai-client";

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
// Vervolgronde (2026-08-23) — de eerste live herindexering liet 1 record
// "mislukt" zien zonder verder detail. herindexeerTrainerKennisversies geeft
// nu ook per mislukking een veilige diagnose terug (categorie/stap/HTTP-
// status/modelnaam, via classificeerEmbeddingFout — services/ai-client.ts)
// — nooit de API-key, promptekst of volledige kennisinhoud.

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
// se zoekRelevanteKennis (Array.isArray + niet-leeg) — hier aangevuld met de
// embeddingStatus-check, zodat een record met een toevallig nog aanwezige
// maar VEROUDERDE embedding (hash niet meer actueel) hier ook als "moet
// herindexeren" telt, ook al zou de kale retrieval-filter hem nog meenemen.
function heeftGeldigeEmbedding(versie: RuweKennisversie): boolean {
  return versie.embeddingStatus === "indexed" && Array.isArray(versie.embedding) && versie.embedding.length > 0;
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

/** Eén mislukking, veilig te tonen aan een beheerder — nooit API-key/prompt/kennisinhoud. */
export interface HerindexeerFoutDetail {
  id: number;
  categorie: string;
  stap: "api_key" | "aanroep" | "respons" | "onbekend";
  httpStatus: number | null;
  model: string | null;
}

export interface HerindexeerResultaat {
  totaalGepubliceerd: number;
  algGeindexeerd: number;
  opnieuwGeindexeerd: number;
  mislukt: number;
  mislukteDetails: HerindexeerFoutDetail[];
}

// Fallback "onbekende_fout" is uitsluitend voor een embedIfChanged-uitkomst
// zónder diagnose (in de praktijk alleen embedIfChanged's eigen "geen tekst"-
// validatie — komt hier nooit voor, want de aanroeper filtert een lege
// brontekst hierboven al vóór embedIfChanged wordt aangeroepen). Zelfde
// naam/betekenis als classificeerEmbeddingFout se eigen catch-all.
function veiligeDiagnose(diagnose: EmbeddingFoutDiagnose | undefined): Omit<HerindexeerFoutDetail, "id"> {
  return diagnose
    ? { categorie: diagnose.categorie, stap: diagnose.stap, httpStatus: diagnose.httpStatus, model: diagnose.model }
    : { categorie: "onbekende_fout", stap: "onbekend", httpStatus: null, model: null };
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
    if (!brontekst) {
      mislukt++;
      mislukteDetails.push({ id: versie.id, categorie: "geen_tekst_om_te_embedden", stap: "onbekend", httpStatus: null, model: null });
      continue;
    }

    const uitkomst = await embedIfChanged({
      text: brontekst,
      storedHash: versie.embeddingTextHash,
      storedStatus: versie.embeddingStatus,
    });

    if (uitkomst.type === "embedded") {
      await payload.update({
        collection: "trainer-kennisversies",
        id: versie.id,
        overrideAccess: true,
        data: { embedding: uitkomst.embedding, embeddingTextHash: uitkomst.hash, embeddingStatus: "indexed" },
      });
      opnieuwGeindexeerd++;
    } else if (uitkomst.type === "failed") {
      const detail = { id: versie.id, ...veiligeDiagnose(uitkomst.diagnose) };
      console.error("[trainer-kennisversies] herindexeren mislukt:", detail);
      mislukt++;
      mislukteDetails.push(detail);
    } else {
      // "skipped" zou hier niet moeten voorkomen (heeftGeldigeEmbedding
      // filtert dat al uit vóórdat embedIfChanged wordt aangeroepen), maar
      // is inhoudelijk gelijk aan "al in orde" mocht het toch gebeuren.
      algGeindexeerd++;
    }
  }

  return { totaalGepubliceerd: versies.length, algGeindexeerd, opnieuwGeindexeerd, mislukt, mislukteDetails };
}
