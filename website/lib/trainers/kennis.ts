import type { Payload } from "payload";
import { cosineSimilarity } from "ai";
import { generateEmbedding } from "@/services/ai-client";
import { genereerTrainerKennisAntwoord, type TrainerKennisBron, type TrainerKennisAntwoordUitkomst } from "./kennis-antwoord";

// Vervolgronde (2026-08-22) — "Kennis" fase 1, uitsluitend lezen. Bewust
// GEEN import van monday-links.ts/verslag.ts/logboek.ts/telefonie/*: deze
// laag mag structureel nooit schoolcontext, trainingsverslagen, logboek,
// telefonie of Monday-CRM-data aanraken (opdrachtseis) — dit bestand raakt
// uitsluitend de trainer-kennisversies-collectie, altijd hard gefilterd op
// status "gepubliceerd" (overrideAccess:true, zelfde rechtenpatroon als de
// rest van de traineromgeving — trainers krijgen nooit rechtstreekse
// Payload-toegang tot deze collectie).

export interface TrainerKennisversieOverzicht {
  id: number;
  titel: string;
  samenvatting: string;
}

export interface TrainerKennisversieDetail {
  id: number;
  titel: string;
  tekst: string;
  publishedAt: string | null;
}

// "Houd het rustig en eenvoudig" (opdrachtseis) — geen paginering nodig op
// deze schaal; ruim genoeg voor de eerste fase van dit gloednieuwe
// contenttype.
const MAX_KENNISVERSIES = 200;
const SAMENVATTING_LENGTE = 160;

export async function haalGepubliceerdeKennisversies(payload: Payload): Promise<TrainerKennisversieOverzicht[]> {
  const resultaat = await payload.find({
    collection: "trainer-kennisversies",
    where: { status: { equals: "gepubliceerd" } },
    overrideAccess: true,
    depth: 0,
    sort: "titel",
    limit: MAX_KENNISVERSIES,
  });
  return resultaat.docs.map((doc) => ({
    id: doc.id,
    titel: doc.titel,
    samenvatting: doc.tekst.length > SAMENVATTING_LENGTE ? `${doc.tekst.slice(0, SAMENVATTING_LENGTE)}…` : doc.tekst,
  }));
}

/** Alleen een gepubliceerde versie levert iets op — een concept (of een niet-bestaand ID) geeft null, nooit een fout. Zelfde "geen 403, gewoon niet gevonden"-patroon als elders in de traineromgeving. */
export async function haalGepubliceerdeKennisversie(payload: Payload, id: number): Promise<TrainerKennisversieDetail | null> {
  const doc = await payload.findByID({ collection: "trainer-kennisversies", id, overrideAccess: true, depth: 0 }).catch(() => null);
  if (!doc || doc.status !== "gepubliceerd") return null;
  return { id: doc.id, titel: doc.titel, tekst: doc.tekst, publishedAt: doc.publishedAt ?? null };
}

const MAX_BRONNEN = 4;

async function zoekRelevanteKennis(payload: Payload, vraag: string): Promise<TrainerKennisBron[]> {
  const resultaat = await payload.find({
    collection: "trainer-kennisversies",
    where: { status: { equals: "gepubliceerd" } },
    overrideAccess: true,
    depth: 0,
    limit: MAX_KENNISVERSIES,
  });
  const metEmbedding = resultaat.docs.filter((doc): doc is typeof doc & { embedding: number[] } => Array.isArray(doc.embedding) && doc.embedding.length > 0);
  if (metEmbedding.length === 0) return [];

  const queryEmbedding = await generateEmbedding(vraag);
  return metEmbedding
    .map((doc) => ({ id: doc.id, titel: doc.titel, tekst: doc.tekst, similarity: cosineSimilarity(queryEmbedding, doc.embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_BRONNEN);
}

/**
 * Losstaande route/retrievalflow (opdrachtseis, expliciet niet samengevoegd
 * met /api/trainers/vraag): importeert bewust niets uit monday-links.ts/
 * verslag.ts/logboek.ts/telefonie/* — uitsluitend gepubliceerde trainer-
 * kennisversies.
 */
export async function beantwoordTrainerKennisVraag(payload: Payload, vraag: string): Promise<TrainerKennisAntwoordUitkomst> {
  const bronnen = await zoekRelevanteKennis(payload, vraag);
  return genereerTrainerKennisAntwoord(vraag, bronnen);
}
