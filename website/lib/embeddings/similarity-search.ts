import type { Payload } from "payload";
import { cosineSimilarity } from "ai";
import { generateEmbedding } from "@/services/ai-client";

// Semantische zoekfunctie over alle geëmbedde documenten (knowledge-sources
// + hun hoofdstukken, knowledge-drafts, articles) — geen chatbot, geen
// gegenereerd antwoord: uitsluitend een gerangschikte lijst treffers met
// similarity-score. Cosine similarity komt rechtstreeks uit de Vercel AI
// SDK (`cosineSimilarity`) i.p.v. zelf herimplementeren.
//
// TIJDELIJKE implementatie: laadt alle geïndexeerde vectoren in het geheugen
// en rekent in JS — werkt prima op de schaal van deze sprint, maar is
// bewust de eerste (en enige) plek die vervangen moet worden zodra er een
// echte vectorstore/pgvector-koppeling komt. Zie het commentaar bij
// `embedding` in payload/collections/KnowledgeSources.ts.

export type SearchHitType = "knowledge-source" | "knowledge-source-chapter" | "knowledge-draft" | "article";

export interface SearchHit {
  type: SearchHitType;
  id: number;
  title: string;
  chapterTitle?: string;
  similarity: number;
  reason: string;
}

const STANDAARD_ZOEKLIMIET = 10;
const MAX_KANDIDATEN_PER_COLLECTIE = 500;

// Sprint 6: veilige standaard voor welke knowledge-drafts de assistent als
// bron mag gebruiken. Overwogen opties waren "new" meetellen (nee — dat is
// onbeoordeelde, mogelijk onjuiste of nog niet op algemene bruikbaarheid
// gecontroleerde AI-output uit Gmail-analyse, zie lib/support/analyze.ts),
// "published" meetellen (ook nee — dat betekent juist dat het concept al
// handmatig is omgezet naar een echt Article; dat Article wordt zelf al
// apart geëmbed/geciteerd, dus een gepubliceerd concept ERNAAST laten
// meezoeken zou dezelfde kennis dubbel en mogelijk verouderd laten
// terugkomen), en "rejected" (vanzelfsprekend nooit). Uitkomst: uitsluitend
// "approved" — een concept dat een beheerder heeft beoordeeld en akkoord
// bevonden als algemeen bruikbare kennis, maar nog niet (of nooit) apart tot
// artikel is verwerkt. Zelfde poort afgedwongen in
// lib/embeddings/process-embedding.ts::embedKnowledgeDraft() (kan dus al
// nooit een embedding krijgen) — dit filter hier is bewuste verdediging in
// diepte, voor het geval een embedding van vóór deze wijziging nog bestaat
// of een concept na het embedden alsnog afgekeurd wordt.
const VEILIGE_DRAFT_STATUSSEN = ["approved"];

const TYPE_LABEL: Record<SearchHitType, string> = {
  "knowledge-source": "deze kennisbron",
  "knowledge-source-chapter": "dit hoofdstuk",
  "knowledge-draft": "dit conceptkennisartikel",
  article: "dit artikel",
};

function bouwReden(type: SearchHitType, similarity: number, chapterTitle?: string): string {
  const percentage = Math.round(similarity * 100);
  const kwalificatie =
    similarity >= 0.85 ? "zeer hoge" : similarity >= 0.7 ? "hoge" : similarity >= 0.5 ? "gemiddelde" : "lage";
  const doel = chapterTitle ? `hoofdstuk "${chapterTitle}"` : TYPE_LABEL[type];
  return `${kwalificatie} semantische overlap (${percentage}%) met ${doel}.`;
}

