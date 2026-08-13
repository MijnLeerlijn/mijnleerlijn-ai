import type { Payload, Where } from "payload";
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

export type SearchHitType =
  | "knowledge-source"
  | "knowledge-source-chapter"
  | "knowledge-draft"
  | "article"
  | "handleiding"
  | "handleiding-step";

export interface SearchHit {
  type: SearchHitType;
  id: number;
  title: string;
  chapterTitle?: string;
  /** Alleen gezet voor type "handleiding-step" — Payload's eigen, stabiele array-rij-id (NIET titel-matching, dat breekt bij een hernoemde stap). */
  stepId?: string;
  similarity: number;
  reason: string;
  /** Alleen gezet voor knowledge-source/knowledge-source-chapter — zie KnowledgeSourcePriority. */
  priority?: KnowledgeSourcePriority;
  /** Bronrol voor conflictresolutie tussen bronnen — zie bepaalBronrol() hieronder. */
  bronrol?: BronRol;
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
  handleiding: "deze handleiding",
  "handleiding-step": "deze stap",
};

function bouwReden(type: SearchHitType, similarity: number, chapterTitle?: string): string {
  const percentage = Math.round(similarity * 100);
  const kwalificatie =
    similarity >= 0.85 ? "zeer hoge" : similarity >= 0.7 ? "hoge" : similarity >= 0.5 ? "gemiddelde" : "lage";
  const subitemLabel = type === "handleiding-step" ? "stap" : "hoofdstuk";
  const doel = chapterTitle ? `${subitemLabel} "${chapterTitle}"` : TYPE_LABEL[type];
  return `${kwalificatie} semantische overlap (${percentage}%) met ${doel}.`;
}

// Sprint: fasering van Knowledge Sources op prioriteit (payload/collections/
// KnowledgeSources.ts, veld `priority`) — alleen knowledge-sources/hun
// hoofdstukken hebben een prioriteitstier; knowledge-drafts en articles
// hebben dat concept niet en blijven daarom in searchKnowledgePhased()
// hieronder ALTIJD meedoen, in elke fase (zie de uitleg daar).
export type KnowledgeSourcePriority = "core" | "secondary" | "reference";
const PRIORITEIT_RANG: Record<KnowledgeSourcePriority, number> = { core: 0, secondary: 1, reference: 2 };

// Bronrol ("purpose") — WAT voor soort bron dit is, los van `priority`
// (HOE belangrijk de bron is) en los van `type` (redactionele categorie/
// hoe de inhoud is opgehaald). Gebruikt als tie-break bij (bijna) gelijke
// similarity-scores, zie vergelijkGefaseerd() hieronder, én zichtbaar per
// bron in de prompt-context (lib/assistant/build-context.ts) zodat het
// taalmodel zelf de conflictregels uit de systeeminstructie kan toepassen —
// zie lib/assistant/answer.ts voor de volledige, uitgeschreven regels:
//   1. actuele release note voor gewijzigde functionaliteit;
//   2. gestructureerde handleidingstap (Handleidingbouwer) vóór een PDF-
//      handleiding voor schermnamen, knoppen en concrete stappen — bij
//      vergelijkbare relevantie wint de gestructureerde stap altijd, zie
//      het gesprek "Handleidingbouwer";
//   3. background-model voor visie, samenhang en mogelijke routes;
//   4. gevalideerde FAQ/supportkennis voor praktijkvragen;
//   5. onbevestigde knowledge drafts nooit als definitieve waarheid (al
//      structureel afgedwongen: alleen status "approved" bereikt retrieval
//      ooit, zie VEILIGE_DRAFT_STATUSSEN hierboven).
// Deze volgorde is INHOUDELIJK/contextafhankelijk ("voor gewijzigde
// functionaliteit", "voor concrete stappen") — geen vraag laat zich zonder
// een aparte classificatiestap indelen in "gaat dit over een wijziging?".
// De tie-break hieronder codeert daarom uitsluitend de VASTE component
// (release-note vóór handleidingstap vóór manual vóór background-model vóór
// faq vóór support) en alleen bij een (bijna) gelijke score — de
// inhoudelijke afweging ("is dit een stappenvraag of een visievraag") hoort
// bij het taalmodel, dat de volledige, contextafhankelijke regels in de
// systeeminstructie krijgt.
// BronRol/bepaalBronrol wonen sinds 2026-07-31 in ./bronrol.ts (los
// getrokken zodat lib/assistant/kennisbasis-context.ts dit kan gebruiken
// zonder afhankelijk te zijn van dit — in meerdere tests volledig gemockte —
// bestand). Hier alleen opnieuw geëxporteerd zodat bestaande imports (bv.
// build-context.ts se `BronRol`-type) ongewijzigd blijven werken.
export type { BronRol } from "./bronrol";
export { bepaalBronrol } from "./bronrol";
import type { BronRol } from "./bronrol";
import { bepaalBronrol } from "./bronrol";

