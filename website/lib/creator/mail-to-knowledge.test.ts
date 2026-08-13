import { describe, it, expect, vi, beforeEach } from "vitest";
import { maakKennisstukVanMail } from "./mail-to-knowledge";
import { generateStructuredOutput } from "@/services/ai-client";

vi.mock("@/services/ai-client", () => ({ generateStructuredOutput: vi.fn() }));

const mockGenerate = vi.mocked(generateStructuredOutput);

describe("maakKennisstukVanMail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scrubt e-mailadressen en telefoonnummers uit het AI-antwoord (zelfde vangnet als lib/support/analyze.ts)", async () => {
    mockGenerate.mockResolvedValue({
      title: "Hoe werkt het doelenoverzicht?",
      question: "Vraag van jan.jansen@school.nl",
      shortAnswer: "Bel 06-12345678 voor hulp.",
      fullAnswer: "Neem contact op via jan.jansen@school.nl of 06-12345678.",
      containsPersonalData: true,
      personalDataExplanation: "Naam en contactgegevens in de brontekst.",
    });

    const resultaat = await maakKennisstukVanMail({
      ontvangenTekst: "Van: jan.jansen@school.nl — hoe werkt het doelenoverzicht?",
      conceptAntwoord: "Beste Jan, bel 06-12345678 als het niet lukt.",
    });

    expect(resultaat.question).not.toContain("jan.jansen@school.nl");
    expect(resultaat.shortAnswer).not.toContain("06-12345678");
    expect(resultaat.fullAnswer).not.toContain("jan.jansen@school.nl");
    expect(resultaat.fullAnswer).not.toContain("06-12345678");
    expect(resultaat.customerSpecificInformationFound).toBe(true);
    expect(resultaat.title).toBe("Hoe werkt het doelenoverzicht?");
  });

  it("persisteert niets zelf — geeft uitsluitend het voorstel terug (mens keurt goed vóór het kennis wordt)", async () => {
    mockGenerate.mockResolvedValue({
      title: "T",
      question: "Q",
      shortAnswer: "S",
      fullAnswer: "F",
      containsPersonalData: false,
    });
    const resultaat = await maakKennisstukVanMail({ ontvangenTekst: "vraag", conceptAntwoord: "antwoord" });
    expect(resultaat).not.toHaveProperty("id");
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});