// Sprint: fasering van Knowledge Sources op prioriteit (payload/collections/
// KnowledgeSources.ts, veld `priority`) — alleen knowledge-sources/hun
// hoofdstukken hebben een prioriteitstier; knowledge-drafts en articles
// hebben dat concept niet en blijven daarom in searchKnowledgePhased()
// hieronder ALTIJD meedoen, in elke fase (zie de uitleg daar).
export type KnowledgeSourcePriority = "core" | "secondary" | "reference";
const PRIORITEIT_RANG: Record<KnowledgeSourcePriority, number> = { core: 0, secondary: 1, reference: 2 };

interface Kandidaat {
  type: SearchHitType;
  id: number;
  title: string;
  chapterTitle?: string;
  embedding: number[];
  /** Alleen gezet voor knowledge-source/knowledge-source-chapter — hoofdstukken erven de prioriteit van hun bron. */
  priority?: KnowledgeSourcePriority;
}

function isEmbeddingVector(waarde: unknown): waarde is number[] {
  return Array.isArray(waarde) && waarde.length > 0 && typeof waarde[0] === "number";
}

async function verzamelKandidaten(payload: Payload): Promise<Kandidaat[]> {
  const kandidaten: Kandidaat[] = [];

  const bronnen = await payload.find({
    collection: "knowledge-sources",
    where: { embeddingStatus: { equals: "indexed" } },
    limit: MAX_KANDIDATEN_PER_COLLECTIE,
    overrideAccess: true,
    depth: 0,
  });
  for (const bron of bronnen.docs) {
    // priority is een verplicht veld met default "core" (zie
    // KnowledgeSources.ts) — bij bestaande testfixtures zonder dit veld
    // (fake-payload) kan het ontbreken; dan telt de bron/het hoofdstuk niet
    // mee in een prioriteitstier (zie searchKnowledgePhased hieronder), maar
    // blijft-ie wel gewoon een geldige kandidaat voor searchKnowledge().
    const priority = bron.priority as KnowledgeSourcePriority | undefined;
    if (isEmbeddingVector(bron.embedding)) {
      kandidaten.push({
        type: "knowledge-source",
        id: bron.id,
        title: bron.title,
        embedding: bron.embedding,
        priority,
      });
    }
    for (const hoofdstuk of (bron.chapters ?? []) as { title: string; embedding?: unknown }[]) {
      if (isEmbeddingVector(hoofdstuk.embedding)) {
        kandidaten.push({
          type: "knowledge-source-chapter",
          id: bron.id,
          title: bron.title,
          chapterTitle: hoofdstuk.title,
          embedding: hoofdstuk.embedding,
          priority,
        });
      }
    }
  }

  const drafts = await payload.find({
    collection: "knowledge-drafts",
    where: {
      and: [{ embeddingStatus: { equals: "indexed" } }, { status: { in: VEILIGE_DRAFT_STATUSSEN } }],
    },
    limit: MAX_KANDIDATEN_PER_COLLECTIE,
    overrideAccess: true,
    depth: 0,
  });
  for (const draft of drafts.docs) {
    if (isEmbeddingVector(draft.embedding)) {
      kandidaten.push({
        type: "knowledge-draft",
        id: draft.id,
        title: draft.title,
        embedding: draft.embedding,
      });
    }
  }

  const artikelen = await payload.find({
    collection: "articles",
    where: { embeddingStatus: { equals: "indexed" } },
    limit: MAX_KANDIDATEN_PER_COLLECTIE,
    overrideAccess: true,
    depth: 0,
  });
  for (const artikel of artikelen.docs) {
    if (isEmbeddingVector(artikel.embedding)) {
      kandidaten.push({
        type: "article",
        id: artikel.id,
        title: artikel.title,
        embedding: artikel.embedding,
      });
    }
  }

  return kandidaten;
}

interface GescoordeKandidaat extends Kandidaat {
  similarity: number;
}

