import { describe, it, expect, vi, beforeEach } from "vitest";
import { genereerAssistentAntwoord, MIN_SIMILARITY_VOOR_ANTWOORD } from "./answer";
import { generateStructuredOutputWithUsage } from "@/services/ai-client";
import type { ContextItem } from "./build-context";

vi.mock("@/services/ai-client", () => ({
  generateStructuredOutputWithUsage: vi.fn(),
  getAiModelId: () => "gpt-4o-test",
}));

const mockGenerate = vi.mocked(generateStructuredOutputWithUsage);

const GEEN_USAGE = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

function maakContextItem(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    index: 1,
    type: "knowledge-source",
    label: "Handleiding",
    title: "Hoofdprofiel aanmaken",
    text: "Ga naar Instellingen > Profielen > Nieuw profiel.",
    similarity: 0.85,
    refCollection: "knowledge-sources",
    refId: 1,
    url: "/admin/collections/knowledge-sources/1",
    ...overrides,
  };
}

beforeEach(() => {
  mockGenerate.mockReset();
});

describe("genereerAssistentAntwoord — goede vraag", () => {
  it("geeft een antwoord terug wanneer de context voldoende is en het model hasAnswer:true geeft", async () => {
    mockGenerate.mockResolvedValue({
      object: {
        hasAnswer: true,
        answer: "Ga naar Instellingen > Profielen > Nieuw profiel (Bron 1).",
        reasoning: "Gebaseerd op Bron 1.",
      },
      usage: GEEN_USAGE,
    });

    const uitkomst = await genereerAssistentAntwoord("Hoe maak ik een hoofdprofiel aan?", [
      maakContextItem(),
    ]);

    expect(uitkomst).toMatchObject({ type: "answered", confidence: 85 });
    if (uitkomst.type === "answered") {
      expect(uitkomst.answer).toContain("Nieuw profiel");
      expect(uitkomst.reasoning).toContain("Bron 1");
    }
  });
});

describe("genereerAssistentAntwoord — geen bronnen / onbekende vraag", () => {
  it("roept de AI niet aan en geeft de vaste 'geen antwoord'-tekst bij nul context-items", async () => {
    const uitkomst = await genereerAssistentAntwoord("Wat is de hoofdstad van Mars?", []);

    expect(uitkomst).toMatchObject({
      type: "no-answer",
      answer: "Dat weet ik niet. Er is onvoldoende informatie in de kennisbank.",
      confidence: 0,
    });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("roept de AI niet aan wanneer de beste overeenkomstscore onder de drempel ligt", async () => {
    const uitkomst = await genereerAssistentAntwoord("iets vaags", [
      maakContextItem({ similarity: MIN_SIMILARITY_VOOR_ANTWOORD - 0.1 }),
    ]);

    expect(uitkomst).toMatchObject({ type: "no-answer" });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("geeft de vaste 'geen antwoord'-tekst wanneer het model zelf hasAnswer:false teruggeeft", async () => {
    mockGenerate.mockResolvedValue({
      object: {
        hasAnswer: false,
        answer: "",
        reasoning: "De context beantwoordt deze specifieke vraag niet.",
      },
      usage: GEEN_USAGE,
    });

    const uitkomst = await genereerAssistentAntwoord("Een vraag die niet in de context past", [
      maakContextItem(),
    ]);

    expect(uitkomst).toMatchObject({
      type: "no-answer",
      answer: "Dat weet ik niet. Er is onvoldoende informatie in de kennisbank.",
    });
    if (uitkomst.type === "no-answer")
      expect(uitkomst.reasoning).toContain("beantwoordt deze specifieke vraag niet");
  });

  it("behandelt een lege answer-tekst ondanks hasAnswer:true als 'no-answer' (defensief)", async () => {
    mockGenerate.mockResolvedValue({
      object: { hasAnswer: true, answer: "   ", reasoning: "Onduidelijk." },
      usage: GEEN_USAGE,
    });

    const uitkomst = await genereerAssistentAntwoord("vraag", [maakContextItem()]);

    expect(uitkomst).toMatchObject({ type: "no-answer" });
  });
});

describe("genereerAssistentAntwoord — fout bij AI", () => {
  it("geeft een failed-uitkomst terug wanneer de AI-aanroep zelf mislukt", async () => {
    mockGenerate.mockRejectedValue(new Error("OpenAI: rate limit exceeded"));

    const uitkomst = await genereerAssistentAntwoord("vraag", [maakContextItem()]);

    expect(uitkomst).toMatchObject({ type: "failed", foutmelding: "OpenAI: rate limit exceeded" });
  });
});