const BRONROL_RANG: Record<BronRol, number> = {
  "release-note": 0,
  handleidingstap: 1,
  manual: 2,
  "background-model": 3,
  faq: 4,
  support: 5,
};

interface Kandidaat {
  type: SearchHitType;
  id: number;
  title: string;
  chapterTitle?: string;
  /** Alleen gezet voor type "handleiding-step" — zie SearchHit.stepId. */
  stepId?: string;
  embedding: number[];
  /** Alleen gezet voor knowledge-source/knowledge-source-chapter — hoofdstukken erven de prioriteit van hun bron. */
  priority?: KnowledgeSourcePriority;
  /** Bronrol — knowledge-drafts krijgen altijd "support", articles altijd "manual", zie verzamelKandidaten(). */
  bronrol: BronRol;
}

function isEmbeddingVector(waarde: unknown): waarde is number[] {
  return Array.isArray(waarde) && waarde.length > 0 && typeof waarde[0] === "number";
}

// Multi-brand variants (2026-07-30): leeg-of-matcht-variant-filter, zelfde
// patroon overal waar `variantContext` voorkomt — leeg/geen `variantContext`
// = centraal, voor alle varianten; gevuld = uitsluitend die variant(en).
// Alleen toegevoegd aan de drie collecties die dit veld al hadden
// (knowledge-sources/articles/handleidingen, zie hun collectie-config);
// knowledge-drafts heeft geen variantContext en blijft ongefilterd (interne
// QA-staging, geen directe klantblootstelling — zie het technisch ontwerp).
function variantWhereClause(variantId: string | undefined): Where[] {
  if (!variantId) return [];
  return [{ or: [{ variantContext: { equals: variantId } }, { variantContext: { exists: false } }] }];
}

