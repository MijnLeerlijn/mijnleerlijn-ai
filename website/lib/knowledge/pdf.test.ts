import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfText, detecteerHoofdstukken } from "./pdf";

async function maakTestPdf(paginas: string[][]): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const regels of paginas) {
    const pagina = doc.addPage();
    regels.forEach((regel, i) => {
      pagina.drawText(regel, { x: 50, y: 750 - i * 20, size: 12, font });
    });
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("extractPdfText", () => {
  it("leest de tekst van een echte PDF uit, pagina voor pagina", async () => {
    const pdf = await maakTestPdf([
      ["Hoofdstuk 1 Inleiding", "Dit is de inleiding."],
      ["Hoofdstuk 2 Aan de slag", "Hier lees je hoe je begint."],
    ]);

    const resultaat = await extractPdfText(pdf);

    expect(resultaat.totalPages).toBe(2);
    expect(resultaat.paginas).toHaveLength(2);
    expect(resultaat.paginas[0]?.text).toContain("Hoofdstuk 1 Inleiding");
    expect(resultaat.volledigeTekst).toContain("Aan de slag");
  });

  it("geeft lege tekst terug voor een PDF zonder inhoud (lege pagina)", async () => {
    const pdf = await maakTestPdf([[]]);

    const resultaat = await extractPdfText(pdf);

    expect(resultaat.totalPages).toBe(1);
    expect(resultaat.volledigeTekst.trim()).toBe("");
  });
});

describe("detecteerHoofdstukken", () => {
  it("splitst op regels die op een hoofdstuktitel lijken", () => {
    const paginas = [
      { pageNumber: 1, text: "Hoofdstuk 1 Inleiding\nDit is de inleiding." },
      { pageNumber: 2, text: "Hoofdstuk 2 Aan de slag\nHier lees je hoe je begint." },
    ];

    const hoofdstukken = detecteerHoofdstukken(paginas, "Testdocument");

    expect(hoofdstukken).toHaveLength(2);
    expect(hoofdstukken[0]).toMatchObject({ title: "Hoofdstuk 1 Inleiding", text: "Dit is de inleiding." });
    expect(hoofdstukken[1]).toMatchObject({
      title: "Hoofdstuk 2 Aan de slag",
      text: "Hier lees je hoe je begint.",
    });
  });

  it("valt terug op één hoofdstuk met de documenttitel als er geen titels herkend worden", () => {
    const paginas = [{ pageNumber: 1, text: "Zomaar wat lopende tekst zonder duidelijke titel." }];

    const hoofdstukken = detecteerHoofdstukken(paginas, "Testdocument");

    expect(hoofdstukken).toHaveLength(1);
    expect(hoofdstukken[0]).toMatchObject({ title: "Testdocument" });
  });

  it("laat lege hoofdstukken (titel zonder inhoud erna) weg", () => {
    const paginas = [
      { pageNumber: 1, text: "Hoofdstuk 1 Inleiding\nHoofdstuk 2 Aan de slag\nEcht een zin." },
    ];

    const hoofdstukken = detecteerHoofdstukken(paginas, "Testdocument");

    expect(hoofdstukken).toHaveLength(1);
    expect(hoofdstukken[0]).toMatchObject({ title: "Hoofdstuk 2 Aan de slag", text: "Echt een zin." });
  });
});
