import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { indexeerBron } from "./index-source";
import { generateStructuredOutput } from "@/services/ai-client";
import { ocrPdfPaginas } from "./ocr";
import { maakTestPdf } from "@/lib/support/test-pdf";

vi.mock("@/services/ai-client", () => ({
  generateStructuredOutput: vi.fn(),
  getAiModelId: () => "gpt-4o-test",
}));

// OCR (lib/knowledge/ocr.ts) rendert pagina's naar afbeeldingen en roept de
// AI-vision-functie aan — hier gemockt op modulegrens, net als
// @/services/ai-client hierboven, zodat deze tests geen echte rendering/AI-
// aanroep nodig hebben.
vi.mock("./ocr", () => ({ ocrPdfPaginas: vi.fn() }));

const mockGenerate = vi.mocked(generateStructuredOutput);
const mockOcr = vi.mocked(ocrPdfPaginas);

// De mock differentieert op het systeemprompt-type, zodat één generieke
// generateStructuredOutput-mock zowel de hoofdstuk- als de
// documentsamenvatting kan beantwoorden binnen dezelfde test.
function stelAiAntwoordenIn() {
  mockGenerate.mockImplementation(async (args) => {
    if (args.systemPrompt.includes("hoofdstuk")) {
      return { summary: "Korte hoofdstuksamenvatting." };
    }
    return { summary: "Documentsamenvatting.", keywords: ["kw1", "kw2"], category: "profielen" };
  });
}

