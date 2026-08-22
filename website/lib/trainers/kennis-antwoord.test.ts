import { describe, it, expect, vi, beforeEach } from "vitest";
import { genereerTrainerKennisAntwoord, MIN_SIMILARITY_VOOR_TRAINERANTWOORD, type TrainerKennisBron } from "./kennis-antwoord";
import { generateStructuredOutput } from "@/services/ai-client";

// Vervolgronde (2026-08-22) — kern-antwoordlogica trainer-Kennis-Q&A. Zelfde
// testopzet als lib/assistant/answer.test.ts (verondersteld, niet
// hergebruikt): de deterministische no-answer-poort (geen bronnen / te lage
// score) moet bewijsbaar het taalmodel NOOIT aanroepen — "antwoord zonder
// bronkennis hallucineert niet" (opdrachtseis testlijst).
vi.mock("@/services/ai-client", () => ({
  generateStructuredOutput: vi.fn(),
  getAiModelId: () => "gpt-4o-test",
}));

const mockGenerate = vi.mocked(generateStructuredOutput);

function bron(overrides: Partial<TrainerKennisBron> = {}): TrainerKennisBron {
  return { id: 1, titel: "Periodevoorbereiding", tekst: "Een periode duurt zes weken en start met...", similarity: 0.8, ...overrides };
}

beforeEach(() => {
  mockGenerate.mockReset();
});

describe("genereerTrainerKennisAntwoord — geen bronkennis, geen hallucinatie", () => {
  it("geeft de exacte, opdrachtseis-voorgeschreven fallbacktekst terug wanneer er geen bronnen zijn, en roept het taalmodel nooit aan", async () => {
    const uitkomst = await genereerTrainerKennisAntwoord("Een vraag zonder dekking", []);
    expect(uitkomst).toMatchObject({ type: "no-answer", answer: "Daarover heb ik in de beschikbare trainerkennis nog onvoldoende informatie." });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("geeft de fallback terug bij een te lage beste overeenkomstscore, en roept het taalmodel nooit aan", async () => {
    const uitkomst = await genereerTrainerKennisAntwoord("Vraag", [bron({ similarity: MIN_SIMILARITY_VOOR_TRAINERANTWOORD - 0.01 })]);
    expect(uitkomst.type).toBe("no-answer");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("roept het taalmodel wél aan zodra de beste score exact op de drempel zit", async () => {
    mockGenerate.mockResolvedValue({ hasAnswer: true, answer: "Antwoord.", reasoning: "Reden." });
    await genereerTrainerKennisAntwoord("Vraag", [bron({ similarity: MIN_SIMILARITY_VOOR_TRAINERANTWOORD })]);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("het model zelf mag ook eerlijk 'nee' zeggen (hasAnswer:false) — dan alsnog de vaste fallbacktekst, geen bronnen in de uitkomst", async () => {
    mockGenerate.mockResolvedValue({ hasAnswer: false, answer: "", reasoning: "Context dekt de vraag niet." });
    const uitkomst = await genereerTrainerKennisAntwoord("Vraag", [bron()]);
    expect(uitkomst).toMatchObject({ type: "no-answer", answer: "Daarover heb ik in de beschikbare trainerkennis nog onvoldoende informatie." });
    if (uitkomst.type !== "failed") expect(uitkomst.bronnen).toEqual([]);
  });
});

describe("genereerTrainerKennisAntwoord — beantwoord vanuit trainerkennis, bronnen weergegeven", () => {
  it("geeft het antwoord + de gebruikte bronnen terug bij een geslaagd, voldoende-onderbouwd antwoord", async () => {
    mockGenerate.mockResolvedValue({ hasAnswer: true, answer: "  Zo begeleid je dit.  ", reasoning: "Gebaseerd op het artikel." });
    const bronnen = [bron({ id: 5, titel: "Periodevoorbereiding" })];

    const uitkomst = await genereerTrainerKennisAntwoord("Hoe begeleid ik dit?", bronnen);

    expect(uitkomst).toMatchObject({ type: "answered", answer: "Zo begeleid je dit.", confidence: 80 });
    if (uitkomst.type === "answered") {
      expect(uitkomst.bronnen).toEqual(bronnen);
    }
  });

  it("de systeemprompt/context bevat de brontitel én -tekst, zodat het model uitsluitend daarop kan antwoorden", async () => {
    mockGenerate.mockResolvedValue({ hasAnswer: true, answer: "Antwoord.", reasoning: "Reden." });
    await genereerTrainerKennisAntwoord("Vraag", [bron({ titel: "Uniek Titel Fragment", tekst: "Uniek Tekst Fragment" })]);

    const call = mockGenerate.mock.calls[0]![0];
    expect(call.userPrompt).toContain("Uniek Titel Fragment");
    expect(call.userPrompt).toContain("Uniek Tekst Fragment");
  });

  it("confidence is altijd de retrieval-score van de beste bron, nooit een zelfinschatting van het model", async () => {
    mockGenerate.mockResolvedValue({ hasAnswer: true, answer: "Antwoord.", reasoning: "Reden." });
    const uitkomst = await genereerTrainerKennisAntwoord("Vraag", [bron({ similarity: 0.73 }), bron({ id: 2, similarity: 0.9 })]);
    // Eerste bron in de array is de best passende (al gesorteerd door de
    // aanroeper, lib/trainers/kennis.ts) — deze functie zelf sorteert niet
    // opnieuw, neemt gewoon bronnen[0].
    expect(uitkomst.type).not.toBe("failed");
    if (uitkomst.type !== "failed") expect(uitkomst.confidence).toBe(73);
  });
});

describe("genereerTrainerKennisAntwoord — modelfout", () => {
  it("geeft type 'failed' terug zonder de ruwe foutmelding te verzinnen/verbergen, wanneer het taalmodel zelf faalt", async () => {
    mockGenerate.mockRejectedValue(new Error("AI-provider onbereikbaar"));
    const uitkomst = await genereerTrainerKennisAntwoord("Vraag", [bron()]);
    expect(uitkomst).toEqual({ type: "failed", foutmelding: "AI-provider onbereikbaar" });
  });
});