/** Gedeelde eerste stap voor zowel searchKnowledge als searchKnowledgePhased: query embedden, alle kandidaten ophalen en scoren — de similarity-score zelf is in beide gevallen exact hetzelfde getal. */
async function scoorKandidaten(payload: Payload, query: string): Promise<GescoordeKandidaat[]> {
  const queryEmbedding = await generateEmbedding(query);
  const kandidaten = await verzamelKandidaten(payload);
  return kandidaten.map((k) => ({ ...k, similarity: cosineSimilarity(queryEmbedding, k.embedding) }));
}

function naarSearchHit(k: GescoordeKandidaat): SearchHit {
  return {
    type: k.type,
    id: k.id,
    title: k.title,
    chapterTitle: k.chapterTitle,
    similarity: k.similarity,
    reason: bouwReden(k.type, k.similarity, k.chapterTitle),
  };
}

export async function searchKnowledge(
  payload: Payload,
  opties: { query: string; limiet?: number }
): Promise<SearchHit[]> {
  const limiet = opties.limiet ?? STANDAARD_ZOEKLIMIET;
  const gescoord = await scoorKandidaten(payload, opties.query);

  const hits = gescoord.map(naarSearchHit);
  hits.sort((a, b) => b.similarity - a.similarity);
  return hits.slice(0, limiet);
}

// ---------------------------------------------------------------------------
// Gefaseerde zoekopdracht op Knowledge Source-prioriteit (AI-assistent)
// ---------------------------------------------------------------------------
//
// Uitsluitend gebruikt door lib/assistant/process-question.ts — de bestaande
// searchKnowledge() hierboven blijft ONGEWIJZIGD (zelfde signatuur, zelfde
// platte gedrag) voor zijn andere aanroeper, app/api/knowledge/search/route.ts
// (de Sprint 4 "Test semantisch zoeken"-tool in /admin/globals/knowledge-search
// — een neutraal diagnostisch hulpmiddel dat alle bronnen even zwaar moet
// blijven wegen, niet de assistent-specifieke prioriteitslogica hieronder).
//
// Fasering (uitsluitend over knowledge-sources/hun hoofdstukken — knowledge-
// drafts en articles hebben geen prioriteitstier en doen in ELKE fase gewoon
// mee, zodat ze nooit "per ongeluk verdwijnen"):
//   1. Fase "core": alleen priority=core toegelaten (+ drafts/articles).
//   2. Onvoldoende bruikbare core-resultaten? → fase "core+secondary".
//   3. Nog steeds onvoldoende? → fase "core+secondary+reference" (alles).
//
// "Onvoldoende bruikbare resultaten" = minder dan `limiet` kandidaten in de
// tot-nu-toe-toegelaten tier(s) met similarity >= drempelVoorVoldoende. Geen
// nieuwe/willekeurige grens: de aanroeper geeft hier expliciet dezelfde
// MIN_SIMILARITY_VOOR_ANTWOORD mee die lib/assistant/answer.ts al gebruikt
// om te bepalen of een treffer sterk genoeg is om als antwoordbron te
// dienen — dezelfde maatstaf voor "goed genoeg", nu ook voor "genoeg
// bruikbare resultaten om niet te hoeven uitbreiden". Zie process-question.ts
// voor de import; bewust GEEN import hier van lib/assistant/answer.ts (dat
// zou een circulaire import geven: answer.ts → build-context.ts →
// similarity-search.ts).

export type ZoekFase = "core" | "core+secondary" | "core+secondary+reference";

export interface AantalPerPrioriteit {
  core: number;
  secondary: number;
  reference: number;
}

export interface PhasedSearchResultaat {
  hits: SearchHit[];
  fase: ZoekFase;
  /** Totaal aantal kandidaten per tier (vóór filtering op limiet) — voor logging/inzicht. */
  aantalPerPrioriteit: AantalPerPrioriteit;
  /** Aantal kandidaten per tier dat de drempel haalt (similarity >= drempelVoorVoldoende) — bepaalt de fase-overgangen. */
  aantalVoldoendePerPrioriteit: AantalPerPrioriteit;
}

