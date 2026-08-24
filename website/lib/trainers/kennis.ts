import type { Payload } from "payload";
import { cosineSimilarity } from "ai";
import { generateEmbedding } from "@/services/ai-client";
import { haalHeadingsOp } from "@/lib/content/markdown-headings";
import { genereerTrainerKennisAntwoord, type TrainerKennisBron, type TrainerKennisAntwoordUitkomst } from "./kennis-antwoord";

// Vervolgronde (2026-08-22) — "Kennis" fase 1, primair lezen. Bewust GEEN
// import van monday-links.ts/verslag.ts/logboek.ts/telefonie/*: deze laag
// mag structureel nooit schoolcontext, trainingsverslagen, logboek,
// telefonie of Monday-CRM-data aanraken (opdrachtseis) — dit bestand raakt
// uitsluitend de trainer-kennisversies-collectie, altijd hard gefilterd op
// status "gepubliceerd" (overrideAccess:true, zelfde rechtenpatroon als de
// rest van de traineromgeving — trainers krijgen nooit rechtstreekse
// Payload-toegang tot deze collectie).
//
// Productiecontrole (2026-08-23) — beantwoordTrainerKennisVraag schrijft
// sindsdien ook een minimale, privacybewuste logregel naar
// trainer-kennisvragen (opdrachtseis §3): geen vraag-/antwoordtekst, alleen
// trainer/gevonden-of-niet/hoogste-score/gebruikte bronnen. Neemt bewust een
// kale trainerId (number) aan i.p.v. het AuthTrainer-type uit ./auth — dat
// zou een nieuwe module-import zijn die de architectuurtest (kennis-
// architecture.test.ts) niet toestaat, terwijl een primitief getal geen
// school-/verslag-/logboek-/telefoniecontext binnenhaalt.
//
// Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing"
// (opdrachtseis §7): haalGepubliceerdeKennisversies geeft nu ook de headings
// van elk document mee, zodat de Kennis-zoekfunctie (kennis-lijst-client.tsx)
// ook op hoofdstuktitel kan matchen en rechtstreeks naar dat hoofdstuk kan
// linken. lib/content/markdown-headings.ts is bewust toegevoegd aan de
// architectuurtest se allowlist voor dit bestand — een zuivere, framework-
// loze tekstparser zonder enige school-/verslag-/logboek-/telefoniecontext,
// dus geen inbreuk op de bestaande grens.

export interface TrainerKennisversieOverzicht {
  id: number;
  titel: string;
  samenvatting: string;
  /** Voor de zoekfunctie (opdrachtseis §7) — dezelfde headings/slugs als de lezer (lib/content/markdown-headings.ts), dus altijd geldige ankers. */
  headings: { text: string; slug: string }[];
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
    headings: haalHeadingsOp(doc.tekst).map((h) => ({ text: h.text, slug: h.slug })),
  }));
}

/** Alleen een gepubliceerde versie levert iets op — een concept (of een niet-bestaand ID) geeft null, nooit een fout. Zelfde "geen 403, gewoon niet gevonden"-patroon als elders in de traineromgeving. */
export async function haalGepubliceerdeKennisversie(payload: Payload, id: number): Promise<TrainerKennisversieDetail | null> {
  const doc = await payload.findByID({ collection: "trainer-kennisversies", id, overrideAccess: true, depth: 0 }).catch(() => null);
  if (!doc || doc.status !== "gepubliceerd") return null;
  return { id: doc.id, titel: doc.titel, tekst: doc.tekst, publishedAt: doc.publishedAt ?? null };
}

const MAX_BRONNEN = 4;

// Productiecontrole, vervolgronde (2026-08-23) — een trainerkennisversie
// wordt sindsdien per chunk geëmbed (lib/embeddings/chunked-embed.ts, fix
// voor de HTTP 400 bij lange, van de Kennisbasis afgeleide trainerkennis):
// embedding is dus number[][] (één vector per chunk), niet meer één vlakke
// vector. De trainer krijgt nog altijd de volledige, ongewijzigde tekst als
// bron/LLM-context (gpt-4o se contextvenster is ruim genoeg daarvoor, alleen
// het EMBEDDING-model heeft de striktere limiet).
function heeftGeldigeChunkEmbeddings(waarde: unknown): waarde is number[][] {
  return Array.isArray(waarde) && waarde.length > 0 && waarde.every((chunk) => Array.isArray(chunk) && chunk.length > 0);
}

// Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing":
// embeddingChunks (lib/embeddings/chunked-embed.ts) draagt per chunk de
// hoofdstuk-metadata, index-uitgelijnd met embedding. Ontbreekt dit (een
// trainerkennisversie van vóór deze functionaliteit, nog niet herindexeerd —
// zie lib/trainers/kennis-reindex.ts) of klopt de lengte niet, dan krijgt
// elke chunk gewoon heading:null: retrieval/antwoord functioneren dan exact
// zoals vóór deze functionaliteit, alleen zonder hoofdstuk-citatie.
interface RuweEmbeddingChunkMeta {
  heading: string | null;
  headingSlug: string | null;
}

