import type { Article, Section, ContentBlock, ContentBlockType, VariantOverride } from "@/types/content";

export interface SamengesteldArticle {
  article: Article;
  secties: Array<{ sectie: Section; blokken: ContentBlock[] }>;
}

export interface TerminologyEntry {
  centralTerm: string;
  variantTerm: string;
}

// Vorm van `VariantOverride.payload` voor structurele acties (aanvullen,
// vervangen, invoegen_voor, invoegen_na op section/block-niveau): een
// blokachtig object zonder id/sectionId/order — die krijgt het samenvoegen
// zelf toegekend. Voor `ander_medium` is het payload i.p.v. hiervan
// `{ mediaId, caption? }`. Voor `vervangen` op article-niveau is het payload
// een gedeeltelijke veldvervanging (`{ title?, summary? }`).
type RawBlockPayload = { type: ContentBlockType; content: Record<string, unknown> };

let blokTeller = 0;
function nieuwBlokId(overrideId: string): string {
  blokTeller += 1;
  return `override:${overrideId}:${blokTeller}`;
}

function isRawBlockPayload(payload: unknown): payload is RawBlockPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    "content" in payload &&
    typeof (payload as { content: unknown }).content === "object"
  );
}

function bouwBlokUitPayload(
  payload: RawBlockPayload,
  sectionId: string,
  order: number,
  overrideId: string
): ContentBlock {
  return {
    id: nieuwBlokId(overrideId),
    sectionId,
    order,
    type: payload.type,
    content: payload.content,
  } as ContentBlock;
}

function overrideVoor(
  overrides: VariantOverride[],
  targetType: VariantOverride["targetType"],
  targetId: string
): VariantOverride | undefined {
  // De VariantOverrides-collectie dwingt af (beforeValidate-hook) dat er
  // hoogstens één gepubliceerde override per (variant, targetType, targetId)
  // bestaat — zie docs/DATA-MODEL.md §VariantOverride "Regel". `overrides`
  // hier bevat al alleen de gepubliceerde overrides voor één (article,
  // variant)-combinatie (zie services/payload.ts getVariantOverrides).
  return overrides.find((o) => o.targetType === targetType && o.targetId === targetId);
}

// --- Terminologiesubstitutie ---------------------------------------------

