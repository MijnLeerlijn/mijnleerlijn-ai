// Kennisbasis MijnLeerlijn — Fase 3 (2026-07-28): mechanische, verliesvrije
// omzetting tussen de brontekst van het achtergrondverhaal
// (payload/import-kennisbasis/data/kennisbasis-mijnleerlijn.txt — regels met
// `**Kop**`/`*Subkop*` voor koppen en `- item` voor lijsten) en Lexical
// richText, in beide richtingen. Bewust regel-voor-regel, geen
// alinea-herkenning/-herschrijving: dat zou "verzinnen"/"herschrijven" zijn,
// wat expliciet niet mag. Zie payload/seed/migrate-kennisbasis-global.ts
// (gebruikt tekstNaarRichText + normaliseerVoorVergelijking voor de
// round-trip-controle) en lib/assistant/kennisbasis-context.ts (gebruikt
// richTextNaarGestructureerdeTekst om de prompt-context op te bouwen, mét
// behoud van kop-/lijststructuur — zie docs/AI-KNOWLEDGE-STRATEGY.md).

interface TekstNode {
  type: "text";
  detail: 0;
  format: 0;
  mode: "normal";
  style: "";
  text: string;
  version: 1;
}

interface ParagraafNode {
  type: "paragraph";
  children: TekstNode[];
  direction: "ltr";
  format: "";
  indent: 0;
  textFormat: 0;
  version: 1;
}

interface KoptekstNode {
  type: "heading";
  children: TekstNode[];
  direction: "ltr";
  format: "";
  indent: 0;
  textFormat: 0;
  tag: "h2" | "h3";
  version: 1;
}

interface LijstItemNode {
  type: "listitem";
  children: TekstNode[];
  checked: false;
  direction: "ltr";
  format: "";
  indent: 0;
  value: number;
  version: 1;
}

interface LijstNode {
  type: "list";
  children: LijstItemNode[];
  direction: "ltr";
  format: "";
  indent: 0;
  listType: "bullet";
  start: 1;
  tag: "ul";
  version: 1;
}

type BlokNode = ParagraafNode | KoptekstNode | LijstNode;

export interface KennisbasisRichText {
  root: {
    type: "root";
    children: BlokNode[];
    direction: "ltr";
    format: "";
    indent: 0;
    version: 1;
  };
}

function tekstNode(text: string): TekstNode {
  return { type: "text", detail: 0, format: 0, mode: "normal", style: "", text, version: 1 };
}

function paragraafNode(text: string): ParagraafNode {
  return {
    type: "paragraph",
    children: [tekstNode(text)],
    direction: "ltr",
    format: "",
    indent: 0,
    textFormat: 0,
    version: 1,
  };
}

function koptekstNode(text: string, tag: "h2" | "h3"): KoptekstNode {
  return {
    type: "heading",
    children: [tekstNode(text)],
    direction: "ltr",
    format: "",
    indent: 0,
    textFormat: 0,
    tag,
    version: 1,
  };
}

function lijstItemNode(text: string, value: number): LijstItemNode {
  return {
    type: "listitem",
    children: [tekstNode(text)],
    checked: false,
    direction: "ltr",
    format: "",
    indent: 0,
    value,
    version: 1,
  };
}

function lijstNode(items: string[]): LijstNode {
  return {
    type: "list",
    children: items.map((item, i) => lijstItemNode(item, i + 1)),
    direction: "ltr",
    format: "",
    indent: 0,
    listType: "bullet",
    start: 1,
    tag: "ul",
    version: 1,
  };
}

const DUBBELE_KOP = /^\*\*(.+)\*\*$/;
const ENKELE_KOP = /^\*(.+)\*$/;
const LIJST_ITEM = /^-\s+(.*)$/;

/**
 * Zet brontekst (zoals payload/import-kennisbasis/data/kennisbasis-mijnleerlijn.txt)
 * mechanisch om naar Lexical richText. Regel-voor-regel: een `**Kop**`-regel
 * wordt een h2, een `*Subkop*`-regel een h3, opeenvolgende `- item`-regels
 * worden gebundeld tot één lijst, elke andere niet-lege regel wordt een eigen
 * paragraaf (verbatim, geen samenvoeging/herformulering).
 */
