import { extractText, getDocumentProxy } from "unpdf";

// PDF-tekstextractie + hoofdstukherkenning. unpdf (pure JS, pdf.js-gebaseerd)
// is bewust gekozen boven bv. pdf-parse: geen native dependencies, werkt
// probleemloos in Vercel's Node-runtime — zie package.json.

export interface PdfPagina {
  pageNumber: number;
  text: string;
}

export interface PdfExtractieResultaat {
  totalPages: number;
  paginas: PdfPagina[];
  volledigeTekst: string;
}

// Werkaround voor een bekende bijwerking van drizzle-kit (gebruikt door
// Payload's dev-mode schema-push, zie payload.config.ts/docs/README.md "It
// looks like you've run Payload in dev mode"): drizzle-kit/api.js zet
// zelf `Array.prototype.random = ...` bij het laden. pdf.js weigert daarna
// te draaien ("Array.prototype contains unexpected enumerable property
// random") — een defensieve omgevingscontrole in pdf.js zelf, gevonden
// tijdens live-verificatie tegen de lokale database (2026-07-23). Niets in
// deze applicatie gebruikt Array.prototype.random, dus opruimen vóór elke
// PDF-extractie is veilig en voorkomt dat elke PDF-indexering na een
// dev-mode Payload-init hierop stukloopt.
function ruimDrizzleKitArrayPrototypePollutieOp(): void {
  if ("random" in Array.prototype) {
    delete (Array.prototype as unknown as Record<string, unknown>).random;
  }
}

export async function extractPdfText(bestand: ArrayBuffer): Promise<PdfExtractieResultaat> {
  ruimDrizzleKitArrayPrototypePollutieOp();
  const document = await getDocumentProxy(new Uint8Array(bestand));
  const { totalPages, text } = await extractText(document, { mergePages: false });
  const paginas = text.map((t, i) => ({ pageNumber: i + 1, text: t }));
  return { totalPages, paginas, volledigeTekst: text.join("\n\n") };
}

