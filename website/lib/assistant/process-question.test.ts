import { describe, it, expect, vi, beforeEach } from "vitest";
import { processQuestion } from "./process-question";
import { maakFakePayload } from "@/lib/support/fake-payload";
import { searchKnowledge } from "@/lib/embeddings/similarity-search";
import { generateStructuredOutputWithUsage } from "@/services/ai-client";

vi.mock("@/lib/embeddings/similarity-search", () => ({ searchKnowledge: vi.fn() }));
vi.mock("@/services/ai-client", () => ({
  generateStructuredOutputWithUsage: vi.fn(),
  getAiModelId: () => "gpt-4o-test",
}));

const mockSearch = vi.mocked(searchKnowledge);
const mockGenerate = vi.mocked(generateStructuredOutputWithUsage);
const USAGE = { inputTokens: 100, outputTokens: 40, totalTokens: 140 };

function maakSeed() {
  return {
    "knowledge-sources": [
      {
        id: 1,
        title: "Handleiding profielen",
        type: "handleiding",
        aiSummary: "Ga naar Instellingen > Profielen.",
        chapters: [],
      },
    ],
    "knowledge-drafts": [
      {
        id: 2,
        title: "Wachtwoord resetten",
        shortAnswer: "Ga naar Inloggen.",
        fullAnswer: "Klik op Wachtwoord vergeten.",
      },
    ],
    articles: [
      { id: 3, title: "Rapportage exporteren", slug: "rapportage-exporteren", summary: "Exportuitleg." },
    ],
    "assistant-conversations": [],
  };
}

beforeEach(() => {
  mockSearch.mockReset();
  mockGenerate.mockReset();
});

describe("processQuestion — goede vraag", () => {
  it("geeft een antwoord en logt het gesprek met bronnen, model en tokens", async () => {
    mockSearch.mockResolvedValue([
      { type: "knowledge-source", id: 1, title: "Handleiding profielen", similarity: 0.9, reason: "" },
    ]);
    mockGenerate.mockResolvedValue({
      object: {
        hasAnswer: true,
        answer: "Ga naar Instellingen > Profielen (Bron 1).",
        reasoning: "Gebaseerd op Bron 1.",
      },
      usage: USAGE,
    });
    const { payload, collection } = maakFakePayload(maakSeed());

    const uitkomst = await processQuestion(payload, { question: "Hoe maak ik een profiel aan?", userId: 42 });

    expect(uitkomst.type).toBe("answered");
    if (uitkomst.type === "failed") return;
    expect(uitkomst.sources).toHaveLength(1);
    expect(uitkomst.conversationId).toBeTruthy();

    const record = collection("assistant-conversations")[0]!;
    expect(record.hasAnswer).toBe(true);
    expect(record.model).toBe("gpt-4o-test");
    expect(record.totalTokens).toBe(140);
    expect(record.user).toBe(42);
    expect((record.sources as unknown[]).length).toBe(1);
  });
});

