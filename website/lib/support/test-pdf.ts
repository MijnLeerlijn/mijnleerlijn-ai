import { PDFDocument, StandardFonts } from "pdf-lib";

// Genereert een echte, geldige PDF (via pdf-lib) voor tests — geen fixture-
// bestand nodig. Gedeeld door lib/knowledge/index-source.test.ts en
// lib/knowledge/index-source.ocr-buffer.test.ts: een pagina zonder
// getekende tekstregels (bv. maakTestPdf([[]])) simuleert, net als een
// Canva-export, een PDF zonder bruikbare tekstlaag.
export async function maakTestPdf(paginas: string[][]): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const regels of paginas) {
    const pagina = doc.addPage();
    regels.forEach((regel, i) => pagina.drawText(regel, { x: 50, y: 750 - i * 20, size: 12, font }));
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