async function verzamelKandidaten(payload: Payload, variantId?: string): Promise<Kandidaat[]> {
  const kandidaten: Kandidaat[] = [];

  const bronnen = await payload.find({
    collection: "knowledge-sources",
    where: { and: [{ embeddingStatus: { equals: "indexed" } }, ...variantWhereClause(variantId)] },
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
    const bronrol = bepaalBronrol(bron.type, bron.purpose as string | null | undefined);
    if (isEmbeddingVector(bron.embedding)) {
      kandidaten.push({
        type: "knowledge-source",
        id: bron.id,
        title: bron.title,
        embedding: bron.embedding,
        priority,
        bronrol,
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
          bronrol,
        });
      }
    }
  }

  const drafts = await payload.find({
    collection: "knowledge-drafts",
    // Creator V1: variantWhereClause hier alsnog toegepast — voorheen was
    // dit de enige geëmbedde collectie zonder variant-filter, dus elk
    // goedgekeurd concept lekte naar elke variant.
    where: {
      and: [{ embeddingStatus: { equals: "indexed" } }, { status: { in: VEILIGE_DRAFT_STATUSSEN } }, ...variantWhereClause(variantId)],
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
        // Altijd "support": knowledge-drafts komen voort uit (opgeschoonde)
        // supportthreads, zie lib/support/analyze.ts. Alleen status
        // "approved" bereikt hier — zie VEILIGE_DRAFT_STATUSSEN hierboven —
        // dus "onbevestigde knowledge drafts nooit als definitieve
        // waarheid" is al structureel afgedwongen vóórdat bronrol er
        // überhaupt toe doet.
        bronrol: "support",
      });
    }
  }

  const artikelen = await payload.find({
    collection: "articles",
    // Creator V1: aiKnowledgeStatus hier herchecken (niet alleen bij het
    // aanmaken van de embedding) — zodat "uitzetten" ook echt meteen
    // effectief is, zelfde patroon als de status-check bij Handleidingen
    // hieronder.
    where: {
      and: [{ embeddingStatus: { equals: "indexed" } }, { aiKnowledgeStatus: { equals: "actief" } }, ...variantWhereClause(variantId)],
    },
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
        // Een gepubliceerd artikel is al centraal geredigeerde, gepubliceerde
        // handleiding-achtige content (zie payload/collections/Articles.ts)
        // — dichtst bij "manual" van de vijf bronrollen.
        bronrol: "manual",
      });
    }
  }

  // Handleidingbouwer: alleen GEPUBLICEERDE handleidingen — dit is een harde,
  // deterministische filter (niet alleen een promptinstructie), zie het
  // gesprek "Handleidingbouwer": "conceptstappen mogen nooit in publieke
  // AI-antwoorden verschijnen" en "gearchiveerde handleidingen mogen niet
  // meer verschijnen". Een `verborgen`-stap wordt hier bewust overgeslagen
  // (niet al bij het embedden, zie embedHandleiding) — zo werkt verbergen
  // instant, zonder herembedden.
  const handleidingen = await payload.find({
    collection: "handleidingen",
    where: {
      and: [
        { status: { equals: "gepubliceerd" } },
        { embeddingStatus: { equals: "indexed" } },
        ...variantWhereClause(variantId),
      ],
    },
    limit: MAX_KANDIDATEN_PER_COLLECTIE,
    overrideAccess: true,
    depth: 0,
  });
  for (const handleiding of handleidingen.docs) {
    if (isEmbeddingVector(handleiding.embedding)) {
      kandidaten.push({
        type: "handleiding",
        id: handleiding.id,
        title: handleiding.titel,
        embedding: handleiding.embedding,
        bronrol: "handleidingstap",
      });
    }
    for (const stap of (handleiding.stappen ?? []) as {
      id?: string;
      titel: string;
      verborgen?: boolean | null;
      embedding?: unknown;
    }[]) {
      if (stap.verborgen) continue;
      if (!stap.id) continue;
      if (isEmbeddingVector(stap.embedding)) {
        kandidaten.push({
          type: "handleiding-step",
          id: handleiding.id,
          title: handleiding.titel,
          chapterTitle: stap.titel,
          stepId: stap.id,
          embedding: stap.embedding,
          bronrol: "handleidingstap",
        });
      }
    }
  }

  return kandidaten;
}

interface GescoordeKandidaat extends Kandidaat {
  similarity: number;
}

/** Gedeelde eerste stap voor zowel searchKnowledge als searchKnowledgePhased: query embedden, alle kandidaten ophalen en scoren — de similarity-score zelf is in beide gevallen exact hetzelfde getal. */
async function scoorKandidaten(payload: Payload, query: string, variantId?: string): Promise<GescoordeKandidaat[]> {
  const queryEmbedding = await generateEmbedding(query);
  const kandidaten = await verzamelKandidaten(payload, variantId);
  return kandidaten.map((k) => ({ ...k, similarity: cosineSimilarity(queryEmbedding, k.embedding) }));
}

