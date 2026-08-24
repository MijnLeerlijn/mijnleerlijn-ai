// Nieuw (2026-08-24) — "Trainer Kennis: hoofdstuknavigatie + bronverwijzing
// naar juiste hoofdstuk". Pure, framework-onafhankelijke module: parseert
// Markdown-headings (#, ##, ###) uit trainerkennistekst en genereert
// stabiele, unieke anchor-slugs. Bewust een LOSSE module (geen React, geen
// Payload) — wordt op twee plekken hergebruikt die exact dezelfde slugs
// moeten produceren:
//  1. Server-side bij het embedden (lib/embeddings/chunk-text.ts) — elke
//     embedding-chunk krijgt de headingSlug van zijn hoofdstuk mee, en die
//     slug wordt later als citatie-anchor (/kennis/[id]#slug) opgeslagen.
//  2. Client-side bij het renderen (de Kennis-lezer) — dezelfde tekst wordt
//     daar opnieuw geparsed om `id`-attributen op de kop-elementen te zetten.
// Eén gedeelde parsefunctie is dus een hard vereiste: zou dit op twee losse
// plekken met net iets andere logica gebeuren, dan wijst een "Bekijk
// hoofdstuk"-link naar een anchor die niet bestaat.

export interface MarkdownHeading {
  level: number;
  text: string;
  slug: string;
}

export interface MarkdownSectie {
  /** null = tekst vóór de eerste heading (nette fallback, geen synthetische titel). */
  heading: MarkdownHeading | null;
  content: string;
}

// Herkent uitsluitend #, ## en ### (opdrachtseis §2) — een eventuele diepere
// #### in trainerkennis is (nog) geen citeerbaar hoofdstuk, blijft gewone tekst.
const HEADING_REGEL = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const CODEBLOK_MARKEUR = /^```/;

function ruweHeadingTekst(tekst: string): string {
  return tekst.replace(/[*_`]/g, "").trim();
}

/**
 * "6. Hoe is een curriculum opgebouwd?" -> "6-hoe-is-een-curriculum-opgebouwd".
 * Elke aaneengesloten reeks niet-alfanumerieke tekens (spaties, leestekens,
 * markdown-tekens) wordt precies één koppelteken — nooit een dubbel
 * koppelteken bij opeenvolgende leestekens (bv. "...?" aan het eind).
 */
export function slugifyHeading(tekst: string): string {
  return tekst
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Registreert `basisSlug` als unieke slug in `bestaandeSlugs` (muteert de
 * set — bewust: elke volgende aanroep moet de eerder vergeven slugs zien)
 * en geeft de daadwerkelijk te gebruiken slug terug — bij een botsing
 * "-2", "-3", enz. Een lege basisSlug (een heading die uitsluitend uit
 * leestekens bestond) krijgt de nette fallback "sectie".
 */
export function maakUniekeSlug(basisSlug: string, bestaandeSlugs: Set<string>): string {
  const basis = basisSlug || "sectie";
  let kandidaat = basis;
  let teller = 2;
  while (bestaandeSlugs.has(kandidaat)) {
    kandidaat = `${basis}-${teller}`;
    teller += 1;
  }
  bestaandeSlugs.add(kandidaat);
  return kandidaat;
}

interface GeparsedMarkdown {
  headings: MarkdownHeading[];
  secties: MarkdownSectie[];
}

/**
 * Eén enkele scanpas — de basis voor zowel haalHeadingsOp als
 * parseerMarkdownSecties, zodat beide GEGARANDEERD dezelfde slugs opleveren
 * voor hetzelfde document (zie moduletoelichting hierboven).
 */
function parseGeheel(markdown: string): GeparsedMarkdown {
  const regels = markdown.split("\n");
  const headings: MarkdownHeading[] = [];
  const secties: MarkdownSectie[] = [];
  const gebruikteSlugs = new Set<string>();

  let huidigeHeading: MarkdownHeading | null = null;
  let buffer: string[] = [];
  let inCodeBlok = false;

  function sluitSectieAf(): void {
    const content = buffer.join("\n").trim();
    // Een lege preambule (geen tekst vóór de eerste heading) levert geen
    // kunstmatige sectie op — wel altijd een sectie zodra er een heading is,
    // ook met lege content (bv. een kop direct gevolgd door een subkop).
    if (huidigeHeading !== null || content.length > 0) {
      secties.push({ heading: huidigeHeading, content });
    }
    buffer = [];
  }

  for (const regel of regels) {
    if (CODEBLOK_MARKEUR.test(regel.trim())) {
      inCodeBlok = !inCodeBlok;
      buffer.push(regel);
      continue;
    }
    const match = inCodeBlok ? null : regel.match(HEADING_REGEL);
    if (match) {
      sluitSectieAf();
      const level = match[1]!.length;
      const tekst = ruweHeadingTekst(match[2]!);
      const slug = maakUniekeSlug(slugifyHeading(tekst), gebruikteSlugs);
      huidigeHeading = { level, text: tekst, slug };
      headings.push(huidigeHeading);
    } else {
      buffer.push(regel);
    }
  }
  sluitSectieAf();

  return { headings, secties };
}

/** Alle headings in documentvolgorde, met stabiele unieke slugs — voor de TOC/lezer. */
export function haalHeadingsOp(markdown: string): MarkdownHeading[] {
  return parseGeheel(markdown).headings;
}

/**
 * Splitst `markdown` in secties per heading — elke heading start, ongeacht
 * niveau, een nieuwe citeerbare sectie (een ### valt dus niet "binnen" de
 * laatst gevonden ##, maar is zelf een aparte sectie). Tekst vóór de eerste
 * heading krijgt een nette fallback: een sectie met heading:null, in plaats
 * van weggegooid te worden of het parsen te laten crashen.
 */
export function parseerMarkdownSecties(markdown: string): MarkdownSectie[] {
  return parseGeheel(markdown).secties;
}