function isPrioriteit(k: GescoordeKandidaat, prioriteit: KnowledgeSourcePriority): boolean {
  return k.priority === prioriteit;
}

function isAltijdToegelaten(k: GescoordeKandidaat): boolean {
  return k.type === "knowledge-draft" || k.type === "article";
}

function telVoldoende(kandidaten: GescoordeKandidaat[], drempel: number): number {
  return kandidaten.filter((k) => k.similarity >= drempel).length;
}

/**
 * Sorteert eerst op afgeronde similarity-score (zelfde percentage-afronding
 * als bouwReden()/answer.ts's confidence — geen nieuwe granulariteit): bij
 * een GELIJK afgerond percentage ("vergelijkbare relevantie") beslist de
 * prioriteitstier, core vóór secondary vóór reference. Dit tie-break geldt
 * uitdrukkelijk alleen tussen twee kandidaten die BEIDE een prioriteitstier
 * hebben (knowledge-sources/hoofdstukken) — een knowledge-draft of article
 * wordt hierdoor nooit voor- of achteruitgeschoven, die blijven zuiver op
 * score gerangschikt. Als laatste, deterministische stap: de ruwe (niet
 * afgeronde) score, zodat de sortering nooit van aanroep tot aanroep wisselt.
 */
function vergelijkGefaseerd(a: GescoordeKandidaat, b: GescoordeKandidaat): number {
  const percentageVerschil = Math.round(b.similarity * 100) - Math.round(a.similarity * 100);
  if (percentageVerschil !== 0) return percentageVerschil;

  if (a.priority && b.priority && a.priority !== b.priority) {
    return PRIORITEIT_RANG[a.priority] - PRIORITEIT_RANG[b.priority];
  }

  return b.similarity - a.similarity;
}

export async function searchKnowledgePhased(
  payload: Payload,
  opties: { query: string; limiet?: number; drempelVoorVoldoende: number }
): Promise<PhasedSearchResultaat> {
  const limiet = opties.limiet ?? STANDAARD_ZOEKLIMIET;
  const gescoord = await scoorKandidaten(payload, opties.query);

  const core = gescoord.filter((k) => isPrioriteit(k, "core"));
  const secondary = gescoord.filter((k) => isPrioriteit(k, "secondary"));
  const reference = gescoord.filter((k) => isPrioriteit(k, "reference"));
  const altijd = gescoord.filter(isAltijdToegelaten);

  const aantalPerPrioriteit: AantalPerPrioriteit = {
    core: core.length,
    secondary: secondary.length,
    reference: reference.length,
  };
  const aantalVoldoendePerPrioriteit: AantalPerPrioriteit = {
    core: telVoldoende(core, opties.drempelVoorVoldoende),
    secondary: telVoldoende(secondary, opties.drempelVoorVoldoende),
    reference: telVoldoende(reference, opties.drempelVoorVoldoende),
  };

  let toegelaten: GescoordeKandidaat[];
  let fase: ZoekFase;
  if (aantalVoldoendePerPrioriteit.core >= limiet) {
    toegelaten = [...core, ...altijd];
    fase = "core";
  } else if (aantalVoldoendePerPrioriteit.core + aantalVoldoendePerPrioriteit.secondary >= limiet) {
    toegelaten = [...core, ...secondary, ...altijd];
    fase = "core+secondary";
  } else {
    toegelaten = [...core, ...secondary, ...reference, ...altijd];
    fase = "core+secondary+reference";
  }

  // Sorteren op de kandidaten zelf (niet de SearchHits) zodat vergelijkGefaseerd
  // bij de priority-tie-break kan — daarna pas omgezet naar SearchHit.
  toegelaten.sort(vergelijkGefaseerd);
  const hits = toegelaten.slice(0, limiet).map(naarSearchHit);

  return {
    hits,
    fase,
    aantalPerPrioriteit,
    aantalVoldoendePerPrioriteit,
  };
}