function ontsnapVoorRegex(tekst: string): string {
  return tekst.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function vervangTerminologie(tekst: string, woordenboek: TerminologyEntry[]): string {
  if (woordenboek.length === 0) return tekst;
  let resultaat = tekst;
  for (const { centralTerm, variantTerm } of woordenboek) {
    if (!centralTerm) continue;
    const patroon = new RegExp(`\\b${ontsnapVoorRegex(centralTerm)}\\b`, "gi");
    resultaat = resultaat.replace(patroon, variantTerm);
  }
  return resultaat;
}

// Woordelijke tekstvelden per bloktype — enige plek die weet welke velden
// "getoonde centrale tekst" zijn, zie docs/CONTENT-MODEL.md §Terminologieregels.
function vervangTerminologieInBlok(blok: ContentBlock, woordenboek: TerminologyEntry[]): ContentBlock {
  const content = blok.content as Record<string, unknown>;
  const vervang = (v: unknown) => (typeof v === "string" ? vervangTerminologie(v, woordenboek) : v);

  switch (blok.type) {
    case "tekst":
    case "waarschuwing":
    case "tip":
      return { ...blok, content: { ...content, body: vervang(content.body) } } as ContentBlock;
    case "genummerde_stap":
      return { ...blok, content: { ...content, body: vervang(content.body) } } as ContentBlock;
    case "afbeelding":
      return { ...blok, content: { ...content, caption: vervang(content.caption) } } as ContentBlock;
    case "video":
      return { ...blok, content: { ...content, caption: vervang(content.caption) } } as ContentBlock;
    case "download":
      return { ...blok, content: { ...content, label: vervang(content.label) } } as ContentBlock;
    case "contact_doorverwijzing":
      return {
        ...blok,
        content: {
          ...content,
          body: vervang(content.body),
          prefilledSubject: vervang(content.prefilledSubject),
        },
      } as ContentBlock;
    default:
      return blok;
  }
}

// --- Blokniveau -----------------------------------------------------------

function samenvoegBlokken(
  blokken: ContentBlock[],
  sectionId: string,
  overrides: VariantOverride[],
  woordenboek: TerminologyEntry[]
): ContentBlock[] {
  const resultaat: ContentBlock[] = [];

  for (const blok of blokken) {
    const override = overrideVoor(overrides, "block", blok.id);
    if (!override) {
      resultaat.push(vervangTerminologieInBlok(blok, woordenboek));
      continue;
    }

    const substitutie = override.termOverridesApplied ? woordenboek : [];

    switch (override.action) {
      case "onveranderd":
        resultaat.push(vervangTerminologieInBlok(blok, woordenboek));
        break;

      case "verbergen":
        // Blok valt volledig weg — pagina, zoekindex én AI-index.
        break;

      case "vervangen":
        if (isRawBlockPayload(override.payload)) {
          const nieuw = bouwBlokUitPayload(override.payload, sectionId, blok.order, override.id);
          resultaat.push(vervangTerminologieInBlok(nieuw, substitutie));
        } else {
          resultaat.push(vervangTerminologieInBlok(blok, woordenboek));
        }
        break;

      case "ander_medium":
        if (
          (blok.type === "afbeelding" || blok.type === "download") &&
          typeof override.payload === "object" &&
          override.payload !== null &&
          "mediaId" in override.payload
        ) {
          const media = override.payload as { mediaId: string; caption?: string };
          resultaat.push(
            vervangTerminologieInBlok(
              {
                ...blok,
                content: {
                  ...(blok.content as Record<string, unknown>),
                  mediaId: media.mediaId,
                  caption: media.caption ?? (blok.content as { caption?: string }).caption,
                },
              } as ContentBlock,
              woordenboek
            )
          );
        } else {
          resultaat.push(vervangTerminologieInBlok(blok, woordenboek));
        }
        break;

      case "aanvullen":
        resultaat.push(vervangTerminologieInBlok(blok, woordenboek));
        if (isRawBlockPayload(override.payload)) {
          const extra = bouwBlokUitPayload(override.payload, sectionId, blok.order, override.id);
          resultaat.push(vervangTerminologieInBlok(extra, substitutie));
        }
        break;

      case "invoegen_voor":
        if (isRawBlockPayload(override.payload)) {
          const nieuw = bouwBlokUitPayload(override.payload, sectionId, blok.order, override.id);
          resultaat.push(vervangTerminologieInBlok(nieuw, substitutie));
        }
        resultaat.push(vervangTerminologieInBlok(blok, woordenboek));
        break;

      case "invoegen_na":
        resultaat.push(vervangTerminologieInBlok(blok, woordenboek));
        if (isRawBlockPayload(override.payload)) {
          const nieuw = bouwBlokUitPayload(override.payload, sectionId, blok.order, override.id);
          resultaat.push(vervangTerminologieInBlok(nieuw, substitutie));
        }
        break;
    }
  }

  return resultaat.map((b, i) => ({ ...b, order: i + 1 }));
}

// --- Sectieniveau -----------------------------------------------------------

interface SectieMetBlokken {
  sectie: Section;
  blokken: ContentBlock[];
}

function bouwSectieUitPayload(
  payload: { title: string; blocks?: RawBlockPayload[] },
  articleId: string,
  order: number,
  overrideId: string
): SectieMetBlokken {
  const sectionId = `override:${overrideId}:sectie`;
  const blokken = (payload.blocks ?? []).map((b, i) => bouwBlokUitPayload(b, sectionId, i + 1, overrideId));
  return { sectie: { id: sectionId, articleId, order, title: payload.title }, blokken };
}

function samenvoegSecties(
  secties: SectieMetBlokken[],
  articleId: string,
  overrides: VariantOverride[],
  woordenboek: TerminologyEntry[]
): SectieMetBlokken[] {
  const resultaat: SectieMetBlokken[] = [];

  for (const { sectie, blokken } of secties) {
    const override = overrideVoor(overrides, "section", sectie.id);
    if (!override) {
      resultaat.push({ sectie, blokken: samenvoegBlokken(blokken, sectie.id, overrides, woordenboek) });
      continue;
    }

    const substitutie = override.termOverridesApplied ? woordenboek : [];

    switch (override.action) {
      case "onveranderd":
        resultaat.push({ sectie, blokken: samenvoegBlokken(blokken, sectie.id, overrides, woordenboek) });
        break;

      case "verbergen":
        // Sectie én alles eronder valt volledig weg (cascade) — zie
        // docs/CONTENT-MODEL.md §Uitsluitingsgedrag.
        break;

      case "vervangen": {
        const payload = override.payload as { title?: string; blocks?: RawBlockPayload[] } | undefined;
        const titel = payload?.title ?? sectie.title;
        const nieuweBlokken = payload?.blocks
          ? payload.blocks.map((b, i) => bouwBlokUitPayload(b, sectie.id, i + 1, override.id))
          : blokken;
        resultaat.push({
          sectie: { ...sectie, title: titel },
          blokken: nieuweBlokken.map((b) => vervangTerminologieInBlok(b, substitutie)),
        });
        break;
      }

      case "aanvullen": {
        const samengevoegd = samenvoegBlokken(blokken, sectie.id, overrides, woordenboek);
        const extra = isRawBlockPayload(override.payload)
          ? [
              vervangTerminologieInBlok(
                bouwBlokUitPayload(override.payload, sectie.id, blokken.length + 1, override.id),
                substitutie
              ),
            ]
          : [];
        resultaat.push({ sectie, blokken: [...samengevoegd, ...extra] });
        break;
      }

      case "invoegen_voor": {
        if (
          typeof override.payload === "object" &&
          override.payload !== null &&
          "title" in override.payload
        ) {
          resultaat.push(
            bouwSectieUitPayload(
              override.payload as { title: string; blocks?: RawBlockPayload[] },
              articleId,
              sectie.order,
              override.id
            )
          );
        }
        resultaat.push({ sectie, blokken: samenvoegBlokken(blokken, sectie.id, overrides, woordenboek) });
        break;
      }

      case "invoegen_na": {
        resultaat.push({ sectie, blokken: samenvoegBlokken(blokken, sectie.id, overrides, woordenboek) });
        if (
          typeof override.payload === "object" &&
          override.payload !== null &&
          "title" in override.payload
        ) {
          resultaat.push(
            bouwSectieUitPayload(
              override.payload as { title: string; blocks?: RawBlockPayload[] },
              articleId,
              sectie.order,
              override.id
            )
          );
        }
        break;
      }

      case "ander_medium":
        // Geen betekenis op sectieniveau (geen enkel medium om te vervangen)
        // — genegeerd, sectie ongewijzigd doorgegeven.
        resultaat.push({ sectie, blokken: samenvoegBlokken(blokken, sectie.id, overrides, woordenboek) });
        break;
    }
  }

  return resultaat.map((s, i) => ({ ...s, sectie: { ...s.sectie, order: i + 1 } }));
}

// --- Artikelniveau + entrypoint --------------------------------------------

/**
 * DE gedeelde samenvoegfunctie — zie docs/ARCHITECTURE.md §Eén gedeelde
 * samenvoegfunctie en docs/CONTENT-MODEL.md §Samenvoegalgoritme. Wordt
 * letterlijk hergebruikt door paginaweergave, zoekindex én AI-index (Fase 6),
 * met een verplichte pariteitstest (merge.test.ts) die dat afdwingt.
 *
 * Geeft `null` terug wanneer het artikel zelf voor deze variant volledig
 * verborgen is (`VariantOverride` met `targetType: "article"`,
 * `action: "verbergen"`) — de aanroeper behandelt dat als "niet gevonden"
 * voor deze variant (404 op de pagina, afwezig in zoek/AI-index).
 */
export function samenvoegContent(
  article: Article,
  secties: Array<{ sectie: Section; blokken: ContentBlock[] }>,
  overrides: VariantOverride[],
  terminologyDictionary: TerminologyEntry[] = []
): SamengesteldArticle | null {
  const articleOverride = overrideVoor(overrides, "article", article.id);

  if (articleOverride?.action === "verbergen") return null;

  let samengesteldArticle = article;
  if (
    articleOverride?.action === "vervangen" &&
    typeof articleOverride.payload === "object" &&
    articleOverride.payload !== null
  ) {
    const veldOverride = articleOverride.payload as Partial<Pick<Article, "title" | "summary">>;
    samengesteldArticle = { ...article, ...veldOverride };
  }

  const samengevoegdeSecties = samenvoegSecties(secties, article.id, overrides, terminologyDictionary);

  // article-niveau "aanvullen" voegt een extra sectie toe aan het einde
  // (bijv. een variant-specifieke afsluitende sectie) — zie
  // docs/CONTENT-MODEL.md §aanvullen, hier toegepast op artikelniveau.
  if (
    articleOverride?.action === "aanvullen" &&
    typeof articleOverride.payload === "object" &&
    articleOverride.payload !== null &&
    "title" in articleOverride.payload
  ) {
    const extraSectie = bouwSectieUitPayload(
      articleOverride.payload as { title: string; blocks?: RawBlockPayload[] },
      article.id,
      samengevoegdeSecties.length + 1,
      articleOverride.id
    );
    samengevoegdeSecties.push(extraSectie);
  }

  return { article: samengesteldArticle, secties: samengevoegdeSecties };
}
