// @vitest-environment node
//
// Vitest draait standaard met environment "jsdom" (vitest.config.ts) — dat
// zet een globale `window` neer, waardoor unpdf's eigen browser/Node-
// detectie (isBrowser = typeof window !== "undefined") hier ten onrechte de
// browser-canvas-route zou nemen i.p.v. de @napi-rs/canvas-route via
// canvasImport (lib/knowledge/ocr.ts). Een echte Vercel-serverless-functie
// heeft geen `window`, dus deze test forceert environment "node" om
// daadwerkelijk hetzelfde codepad als productie te doorlopen.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { indexeerBron } from "./index-source";
import { generateStructuredOutput, generateTextFromImage } from "@/services/ai-client";
import { maakTestPdf } from "@/lib/support/test-pdf";

// Regressietest voor een productiefout bij Canva-PDF's (2026-07-25): "Cannot
// perform Construct on a detached ArrayBuffer". Oorzaak: unpdf/pdf.js
// "transfert" de ArrayBuffer die aan getDocument({data}) meegegeven wordt
// naar zijn (fake-)worker-context, precies zoals bij een echte Web Worker —
// de buffer raakt daarbij gedetacht. index-source.ts hergebruikte dezelfde
// buffer voor zowel de normale extractie (lib/knowledge/pdf.ts) als de
// OCR-fallback (lib/knowledge/ocr.ts); de tweede aanroep liep daardoor stuk
// op een al gedetachte buffer. Deze test mockt BEWUST "./ocr" en "./pdf"
// NIET (in tegenstelling tot index-source.test.ts) — alleen zo loopt de
// echte pdf.js/unpdf-buffertransfer daadwerkelijk mee, en zou deze test
// zonder de buffer-kopie in index-source.ts (bufferVoorOcr = buffer.slice(0))
// opnieuw stuklopen.
vi.mock("@/services/ai-client", () => ({
  generateStructuredOutput: vi.fn(),
  generateTextFromImage: vi.fn(),
  getAiModelId: () => "gpt-4o-test",
}));

const mockGenerate = vi.mocked(generateStructuredOutput);
const mockOcrVision = vi.mocked(generateTextFromImage);

beforeEach(() => {
  mockGenerate.mockReset();
  mockGenerate.mockImplementation(async (args) => {
    if (args.systemPrompt.includes("hoofdstuk")) {
      return { summary: "Korte hoofdstuksamenvatting." };
    }
    return { summary: "Documentsamenvatting.", keywords: ["kw1"], category: "profielen" };
  });
  mockOcrVision.mockReset();
  mockOcrVision.mockResolvedValue("Hoofdstuk 1 Inleiding\nTekst die via OCR van de afbeelding is uitgelezen.");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("indexeerBron — OCR-fallback met echte pdf.js/unpdf-buffer-flow (regressie: detached ArrayBuffer)", () => {
  it("verwerkt een image-only PDF zonder 'detached ArrayBuffer'-fout — normale extractie en OCR gebruiken elk hun eigen buffer", async () => {
    const pdf = await maakTestPdf([[]]); // pagina zonder tekstlaag, zoals een Canva-export
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => pdf })
    );

    const uitkomst = await indexeerBron({
      title: "Canva-handleiding",
      type: "pdf",
      fileUrl: "https://blob.test/canva.pdf",
    });

    if (uitkomst.type === "failed") {
      expect(uitkomst.foutmelding).not.toContain("detached");
    }
    expect(mockOcrVision).toHaveBeenCalled();
    expect(uitkomst.type).toBe("indexed");
  }, 20000);
});