export function tekstNaarRichText(tekst: string): KennisbasisRichText {
  const regels = tekst.split("\n");
  const nodes: BlokNode[] = [];
  let lijstBuffer: string[] = [];

  const flushLijst = () => {
    if (lijstBuffer.length > 0) {
      nodes.push(lijstNode(lijstBuffer));
      lijstBuffer = [];
    }
  };

  for (const regel of regels) {
    const schoon = regel.trim();
    if (!schoon) {
      flushLijst();
      continue;
    }

    const lijstMatch = LIJST_ITEM.exec(schoon);
    if (lijstMatch) {
      lijstBuffer.push(lijstMatch[1]!.trim());
      continue;
    }
    flushLijst();

    const dubbeleKopMatch = DUBBELE_KOP.exec(schoon);
    if (dubbeleKopMatch) {
      nodes.push(koptekstNode(dubbeleKopMatch[1]!.trim(), "h2"));
      continue;
    }
    const enkeleKopMatch = ENKELE_KOP.exec(schoon);
    if (enkeleKopMatch) {
      nodes.push(koptekstNode(enkeleKopMatch[1]!.trim(), "h3"));
      continue;
    }

    nodes.push(paragraafNode(schoon));
  }
  flushLijst();

  return { root: { type: "root", children: nodes, direction: "ltr", format: "", indent: 0, version: 1 } };
}

function inlineTekst(children: unknown[] | undefined): string {
  if (!children) return "";
  return children
    .map((kind) => {
      const node = kind as { type?: string; text?: string };
      return node.type === "text" ? (node.text ?? "") : "";
    })
    .join("");
}

function blokNaarGestructureerdeTekst(node: unknown): string {
  const blok = node as { type?: string; children?: unknown[]; tag?: string };
  if (blok.type === "heading") {
    const prefix = blok.tag === "h2" ? "## " : "### ";
    return prefix + inlineTekst(blok.children);
  }
  if (blok.type === "paragraph") {
    return inlineTekst(blok.children);
  }
  if (blok.type === "list") {
    return (blok.children ?? [])
      .map((item) => `- ${inlineTekst((item as { children?: unknown[] }).children)}`)
      .join("\n");
  }
  return "";
}

/**
 * Zet Lexical richText om naar platte tekst mét behoud van kop-/
 * lijststructuur ("## kop", "- item") — in tegenstelling tot de bestaande,
 * volledig platslaande richTextNaarPlatteTekst() in embeddable-text.ts.
 * Gebruikt door zowel de round-trip-controle in het migratiescript als
 * (Fase 4) de promptopbouw, zodat de AI de opbouw van het document
 * (hoofdstukken, opsommingen) blijft herkennen.
 */
export function richTextNaarGestructureerdeTekst(richText: unknown): string {
  if (!richText || typeof richText !== "object") return "";
  const root = (richText as { root?: { children?: unknown[] } }).root;
  if (!root?.children) return "";
  return root.children
    .map(blokNaarGestructureerdeTekst)
    .filter((tekst) => tekst.trim().length > 0)
    .join("\n\n");
}

/**
 * Normaliseert zowel de brontekst als de teruggeconverteerde gestructureerde
 * tekst naar een kale, regel-voor-regel vergelijkbare vorm (kop-/
 * lijstmarkeringen en witruimte verwijderd) — zodat de round-trip-controle in
 * het migratiescript inhoudelijke gelijkheid kan vaststellen ongeacht welke
 * opmaakstijl (`**`/`##`) gebruikt is.
 */
export function normaliseerVoorVergelijking(tekst: string): string {
  return tekst
    .split("\n")
    .map((regel) => regel.trim())
    .filter((regel) => regel.length > 0)
    .map((regel) =>
      regel
        .replace(DUBBELE_KOP, "$1")
        .replace(ENKELE_KOP, "$1")
        .replace(/^#{2,3}\s+/, "")
        .replace(/^-\s+/, "")
        .trim()
    )
    .join("\n");
}
