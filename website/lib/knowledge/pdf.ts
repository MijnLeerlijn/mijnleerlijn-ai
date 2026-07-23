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

const MAX_TITEL_LENGTE = 90;

export interface RuwHoofdstuk {
  title: string;
  text: string;
}

function isVermoedelijkeTitel(regel: string): boolean {
  const kandidaat = regel.trim();
  if (!kandidaat || kandidaat.length > MAX_TITEL_LENGTE) return false;
  return HOOFDSTUK_PATRONEN.some((patroon) => patroon.test(kandidaat));
}

/**
 * Splitst de per-pagina tekst in vermoedelijke hoofdstukken. Begint elke
 * pagina bij een regel die op een hoofdstuktitel lijkt; alles ervoor hoort
 * bij het lopende hoofdstuk. Zonder herkende titels: één hoofdstuk met de
 * documenttitel.
 */
export function detecteerHoofdstukken(paginas: PdfPagina[], documentTitel: string): RuwHoofdstuk[] {
  const hoofdstukken: RuwHoofdstuk[] = [];
  let huidig: RuwHoofdstuk | null = null;

  for (const pagina of paginas) {
    const regels = pagina.text.split("\n");
    for (const regel of regels) {
      if (isVermoedelijkeTitel(regel)) {
        huidig = { title: regel.trim().slice(0, MAX_TITEL_LENGTE), text: "" };
        hoofdstukken.push(huidig);
        continue;
      }
      if (!huidig) {
        huidig = { title: documentTitel, text: "" };
        hoofdstukken.push(huidig);
      }
      huidig.text += `${regel}\n`;
    }
  }

  return hoofdstukken.map((h) => ({ title: h.title, text: h.text.trim() })).filter((h) => h.text.length > 0);
}
