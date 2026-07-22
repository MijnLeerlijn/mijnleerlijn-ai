import { populaireVragen, nietGevondenVoorbeeld } from "@/lib/data/popular-questions";
import { alleArtikelen } from "@/lib/data";
import type { Bron } from "@/lib/data/sources";

// Lokale, trefwoord-gebaseerde zoeksimulatie — géén echte zoekmachine en géén
// taalmodel. Matcht vrije tekst tegen de 8 redactioneel geschreven populaire
// vragen (eerst) en anders tegen artikeltitels, met eenvoudige
// woord-overlapscore. Zie IMPLEMENTATION-PLAN.md Fase 3 §Zoekervaring.

export type ZoekResultaat =
  | { type: "antwoord"; vraag: string; antwoord: string; bronnen: Bron[]; suggesties?: string[] }
  | { type: "geen-antwoord"; vraag: string; gerelateerd: string[] }
  | { type: "fout"; vraag: string };

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

function normaliseer(tekst: string): string {
  return tekst
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

function keywoorden(tekst: string): string[] {
  return normaliseer(tekst)
    .split(/\s+/)
    .filter((woord) => woord.length > 2 && !STOPWOORDEN.has(woord));
}

function overlapScore(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((woord) => setB.has(woord)).length;
}

/**
 * Alleen voor demonstratie/QA van de technische-foutstaat — een echte
 * zoekmachine zou dit intern afhandelen. Nooit bereikbaar via een gewone
 * vraag, alleen via het expliciete `forceerFout`-argument (zie /zoeken).
 */
export function simuleerZoekopdracht(query: string, opties?: { forceerFout?: boolean }): ZoekResultaat {
  const vraag = query.trim();

  if (opties?.forceerFout) {
    return { type: "fout", vraag };
  }

  const queryWoorden = keywoorden(vraag);
  if (queryWoorden.length === 0) {
    return { type: "geen-antwoord", vraag, gerelateerd: nietGevondenVoorbeeld.gerelateerd };
  }

  const gescoordeVragen = populaireVragen
    .map((v) => ({ v, score: overlapScore(queryWoorden, keywoorden(v.vraag)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = gescoordeVragen[0];
  if (top) {
    const gedeeldTop = gescoordeVragen.filter((r) => r.score === top.score);
    const suggesties =
      top.v.suggesties ?? (gedeeldTop.length > 1 ? gedeeldTop.slice(1, 3).map((r) => r.v.vraag) : undefined);

    return {
      type: "antwoord",
      vraag,
      antwoord: top.v.antwoord,
      bronnen: top.v.bronnen,
      suggesties,
    };
  }

  const gescoordeArtikelen = alleArtikelen
    .map((a) => ({ a, score: overlapScore(queryWoorden, keywoorden(a.title)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const besteMatch = gescoordeArtikelen[0];
  if (!besteMatch) {
    return { type: "geen-antwoord", vraag, gerelateerd: nietGevondenVoorbeeld.gerelateerd };
  }

  const beste = besteMatch.a;
  const eersteSectie = beste.sections[0];
  return {
    type: "antwoord",
    vraag,
    antwoord: `Mogelijk bedoel je "${beste.title}". Bekijk het artikel voor de volledige uitleg.`,
    bronnen: [
      {
        titel: beste.title,
        sectie: eersteSectie?.title ?? beste.title,
        datum: beste.lastContentUpdate,
        artikelSlug: beste.slug,
      },
    ],
  };
}
