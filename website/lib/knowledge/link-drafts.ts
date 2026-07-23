import type { Payload } from "payload";

// Koppelt een geïndexeerde kennisbron DETERMINISTISCH aan bestaande
// conceptkennisartikelen op trefwoordoverlap — zelfde aanpak en motivatie
// als lib/support/dedup.ts ("de AI kent de bestaande catalogus niet, dit zou
// alleen maar gokken zijn"). Stopwoordenlijst/tokenizer bewust gedupliceerd
// i.p.v. geïmporteerd, voor dezelfde reden als daar: module-onafhankelijkheid.

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

/** Minimum aantal overeenkomende, betekenisvolle woorden om als "gerelateerd" te gelden. */
const MIN_OVERLAP = 2;

export interface LinkInvoer {
  title: string;
  category: string;
  keywords: string[];
}

/** Zoekt alle bestaande knowledge-drafts die voldoende trefwoordoverlap hebben met de bron — kan er meerdere zijn (één bron kan meerdere concepten onderbouwen). */
export async function findRelatedDraftIds(payload: Payload, invoer: LinkInvoer): Promise<number[]> {
  const invoerWoorden = [
    ...keywoorden(invoer.title),
    ...keywoorden(invoer.category),
    ...invoer.keywords.flatMap((k) => keywoorden(k)),
  ];
  if (invoerWoorden.length === 0) return [];

  const bestaande = await payload.find({
    collection: "knowledge-drafts",
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  const gevonden: number[] = [];
  for (const draft of bestaande.docs) {
    const draftWoorden = [
      ...keywoorden(draft.title),
      ...keywoorden(draft.category),
      ...((draft.keywords ?? []) as string[]).flatMap((k) => keywoorden(k)),
    ];
    if (overlapCount(invoerWoorden, draftWoorden) >= MIN_OVERLAP) {
      gevonden.push(draft.id);
    }
  }
  return gevonden;
}