function heeftGeldigeChunkMeta(waarde: unknown, verwachteLengte: number): waarde is RuweEmbeddingChunkMeta[] {
  return Array.isArray(waarde) && waarde.length === verwachteLengte;
}

interface ChunkKandidaat {
  docId: number;
  titel: string;
  tekst: string;
  similarity: number;
  heading: string | null;
  headingSlug: string | null;
}

function bouwChunkKandidaten(
  doc: { id: number; titel: string; tekst: string; embedding: number[][]; embeddingChunks?: unknown },
  queryEmbedding: number[]
): ChunkKandidaat[] {
  const chunkMeta = heeftGeldigeChunkMeta(doc.embeddingChunks, doc.embedding.length) ? doc.embeddingChunks : null;
  return doc.embedding.map((chunkEmbedding, i) => ({
    docId: doc.id,
    titel: doc.titel,
    tekst: doc.tekst,
    similarity: cosineSimilarity(queryEmbedding, chunkEmbedding),
    heading: chunkMeta?.[i]?.heading ?? null,
    headingSlug: chunkMeta?.[i]?.headingSlug ?? null,
  }));
}

async function zoekRelevanteKennis(payload: Payload, vraag: string): Promise<TrainerKennisBron[]> {
  const resultaat = await payload.find({
    collection: "trainer-kennisversies",
    where: { status: { equals: "gepubliceerd" } },
    overrideAccess: true,
    depth: 0,
    limit: MAX_KENNISVERSIES,
  });
  const metEmbedding = resultaat.docs.filter((doc): doc is typeof doc & { embedding: number[][] } => heeftGeldigeChunkEmbeddings(doc.embedding));
  if (metEmbedding.length === 0) return [];

  const queryEmbedding = await generateEmbedding(vraag);

  const alleKandidaten = metEmbedding
    .flatMap((doc) => bouwChunkKandidaten(doc, queryEmbedding))
    .sort((a, b) => b.similarity - a.similarity);

  // Per (document, hoofdstuk) hooguit één citatie — dankzij de sortering
  // hierboven wint steeds de best scorende chunk van elk uniek paar. Meerdere
  // chunks uit hetzelfde hoofdstuk -> één citatie (opdrachtseis §5); meerdere
  // ECHT verschillende hoofdstukken (ook binnen hetzelfde document) mogen
  // allebei als aparte bron verschijnen. Een chunk zonder heading (null) telt
  // als een eigen sleutel per document — gedraagt zich dus exact als vóór
  // deze functionaliteit (hooguit één citatie per document).
  const gezienSleutels = new Set<string>();
  const bronnen: TrainerKennisBron[] = [];
  for (const kandidaat of alleKandidaten) {
    const sleutel = `${kandidaat.docId}::${kandidaat.headingSlug ?? ""}`;
    if (gezienSleutels.has(sleutel)) continue;
    gezienSleutels.add(sleutel);
    bronnen.push({
      id: kandidaat.docId,
      titel: kandidaat.titel,
      tekst: kandidaat.tekst,
      similarity: kandidaat.similarity,
      heading: kandidaat.heading,
      headingSlug: kandidaat.headingSlug,
    });
    if (bronnen.length >= MAX_BRONNEN) break;
  }
  return bronnen;
}

/**
 * Best-effort vraaglog (opdrachtseis §3) — mag de trainer nooit hinderen:
 * een mislukte logregel wordt hier zelf al afgevangen, nooit doorgegooid.
 * Geen vraag-/antwoordtekst, uitsluitend trainer/gevonden-of-niet/hoogste-
 * score/gebruikte bronnen.
 */
async function loggeKennisVraag(
  payload: Payload,
  trainerId: number,
  bronnen: TrainerKennisBron[],
  uitkomst: TrainerKennisAntwoordUitkomst
): Promise<void> {
  const hoogsteSimilarity = bronnen[0]?.similarity ?? null;
  const gebruikteBronnen = uitkomst.type === "answered" ? uitkomst.bronnen.map((b) => b.id) : [];
  await payload.create({
    collection: "trainer-kennisvragen",
    overrideAccess: true,
    data: {
      trainer: trainerId,
      antwoordGevonden: uitkomst.type === "answered",
      hoogsteSimilarity,
      gebruikteBronnen,
    },
  });
}

/**
 * Losstaande route/retrievalflow (opdrachtseis, expliciet niet samengevoegd
 * met /api/trainers/vraag): importeert bewust niets uit monday-links.ts/
 * verslag.ts/logboek.ts/telefonie/* — uitsluitend gepubliceerde trainer-
 * kennisversies.
 */
export async function beantwoordTrainerKennisVraag(payload: Payload, trainerId: number, vraag: string): Promise<TrainerKennisAntwoordUitkomst> {
  const bronnen = await zoekRelevanteKennis(payload, vraag);
  const uitkomst = await genereerTrainerKennisAntwoord(vraag, bronnen);
  await loggeKennisVraag(payload, trainerId, bronnen, uitkomst).catch((error) => {
    console.error("[trainer-kennis] Vraaglog wegschrijven mislukt (antwoord gaat gewoon door):", error);
  });
  return uitkomst;
}
