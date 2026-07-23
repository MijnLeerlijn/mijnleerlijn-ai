import type { Payload } from "payload";

// Zoekt vóór het aanmaken van een nieuw conceptkennisartikel naar
// vergelijkbare bestaande knowledge-drafts én gepubliceerde articles — zie
// de expliciete eis in de opdracht: "titel, vraag, categorie en keywords"
// gebruiken. Eenvoudige, deterministische trefwoordoverlap (zelfde soort
// aanpak als services/retrieval.ts) — bewust GEEN AI-oordeel hierover: de
// AI kent de bestaande catalogus niet en zou dit alleen kunnen gokken.

const STOPWOORDEN = new Set([
  "de",
  "het",
  "een",
  "ik",
  "hoe",
  "van",
  "aan",
  "in",
  "op",
  "voor",
  "met",
  "is",
  "wat",
  "kan",
  "je",
  "jij",
  "mijn",
  "en",
  "of",
  "bij",
  "zijn",
  "er",
  "dat",
  "die",
  "als",
]);

function keywoorden(tekst: string | undefined | null): string[] {
  if (!tekst) return [];
  return tekst
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((woord) => woord.length > 2 && !STOPWOORDEN.has(woord));
}

function overlapCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((woord) => setB.has(woord)).length;
}

/** Minimum aantal overeenkomende, betekenisvolle woorden om als "vergelijkbaar" te gelden. */
const MIN_OVERLAP = 2;

export interface DedupInvoer {
  title: string;
  question: string;
  category: string;
  keywords: string[];
}

function woordenVanInvoer(invoer: DedupInvoer): string[] {
  return [
    ...keywoorden(invoer.title),
    ...keywoorden(invoer.question),
    ...keywoorden(invoer.category),
    ...invoer.keywords.flatMap((k) => keywoorden(k)),
  ];
}

export interface GevondenDraft {
  id: number;
  title: string;
}

/** Zoekt de best passende bestaande knowledge-draft, of null als niets voldoende overeenkomt. */
export async function findSimilarDraft(payload: Payload, invoer: DedupInvoer): Promise<GevondenDraft | null> {
  const invoerWoorden = woordenVanInvoer(invoer);
  if (invoerWoorden.length === 0) return null;

  const bestaande = await payload.find({
    collection: "knowledge-drafts",
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  let beste: { doc: GevondenDraft; score: number } | null = null;
  for (const draft of bestaande.docs) {
    const draftWoorden = [
      ...keywoorden(draft.title),
      ...keywoorden(draft.question),
      ...keywoorden(draft.category),
      ...((draft.keywords ?? []) as string[]).flatMap((k) => keywoorden(k)),
    ];
    const score = overlapCount(invoerWoorden, draftWoorden);
    if (score >= MIN_OVERLAP && (!beste || score > beste.score)) {
      beste = { doc: { id: draft.id, title: draft.title }, score };
    }
  }
  return beste?.doc ?? null;
}

export interface GevondenArtikel {
  id: number;
  title: string;
  slug: string;
}

/** Zoekt een vergelijkbaar, al gepubliceerd artikel — puur ter waarschuwing bij het beoordelen, blokkeert nooit het aanmaken van een concept. */
export async function findSimilarArticle(
  payload: Payload,
  invoer: DedupInvoer
): Promise<GevondenArtikel | null> {
  const invoerWoorden = woordenVanInvoer(invoer);
  if (invoerWoorden.length === 0) return null;

  const gepubliceerd = await payload.find({
    collection: "articles",
    where: { articleStatus: { equals: "gepubliceerd" } },
    limit: 500,
    depth: 0,
    select: { title: true, slug: true, summary: true, tags: true },
    overrideAccess: true,
  });

  let beste: { doc: GevondenArtikel; score: number } | null = null;
  for (const artikel of gepubliceerd.docs) {
    const artikelWoorden = [
      ...keywoorden(artikel.title),
      ...keywoorden(artikel.summary as string | undefined),
      ...((artikel.tags ?? []) as string[]).flatMap((t) => keywoorden(t)),
    ];
    const score = overlapCount(invoerWoorden, artikelWoorden);
    if (score >= MIN_OVERLAP && (!beste || score > beste.score)) {
      beste = { doc: { id: artikel.id, title: artikel.title, slug: artikel.slug }, score };
    }
  }
  return beste?.doc ?? null;
}
