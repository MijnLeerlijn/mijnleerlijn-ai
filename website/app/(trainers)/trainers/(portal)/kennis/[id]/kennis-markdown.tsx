"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import type { Root, Element } from "hast";
import type { MarkdownHeading } from "@/lib/content/markdown-headings";

// Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing naar
// juiste hoofdstuk" (opdrachtseis §3): trainerkennistekst werd voorheen kaal
// als whitespace-pre-line getoond — letterlijke "##"/"**" waren zichtbaar.
// Zelfde veilige opzet als components/molecules/MarkdownAnswer.tsx
// (allowlist, geen rehype-raw/dangerouslySetInnerHTML, uitsluitend
// CommonMark — geen nieuwe dependency, react-markdown was al aanwezig), maar
// hier met ECHTE kopniveaus + stabiele id's (i.p.v. alles naar één
// h3-stijl te verplatten) zodat de inhoudsopgave (kennis-reader.tsx)
// rechtstreeks naar een hoofdstuk kan linken.
//
// #, ##, ### in de brontekst -> h2/h3/h4 in de pagina (de paginatitel zelf
// is de enige h1, zie kennis-reader.tsx) — h4+ ontbreekt bewust uit
// allowedElements: lib/content/markdown-headings.ts herkent uitsluitend 1-3
// hekjes als heading, dus een toevallige #### moet ook hier NOOIT als losse
// heading verschijnen (anders zou de volgorde waarin headings hier worden
// geconsumeerd niet meer overeenkomen met `headings`).
const ALLOWED_ELEMENTS: string[] = ["h1", "h2", "h3", "p", "strong", "em", "ul", "ol", "li", "a", "br"];

// Permanent aanwezig (nooit alleen via JS toegevoegd) zodat de transitie zelf
// al vanaf de eerste render klaarstaat — het kortstondig markeren bij een
// deep link (kennis-reader.tsx, opdrachtseis §6) schakelt alleen de
// achtergrondkleur om; prefers-reduced-motion (globals.css) verkort deze
// transition-duration automatisch, geen aparte media query hier nodig.
const HEADING_BASE_CLASSES = "scroll-mt-20 rounded-md transition-colors duration-700";

const HEADING_TAGS = new Set(["h1", "h2", "h3"]);

/**
 * Zet `id="<slug>"` op elk h1/h2/h3-element, in documentvolgorde overeenkomend
 * met `headings` (dezelfde lijst/volgorde als lib/content/markdown-headings.ts
 * se haalHeadingsOp — zie de moduletoelichting daar). Bewust een REHYPE-
 * plugin (een gewone, synchrone boomtransformatie vóór React-rendering) i.p.v.
 * een teller die tijdens het renderen van de components hieronder meeloopt:
 * dat laatste muteert een lokale variabele buiten Reacts eigen renderfase
 * (react-markdown roept de component-functies pas aan wanneer REACT de
 * <ReactMarkdown>-boom reconciliet, niet synchroon in de render van dít
 * component) — onveilig voor de React Compiler ("Cannot reassign variable
 * after render completes"). Een rehype-plugin draait vóór React er ook maar
 * aan te pas komt, dus een lokale teller ís hier gewoon een normale, zuivere
 * functie zonder React-implicaties.
 */
function rehypeVoegHeadingIdsToe(headings: MarkdownHeading[]) {
  return (tree: Root) => {
    let volgendeIndex = 0;
    function bezoek(node: Root | Element): void {
      if (node.type === "element" && HEADING_TAGS.has(node.tagName)) {
        const heading = headings[volgendeIndex];
        volgendeIndex += 1;
        if (heading) {
          node.properties = { ...node.properties, id: heading.slug };
        }
      }
      for (const child of node.children ?? []) {
        if (child.type === "element") bezoek(child);
      }
    }
    bezoek(tree);
  };
}

const COMPONENTS: Components = {
  h1: ({ id, children }) => (
    <h2 id={id} className={`${HEADING_BASE_CLASSES} mt-8 mb-3 font-display text-h2 font-bold text-donkerblauw first:mt-0`}>
      {children}
    </h2>
  ),
  h2: ({ id, children }) => (
    <h3 id={id} className={`${HEADING_BASE_CLASSES} mt-6 mb-2 font-display text-h3 font-bold text-donkerblauw first:mt-0`}>
      {children}
    </h3>
  ),
  h3: ({ id, children }) => (
    <h4 id={id} className={`${HEADING_BASE_CLASSES} mt-5 mb-2 text-base font-semibold text-grijs-900 first:mt-0`}>
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="mb-3 text-body-md leading-7 text-grijs-800 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-grijs-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1 text-body-md text-grijs-800 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1 text-body-md text-grijs-800 last:mb-0">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline hover:no-underline">
      {children}
    </a>
  ),
};

export interface KennisMarkdownProps {
  tekst: string;
  /** Vooraf berekend met haalHeadingsOp(tekst) — ZELFDE lijst als de inhoudsopgave, zodat id's altijd matchen. */
  headings: MarkdownHeading[];
}

export function KennisMarkdown({ tekst, headings }: KennisMarkdownProps) {
  return (
    <div>
      <ReactMarkdown allowedElements={ALLOWED_ELEMENTS} unwrapDisallowed rehypePlugins={[[rehypeVoegHeadingIdsToe, headings]]} components={COMPONENTS}>
        {tekst}
      </ReactMarkdown>
    </div>
  );
}