describe("processQuestion — geen bronnen / onbekende vraag", () => {
  it("logt een 'geen antwoord'-gesprek zonder de AI aan te roepen wanneer er geen treffers zijn", async () => {
    mockSearch.mockResolvedValue([]);
    const { payload, collection } = maakFakePayload(maakSeed());

    const uitkomst = await processQuestion(payload, {
      question: "Wat is de hoofdstad van Mars?",
      userId: 42,
    });

    expect(uitkomst.type).toBe("no-answer");
    expect(mockGenerate).not.toHaveBeenCalled();
    const record = collection("assistant-conversations")[0]!;
    expect(record.hasAnswer).toBe(false);
    expect((record.sources as unknown[]).length).toBe(0);
  });

  it("logt een 'geen antwoord'-gesprek wanneer de treffers een te lage score hebben", async () => {
    mockSearch.mockResolvedValue([
      { type: "knowledge-draft", id: 2, title: "Wachtwoord resetten", similarity: 0.1, reason: "" },
    ]);
    const { payload } = maakFakePayload(maakSeed());

    const uitkomst = await processQuestion(payload, { question: "onduidelijke vraag", userId: 42 });

    expect(uitkomst.type).toBe("no-answer");
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("processQuestion — typo", () => {
  it("verwerkt een vraag met een typfout net zo goed (de semantische zoekfunctie is al typo-robuust, zie lib/embeddings/)", async () => {
    mockSearch.mockResolvedValue([
      { type: "knowledge-draft", id: 2, title: "Wachtwoord resetten", similarity: 0.9, reason: "" },
    ]);
    mockGenerate.mockResolvedValue({
      object: { hasAnswer: true, answer: "Ga naar Inloggen (Bron 1).", reasoning: "Gebaseerd op Bron 1." },
      usage: USAGE,
    });
    const { payload } = maakFakePayload(maakSeed());

    const uitkomst = await processQuestion(payload, { question: "hoe reset ik mijn wagtwoord", userId: 42 });

    expect(uitkomst.type).toBe("answered");
    expect(mockSearch).toHaveBeenCalledWith(payload, { query: "hoe reset ik mijn wagtwoord", limiet: 10 });
  });
});

describe("processQuestion — meerdere bronnen", () => {
  it("verzamelt en labelt treffers uit verschillende collecties correct", async () => {
    mockSearch.mockResolvedValue([
      { type: "knowledge-source", id: 1, title: "Handleiding profielen", similarity: 0.9, reason: "" },
      { type: "knowledge-draft", id: 2, title: "Wachtwoord resetten", similarity: 0.8, reason: "" },
      { type: "article", id: 3, title: "Rapportage exporteren", similarity: 0.7, reason: "" },
    ]);
    mockGenerate.mockResolvedValue({
      object: {
        hasAnswer: true,
        answer: "Samengevat antwoord op basis van meerdere bronnen.",
        reasoning: "Gebaseerd op Bron 1, 2 en 3.",
      },
      usage: USAGE,
    });
    const { payload } = maakFakePayload(maakSeed());

    const uitkomst = await processQuestion(payload, { question: "algemene vraag", userId: 42 });

    expect(uitkomst.type).toBe("answered");
    if (uitkomst.type === "failed") return;
    expect(uitkomst.sources.map((s) => s.label).sort()).toEqual([
      "Handleiding",
      "Handleiding",
      "Supportthread",
    ]);
  });
});

describe("processQuestion — fout bij AI", () => {
  it("maakt geen gespreklogboek aan wanneer de AI-aanroep mislukt", async () => {
    mockSearch.mockResolvedValue([
      { type: "knowledge-source", id: 1, title: "Handleiding profielen", similarity: 0.9, reason: "" },
    ]);
    mockGenerate.mockRejectedValue(new Error("OpenAI: server error"));
    const { payload, collection } = maakFakePayload(maakSeed());

    const uitkomst = await processQuestion(payload, { question: "vraag", userId: 42 });

    expect(uitkomst).toEqual({ type: "failed", foutmelding: "OpenAI: server error" });
    expect(collection("assistant-conversations")).toHaveLength(0);
  });

  it("geeft ook een failed-uitkomst terug wanneer de zoekfase zelf mislukt (bv. ontbrekende OPENAI_API_KEY bij het embedden van de vraag)", async () => {
    mockSearch.mockRejectedValue(new Error("Ontbrekende verplichte omgevingsvariabele: OPENAI_API_KEY."));
    const { payload, collection } = maakFakePayload(maakSeed());

    const uitkomst = await processQuestion(payload, { question: "vraag", userId: 42 });

    expect(uitkomst).toMatchObject({ type: "failed", foutmelding: expect.stringContaining("OPENAI_API_KEY") });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(collection("assistant-conversations")).toHaveLength(0);
  });
});