// Hoofdstukherkenning is een heuristiek, geen echte PDF-structuuranalyse
// (unpdf/pdf.js geeft geen outline/bookmark-informatie via extractText) —
// we zoeken naar regels die op een hoofdstuktitel lijken: "Hoofdstuk 3",
// "3. Titel", "3.2 Titel" of een korte losstaande regel die volledig met een
// hoofdletter begint, aan het begin van een pagina. Bewust conservatief:
// liever te weinig hoofdstukken herkennen (en dan één groot "hoofdstuk")
// dan willekeurige zinnen als titel aanzien.
const HOOFDSTUK_PATRONEN = [
  /^hoofdstuk\s+\d+[.:]?\s*(.*)$/i,
  /^(deel|paragraaf)\s+\d+[.:]?\s*(.*)$/i,
  /^\d{1,2}(\.\d{1,2})?\s+[A-ZÀ-Ý][\w\s,'-]{2,80}$/,
];

// Extra patronen, UITSLUITEND voor platte-tekstbronnen (lib/knowledge/
// index-source.ts's `content`-veld — interne achtergronddocumenten e.d.,
// geen PDF). Bewust NIET toegevoegd aan HOOFDSTUK_PATRONEN hierboven: veel
// echte handleiding-PDF's bevatten genummerde stappenlijsten ("1. Klik op
// de knop"), en de bredere "N. Titel"-vorm hieronder zou zo'n stap ten
// onrechte als nieuw hoofdstuk aanzien. Tekstbronnen als het
// achtergronddocument gebruiken juist geen PDF-achtige "Hoofdstuk N"/
// decimale nummering, maar ofwel markdown-koppen (#/##/###) of doorlopend
// genummerde secties ("1. Titel", "16. Titel") zonder stappenlijst-context
// — vandaar een apart, breder patroon, alleen ingezet via
// detecteerHoofdstukkenInTekst() hieronder.
const MARKDOWN_KOP_PATROON = /^#{1,3}\s+(.+)$/;
const GENUMMERDE_SECTIEKOP_PATROON = /^\d{1,2}\.\s+[A-ZÀ-Ý].{2,90}$/;
const HOOFDSTUK_PATRONEN_TEKST = [...HOOFDSTUK_PATRONEN, MARKDOWN_KOP_PATROON, GENUMMERDE_SECTIEKOP_PATROON];

const MAX_TITEL_LENGTE = 90;

export interface RuwHoofdstuk {
  title: string;
  text: string;
}

function isVermoedelijkeTitel(regel: string, patronen: RegExp[]): boolean {
  const kandidaat = regel.trim();
  if (!kandidaat || kandidaat.length > MAX_TITEL_LENGTE) return false;
  return patronen.some((patroon) => patroon.test(kandidaat));
}

/** Markdown-koptekens ('#'/'##'/'###') horen niet in de uiteindelijke titel. */
function opschonenTitel(regel: string): string {
  return regel.trim().replace(/^#{1,3}\s+/, "").slice(0, MAX_TITEL_LENGTE);
}

/**
 * Gedeelde kernlogica achter zowel detecteerHoofdstukken() (PDF, per pagina)
 * als detecteerHoofdstukkenInTekst() (platte tekst) hieronder: begint een
 * nieuw hoofdstuk bij elke regel die op een titel lijkt volgens `patronen`;
 * alles ervoor hoort bij het lopende hoofdstuk. Zonder herkende titels: één
 * hoofdstuk met de documenttitel. Pagina-/regelgrenzen zelf spelen geen rol
 * in de groepering — vandaar dat beide aanroepers hun invoer hier plat als
 * regel-array aanleveren.
 */
function hoofdstukkenUitRegels(regels: string[], documentTitel: string, patronen: RegExp[]): RuwHoofdstuk[] {
  const hoofdstukken: RuwHoofdstuk[] = [];
  let huidig: RuwHoofdstuk | null = null;

  for (const regel of regels) {
    if (isVermoedelijkeTitel(regel, patronen)) {
      huidig = { title: opschonenTitel(regel), text: "" };
      hoofdstukken.push(huidig);
      continue;
    }
    if (!huidig) {
      huidig = { title: documentTitel, text: "" };
      hoofdstukken.push(huidig);
    }
    huidig.text += `${regel}\n`;
  }

  return hoofdstukken.map((h) => ({ title: h.title, text: h.text.trim() })).filter((h) => h.text.length > 0);
}

/** Splitst PDF-pagina's in vermoedelijke hoofdstukken — zie hoofdstukkenUitRegels(). */
export function detecteerHoofdstukken(paginas: PdfPagina[], documentTitel: string): RuwHoofdstuk[] {
  const regels = paginas.flatMap((pagina) => pagina.text.split("\n"));
  return hoofdstukkenUitRegels(regels, documentTitel, HOOFDSTUK_PATRONEN);
}

/**
 * Zelfde hoofdstukherkenning als detecteerHoofdstukken(), maar voor platte
 * tekstbronnen (geen PDF) — met extra herkenning van markdown-koppen en
 * doorlopend genummerde secties, zie HOOFDSTUK_PATRONEN_TEKST hierboven.
 * lib/knowledge/index-source.ts gebruikt dit voor Knowledge Sources met
 * direct ingevulde `content` (bv. het interne achtergronddocument voor de
 * Helpdesk-AI), zodat zulke bronnen dezelfde chunk-per-sectie-kwaliteit
 * krijgen als PDF's, i.p.v. één documentbrede embedding.
 */
export function detecteerHoofdstukkenInTekst(tekst: string, documentTitel: string): RuwHoofdstuk[] {
  return hoofdstukkenUitRegels(tekst.split("\n"), documentTitel, HOOFDSTUK_PATRONEN_TEKST);
}
