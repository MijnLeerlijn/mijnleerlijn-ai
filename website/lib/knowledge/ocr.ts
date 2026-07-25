import { generateTextFromPdf } from "@/services/ai-client";
import type { PdfPagina } from "./pdf";

// OCR-fallback voor PDF's zonder (bruikbare) tekstlaag — bv. Canva-exports
// die uit afbeeldingen bestaan. Bewust een apart bestand van pdf.ts: pdf.ts
// blijft pure PDF-tekstextractie zonder AI-afhankelijkheid; dit bestand voegt
// de AI-vision-stap toe. Wordt uitsluitend aangeroepen vanuit
// index-source.ts, en alleen wanneer normale extractie te weinig tekst
// oplevert.
//
// GEEN eigen paginarasterisatie meer (eerdere opzet: unpdf's
// renderPageAsImage + @napi-rs/canvas, één AI-aanroep per pagina). Op Vercel
// bleek dat native binary onbetrouwbaar te laden ("@napi-rs/canvas is not
// available in this environment") — napi-rs-packages resolven hun
// platformspecifieke .node-binding via een pas-tijdens-uitvoering berekende
// require(), wat Vercels build-time file-tracing kan missen; dat is buiten
// een echte Vercel-deploy niet volledig te verifiëren, en het risico keert
// per toekomstige dependency-bump terug. In plaats daarvan gaat het HELE
// PDF-bestand in één keer naar het taalmodel (services/ai-client.ts,
// generateTextFromPdf — mediaType "application/pdf", officieel ondersteund
// door de gebruikte OpenAI-provider). Geen native dependency, geen
// rasterisatiestap, dus geen Vercel-bundlingrisico — en ook geen aparte
// aanroep per pagina meer (sneller, goedkoper).

function logRuntimeDiagnose(): void {
  // Veilig (geen geheimen/PII): platform/architectuur/Node-versie van de
  // daadwerkelijke uitvoeromgeving, zodat een eventueel toekomstig
  // omgevingsverschil (bv. een andere Vercel-runtime) direct zichtbaar is in
  // de productielogs zonder dat er live meegekeken hoeft te worden.
  console.log(
    `[ocr] runtime: platform=${process.platform} arch=${process.arch} node=${process.version}`
  );
}

export interface OcrResultaat {
  paginas: PdfPagina[];
  volledigeTekst: string;
}

export async function ocrPdfPaginas(
  bestand: ArrayBuffer,
  totalPages: number,
  bestandsnaam: string
): Promise<OcrResultaat> {
  logRuntimeDiagnose();
  const ruw = await generateTextFromPdf({ data: bestand, filename: bestandsnaam, totalPages });
  const paginas: PdfPagina[] = ruw
    .slice()
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((p) => ({ pageNumber: p.pageNumber, text: p.text }));

  return { paginas, volledigeTekst: paginas.map((p) => p.text).join("\n\n") };
}
