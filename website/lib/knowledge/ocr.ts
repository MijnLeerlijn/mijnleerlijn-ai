import { getDocumentProxy, renderPageAsImage } from "unpdf";
import { generateTextFromImage } from "@/services/ai-client";
import type { PdfPagina } from "./pdf";

// OCR-fallback voor PDF's zonder (bruikbare) tekstlaag — bv. Canva-exports
// die uit afbeeldingen bestaan. Bewust een apart bestand van pdf.ts: pdf.ts
// blijft pure PDF-tekstextractie zonder AI-afhankelijkheid; dit bestand voegt
// de AI-vision-stap toe (rendert elke pagina naar een afbeelding en laat het
// taalmodel de zichtbare tekst aflezen, zie services/ai-client.ts
// generateTextFromImage()). Wordt uitsluitend aangeroepen vanuit
// index-source.ts, en alleen wanneer normale extractie te weinig tekst
// oplevert.

const RENDER_SCHAAL = 1.5;

export interface OcrResultaat {
  paginas: PdfPagina[];
  volledigeTekst: string;
}

/**
 * Rendert elke pagina naar een afbeelding (unpdf + @napi-rs/canvas, de enige
 * canvas-implementatie die zonder systeem-Cairo-libraries op Vercel draait)
 * en laat het taalmodel de tekst per pagina aflezen. Sequentieel i.p.v.
 * parallel: dit pad wordt alleen doorlopen bij image-only PDF's (uitzondering,
 * geen hoofdroute), en sequentieel verwerken houdt de paginavolgorde
 * triviaal correct zonder Promise.all-boekhouding.
 */
export async function ocrPdfPaginas(bestand: ArrayBuffer, totalPages: number): Promise<OcrResultaat> {
  const document = await getDocumentProxy(new Uint8Array(bestand));
  const paginas: PdfPagina[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    const image = (await renderPageAsImage(document, pageNumber, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: RENDER_SCHAAL,
    })) as ArrayBuffer;
    const text = await generateTextFromImage({ data: image, mediaType: "image/png" });
    paginas.push({ pageNumber, text });
  }

  return { paginas, volledigeTekst: paginas.map((p) => p.text).join("\n\n") };
}
