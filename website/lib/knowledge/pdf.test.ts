import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfText, detecteerHoofdstukken, detecteerHoofdstukkenInTekst } from "./pdf";

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

describe("detecteerHoofdstukkenInTekst — chunking voor platte tekstbronnen (chatbot-kwaliteitsopdracht 2026-07-25)", () => {
  it("herkent markdown-koppen (#, ##, ###) als hoofdstuktitel, zonder de '#'-tekens in de titel", () => {
    const tekst = ["# Inleiding", "Dit is de inleiding.", "## Aan de slag", "Hier lees je hoe je begint."].join(
      "\n"
    );

    const hoofdstukken = detecteerHoofdstukkenInTekst(tekst, "Testdocument");

    expect(hoofdstukken).toHaveLength(2);
    expect(hoofdstukken[0]).toMatchObject({ title: "Inleiding", text: "Dit is de inleiding." });
    expect(hoofdstukken[1]).toMatchObject({ title: "Aan de slag", text: "Hier lees je hoe je begint." });
  });

  it("herkent doorlopend genummerde sectiekoppen ('1. Titel', '16. Titel') — inclusief punctuatie die het PDF-patroon niet toelaat", () => {
    const tekst = [
      "1. De kernfilosofie: MijnLeerlijn is een middel, geen doel",
      "Eerste inhoud.",
      "2. De cyclus van MijnLeerlijn — het overkoepelende model",
      "Tweede inhoud.",
      "16. Hoe de helpdesk-AI dit document moet gebruiken",
      "Zestiende inhoud.",
    ].join("\n");

    const hoofdstukken = detecteerHoofdstukkenInTekst(tekst, "Testdocument");

    expect(hoofdstukken.map((h) => h.title)).toEqual([
      "1. De kernfilosofie: MijnLeerlijn is een middel, geen doel",
      "2. De cyclus van MijnLeerlijn — het overkoepelende model",
      "16. Hoe de helpdesk-AI dit document moet gebruiken",
    ]);
    expect(hoofdstukken[0]).toMatchObject({ text: "Eerste inhoud." });
    expect(hoofdstukken[2]).toMatchObject({ text: "Zestiende inhoud." });
  });

  it("behandelt het echte achtergronddocument realistisch: titelregel + 16 doorlopend genummerde secties worden 17 hoofdstukken (intro-fallback + 16 genummerd)", () => {
    const secties = Array.from({ length: 16 }, (_, i) => `${i + 1}. Sectietitel nummer ${i + 1}\nInhoud van sectie ${i + 1}.`);
    const tekst = ["Kennisbasis MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI", ...secties].join("\n");

    const hoofdstukken = detecteerHoofdstukkenInTekst(tekst, "Kennisbasis MijnLeerlijn");

    // De titelregel zelf matcht geen enkel patroon en vormt daarom een eigen
    // fallback-hoofdstuk (documentTitel) vóór de eerste genummerde sectie.
    expect(hoofdstukken).toHaveLength(17);
    expect(hoofdstukken[0]).toMatchObject({ title: "Kennisbasis MijnLeerlijn" });
    expect(hoofdstukken[1]).toMatchObject({ title: "1. Sectietitel nummer 1" });
    expect(hoofdstukken[16]).toMatchObject({ title: "16. Sectietitel nummer 16" });
  });

  it("valt terug op één hoofdstuk met de documenttitel als er geen sectiekoppen herkend worden", () => {
    const tekst = "Zomaar wat lopende tekst zonder duidelijke titel of nummering.";

    const hoofdstukken = detecteerHoofdstukkenInTekst(tekst, "Testdocument");

    expect(hoofdstukken).toHaveLength(1);
    expect(hoofdstukken[0]).toMatchObject({ title: "Testdocument" });
  });

  it("blijft ook de bestaande PDF-patronen herkennen ('Hoofdstuk N') — superset, geen vervanging", () => {
    const tekst = "Hoofdstuk 1 Inleiding\nDit is de inleiding.";

    const hoofdstukken = detecteerHoofdstukkenInTekst(tekst, "Testdocument");

    expect(hoofdstukken[0]).toMatchObject({ title: "Hoofdstuk 1 Inleiding" });
  });

  it("regressie: detecteerHoofdstukken() (PDF-pad) blijft ONGEWIJZIGD — de bredere tekstpatronen gelden niet voor PDF's", () => {
    // Reden: veel echte handleiding-PDF's bevatten genummerde stappenlijsten
    // ("1. Klik op de knop") die met het bredere tekstpatroon ten onrechte
    // als nieuw hoofdstuk zouden worden aangezien.
    const paginas = [{ pageNumber: 1, text: "1. Klik op de knop\nGa naar het menu.\n2. Kies een optie." }];

    const hoofdstukken = detecteerHoofdstukken(paginas, "Testdocument");

    // Geen van de twee "stappen" wordt als apart hoofdstuk herkend — alles
    // blijft onder het documenttitel-fallback-hoofdstuk.
    expect(hoofdstukken).toHaveLength(1);
    expect(hoofdstukken[0]).toMatchObject({ title: "Testdocument" });
  });
});