beforeEach(() => {
  mockGenerate.mockReset();
  stelAiAntwoordenIn();
  mockOcr.mockReset();
  mockOcr.mockResolvedValue({ paginas: [], volledigeTekst: "" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("indexeerBron — pdf", () => {
  it("leest een echte PDF uit, herkent hoofdstukken en vat elk hoofdstuk + het geheel samen", async () => {
    const pdf = await maakTestPdf([
      ["Hoofdstuk 1 Inleiding", "Dit is de inleiding."],
      ["Hoofdstuk 2 Aan de slag", "Hier lees je hoe je begint."],
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => pdf })
    );

    const uitkomst = await indexeerBron({
      title: "Testhandleiding",
      type: "pdf",
      fileUrl: "https://blob.test/doc.pdf",
    });

    expect(uitkomst.type).toBe("indexed");
    if (uitkomst.type !== "indexed") return;
    expect(uitkomst.summary).toBe("Documentsamenvatting.");
    expect(uitkomst.keywords).toEqual(["kw1", "kw2"]);
    expect(uitkomst.category).toBe("profielen");
    expect(uitkomst.chapters).toHaveLength(2);
    expect(uitkomst.chapters[0]).toMatchObject({
      title: "Hoofdstuk 1 Inleiding",
      summary: "Korte hoofdstuksamenvatting.",
      order: 1,
    });
    expect(uitkomst.chapters[1]).toMatchObject({ title: "Hoofdstuk 2 Aan de slag", order: 2 });
    // PDF had al een goede tekstlaag — OCR mag dan niet gestart worden.
    expect(mockOcr).not.toHaveBeenCalled();
  });

  it("valt terug op OCR bij een (vermoedelijk) image-only PDF en gebruikt de OCR-tekst voor hoofdstukken en samenvatting", async () => {
    // Een pagina zonder getekende tekstregels simuleert, net als bij een
    // Canva-export, een PDF zonder bruikbare tekstlaag: unpdf haalt er dan
    // (vrijwel) niets uit, ongeacht of dat komt door een lege pagina of door
    // een pagina die uit een afbeelding bestaat.
    const pdf = await maakTestPdf([[]]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => pdf })
    );
    mockOcr.mockResolvedValue({
      paginas: [{ pageNumber: 1, text: "Hoofdstuk 1 Inleiding\nDit is tekst die via OCR is uitgelezen." }],
      volledigeTekst: "Hoofdstuk 1 Inleiding\nDit is tekst die via OCR is uitgelezen.",
    });

    const uitkomst = await indexeerBron({
      title: "Canva-handleiding",
      type: "pdf",
      fileUrl: "https://blob.test/canva.pdf",
    });

    expect(mockOcr).toHaveBeenCalledTimes(1);
    expect(uitkomst.type).toBe("indexed");
    if (uitkomst.type !== "indexed") return;
    expect(uitkomst.chapters).toHaveLength(1);
    expect(uitkomst.chapters[0]).toMatchObject({ title: "Hoofdstuk 1 Inleiding", order: 1 });
  });

  it("faalt pas wanneer zowel normale extractie als OCR geen bruikbare tekst opleveren, zonder de AI aan te roepen", async () => {
    const pdf = await maakTestPdf([[]]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => pdf })
    );
    // mockOcr geeft standaard (zie beforeEach) al lege tekst terug.

    const uitkomst = await indexeerBron({
      title: "Leeg document",
      type: "pdf",
      fileUrl: "https://blob.test/leeg.pdf",
    });

    expect(mockOcr).toHaveBeenCalledTimes(1);
    expect(uitkomst).toMatchObject({ type: "failed" });
    if (uitkomst.type === "failed") expect(uitkomst.foutmelding).toContain("geen leesbare tekst");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("faalt netjes zonder gekoppeld bestand", async () => {
    const uitkomst = await indexeerBron({ title: "Zonder bestand", type: "pdf", fileUrl: null });
    expect(uitkomst).toMatchObject({ type: "failed" });
    if (uitkomst.type === "failed") expect(uitkomst.foutmelding).toContain("Geen bestand");
  });
});

describe("indexeerBron — website (en release notes/handleiding/faq/intern document)", () => {
  it("haalt een website-URL op en vat de tekst samen", async () => {
    const html = "<html><head><title>Voorbeeld</title></head><body><p>Belangrijke inhoud.</p></body></html>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => html }));

    const uitkomst = await indexeerBron({
      title: "Release notes januari",
      type: "release_notes",
      url: "https://mijnleerlijn.nl/updates/januari",
    });

    expect(uitkomst).toMatchObject({
      type: "indexed",
      summary: "Documentsamenvatting.",
      category: "profielen",
    });
  });

  it("faalt netjes zonder URL", async () => {
    const uitkomst = await indexeerBron({ title: "Zonder URL", type: "website", url: null });
    expect(uitkomst).toMatchObject({ type: "failed" });
    if (uitkomst.type === "failed") expect(uitkomst.foutmelding).toContain("Geen URL");
  });
});

describe("indexeerBron — video", () => {
  it("gebruikt een handmatig ingevuld transcript wanneer dat aanwezig is", async () => {
    const uitkomst = await indexeerBron({
      title: "Uitlegvideo profielen",
      type: "video",
      description: "Een korte uitleg.",
      transcript: "In deze video laten we zien hoe je een profiel aanmaakt.",
    });

    expect(uitkomst).toMatchObject({ type: "indexed", summary: "Documentsamenvatting." });
  });

  it("haalt een transcript op van de video-URL als dat eenvoudig kan (VTT)", async () => {
    const vtt = "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nWelkom bij deze video.";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, headers: { get: () => "text/vtt" }, text: async () => vtt })
    );

    const uitkomst = await indexeerBron({
      title: "Video met ondertitels",
      type: "video",
      url: "https://cdn.test/ondertitels.vtt",
    });

    expect(uitkomst).toMatchObject({ type: "indexed" });
  });

  it("faalt netjes zonder titel, omschrijving of transcript", async () => {
    const uitkomst = await indexeerBron({ title: "", type: "video" });
    expect(uitkomst).toMatchObject({ type: "failed" });
  });
});

describe("indexeerBron — fout bij AI", () => {
  it("geeft een failed-uitkomst terug wanneer de AI-aanroep zelf mislukt", async () => {
    mockGenerate.mockReset();
    mockGenerate.mockRejectedValue(new Error("OpenAI: Invalid schema for response_format"));

    const uitkomst = await indexeerBron({
      title: "Video zonder werkende AI",
      type: "video",
      description: "Iets.",
    });

    expect(uitkomst.type).toBe("failed");
    if (uitkomst.type === "failed") expect(uitkomst.foutmelding).toContain("Invalid schema");
  });

  it("geeft een failed-uitkomst terug bij structureel geldige maar ongeldige AI-output (lege samenvatting)", async () => {
    mockGenerate.mockReset();
    mockGenerate.mockResolvedValue({ summary: "", keywords: [], category: "" });

    const uitkomst = await indexeerBron({
      title: "Video met lege AI-output",
      type: "video",
      description: "Iets.",
    });

    expect(uitkomst.type).toBe("failed");
    if (uitkomst.type === "failed") expect(uitkomst.foutmelding).toContain("voldeed niet aan de vereisten");
  });
});