function naarSearchHit(k: GescoordeKandidaat): SearchHit {
  return {
    type: k.type,
    id: k.id,
    title: k.title,
    chapterTitle: k.chapterTitle,
    stepId: k.stepId,
    similarity: k.similarity,
    reason: bouwReden(k.type, k.similarity, k.chapterTitle),
    priority: k.priority,
    bronrol: k.bronrol,
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

// Handleidingen/handleidingstappen hebben, net als knowledge-drafts/articles,
// geen prioriteitstier (die bestaat alleen voor Knowledge Sources) — zonder
// deze regel zouden ze door isPrioriteit() nooit in core/secondary/reference
// vallen en dus stilzwijgend NOOIT meedoen in searchKnowledgePhased().
function isAltijdToegelaten(k: GescoordeKandidaat): boolean {
  return (
    k.type === "knowledge-draft" ||
    k.type === "article" ||
    k.type === "handleiding" ||
    k.type === "handleiding-step"
  );
}

function telVoldoende(kandidaten: GescoordeKandidaat[], drempel: number): number {
  return kandidaten.filter((k) => k.similarity >= drempel).length;
}

/**
 * Sorteert eerst op afgeronde similarity-score (zelfde percentage-afronding
 * als bouwReden()/answer.ts's confidence — geen nieuwe granulariteit): bij
 * een GELIJK afgerond percentage ("vergelijkbare relevantie") beslist eerst
 * de prioriteitstier (core vóór secondary vóór reference), dán de bronrol
 * (release-note vóór manual vóór background-model vóór faq vóór support —
 * zie BRONROL_RANG hierboven). Dit zijn BEWUST alleen tie-breaks bij
 * (bijna) gelijke score, geen herweging van de score zelf: een sterk
 * relevantere bron met een "lagere" bronrol wint nog altijd gewoon van een
 * zwak relevante bron met een "hogere" bronrol. De prioriteitstier-tie-break
 * geldt uitdrukkelijk alleen tussen twee kandidaten die BEIDE een
 * prioriteitstier hebben (knowledge-sources/hoofdstukken) — een
 * knowledge-draft of article wordt hierdoor nooit voor- of
 * achteruitgeschoven op prioriteit. Als laatste, deterministische stap: de
 * ruwe (niet afgeronde) score, zodat de sortering nooit van aanroep tot
 * aanroep wisselt.
 */
function vergelijkGefaseerd(a: GescoordeKandidaat, b: GescoordeKandidaat): number {
  const percentageVerschil = Math.round(b.similarity * 100) - Math.round(a.similarity * 100);
  if (percentageVerschil !== 0) return percentageVerschil;

  if (a.priority && b.priority && a.priority !== b.priority) {
    return PRIORITEIT_RANG[a.priority] - PRIORITEIT_RANG[b.priority];
  }

  if (a.bronrol !== b.bronrol) {
    return BRONROL_RANG[a.bronrol] - BRONROL_RANG[b.bronrol];
  }

  return b.similarity - a.similarity;
}

export async function searchKnowledgePhased(
  payload: Payload,
  opties: { query: string; limiet?: number; drempelVoorVoldoende: number; variantId?: string }
): Promise<PhasedSearchResultaat> {
  const limiet = opties.limiet ?? STANDAARD_ZOEKLIMIET;
  const alleGescoord = await scoorKandidaten(payload, opties.query, opties.variantId);

  // Kennisbasis MijnLeerlijn — Fase 4 (2026-07-28): bronnen met bronrol
  // "background-model" (het oude achtergrondverhaal-record, knowledge-
  // sources purpose="background-model") worden hier uitgesloten — die rol
  // wordt nu volledig vervuld door de gegarandeerde centrale-kennisbasis-
  // Global (zie lib/assistant/kennisbasis-context.ts, altijd meegestuurd in
  // process-public-question.ts, ongeacht similarity-score). Zonder deze
  // uitsluiting zou dezelfde inhoud dubbel (en mogelijk inconsistent, als de
  // twee bronnen ooit uiteenlopen) in de prompt terechtkomen. Bewust NIET
  // toegepast op searchKnowledge() hierboven — dat blijft het neutrale
  // diagnostische hulpmiddel dat alle bronnen even zwaar weegt (zie het
  // commentaar daar).
  const gescoord = alleGescoord.filter((k) => k.bronrol !== "background-model");

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
