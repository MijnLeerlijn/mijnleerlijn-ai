import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAssistantEvaluation } from "./evaluate";
import { maakFakePayload } from "@/lib/support/fake-payload";
import {
  searchKnowledgePhased,
  type SearchHit,
  type PhasedSearchResultaat,
} from "@/lib/embeddings/similarity-search";
import { generateStructuredOutputWithUsage } from "@/services/ai-client";
import { rewriteSearchQuery } from "./rewrite-query";

// Zelfde mockingpatroon als lib/assistant/process-question.test.ts — deze
// functie draait dezelfde pijplijnstappen, maar schrijft (bewust) niets naar
// Payload zelf: geen assistant-conversations-record, dat gebeurt in
// app/api/assistant/eval/run/route.ts. Deze tests controleren daarom alleen
// de teruggegeven diagnostiek, geen collection-writes.
vi.mock("@/lib/embeddings/similarity-search", () => ({ searchKnowledgePhased: vi.fn() }));
vi.mock("@/services/ai-client", () => ({
  generateStructuredOutputWithUsage: vi.fn(),
  getAiModelId: () => "gpt-4o-test",
}));
vi.mock("./rewrite-query", () => ({ rewriteSearchQuery: vi.fn() }));

const mockSearch = vi.mocked(searchKnowledgePhased);
const mockGenerate = vi.mocked(generateStructuredOutputWithUsage);
const mockRewrite = vi.mocked(rewriteSearchQuery);
const USAGE = { inputTokens: 100, outputTokens: 40, totalTokens: 140 };

function maakFaseResultaat(
  hits: SearchHit[],
  overrides: Partial<PhasedSearchResultaat> = {}
): PhasedSearchResultaat {
  return {
    hits,
    fase: "core",
    aantalPerPrioriteit: { core: hits.length, secondary: 0, reference: 0 },
    aantalVoldoendePerPrioriteit: { core: hits.length, secondary: 0, reference: 0 },
    ...overrides,
  };
}

function maakSeed() {
  return {
    "knowledge-sources": [
      {
        id: 1,
        title: "Kennisbasis MijnLeerlijn",
        type: "intern_document",
        aiSummary: "Achtergrondverhaal over de cyclus van MijnLeerlijn.",
        chapters: [],
      },
    ],
  };
}

beforeEach(() => {
  mockSearch.mockReset();
  mockGenerate.mockReset();
  mockRewrite.mockReset();
  mockRewrite.mockImplementation(async (question) => question);
});

describe("runAssistantEvaluation — volledige diagnostiek bij een goed antwoord", () => {
  it("geeft originele vraag, herschreven zoekvraag, fase, hits (met priority/bronrol), context en antwoord terug", async () => {
    mockRewrite.mockResolvedValue("hoofdgebiedprofiel aanmaken");
    mockSearch.mockResolvedValue(
      maakFaseResultaat(
        [
          {
            type: "knowledge-source",
            id: 1,
            title: "Kennisbasis MijnLeerlijn",
            similarity: 0.82,
            reason: "hoge overlap",
            priority: "core",
            bronrol: "background-model",
          },
        ],
        { fase: "core" }
      )
    );
    mockGenerate.mockResolvedValue({
      object: {
        hasAnswer: true,
        answer: "Er zijn meerdere routes (Bron 1).",
        reasoning: "Gebaseerd op Bron 1.",
      },
      usage: USAGE,
    });
    const { payload } = maakFakePayload(maakSeed());

    const uitkomst = await runAssistantEvaluation(payload, "Hoe koppel ik doelen aan leerlingen?");

    expect(uitkomst.type).toBe("answered");
    if (uitkomst.type !== "answered" && uitkomst.type !== "no-answer") return;
    expect(uitkomst.question).toBe("Hoe koppel ik doelen aan leerlingen?");
    expect(uitkomst.rewrittenQuery).toBe("hoofdgebiedprofiel aanmaken");
    expect(uitkomst.retrievalFase).toBe("core");
    expect(uitkomst.hits).toEqual([
      {
        type: "knowledge-source",
        refId: 1,
        title: "Kennisbasis MijnLeerlijn",
        chapterTitle: undefined,
        similarity: 0.82,
        priority: "core",
        bronrol: "background-model",
      },
    ]);
    expect(uitkomst.contextText).toContain("Kennisbasis MijnLeerlijn");
    expect(uitkomst.contextText).toContain("achtergrondmodel"); // bronrol-label, zie build-context.ts
    expect(uitkomst.hasAnswer).toBe(true);
    expect(uitkomst.answer).toBe("Er zijn meerdere routes (Bron 1).");
    expect(uitkomst.sources).toHaveLength(1);
    expect(uitkomst.model).toBe("gpt-4o-test");
  });
});

describe("runAssistantEvaluation — geen antwoord (onvoldoende bron)", () => {
  it("geeft hasAnswer=false en lege sources terug, maar de hits blijven zichtbaar voor diagnose", async () => {
    mockSearch.mockResolvedValue(maakFaseResultaat([], { fase: "core+secondary+reference" }));
    const { payload } = maakFakePayload(maakSeed());

    const uitkomst = await runAssistantEvaluation(payload, "Wat kost een abonnement?");

    expect(uitkomst.type).toBe("no-answer");
    if (uitkomst.type !== "answered" && uitkomst.type !== "no-answer") return;
    expect(uitkomst.hasAnswer).toBe(false);
    expect(uitkomst.sources).toHaveLength(0);
    expect(uitkomst.hits).toHaveLength(0);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("runAssistantEvaluation — fouten", () => {
  it("geeft een failed-uitkomst terug wanneer de retrievalfase zelf mislukt", async () => {
    mockSearch.mockRejectedValue(new Error("Ontbrekende verplichte omgevingsvariabele: OPENAI_API_KEY."));
    const { payload } = maakFakePayload(maakSeed());

    const uitkomst = await runAssistantEvaluation(payload, "vraag");

    expect(uitkomst).toMatchObject({
      type: "failed",
      foutmelding: expect.stringContaining("OPENAI_API_KEY"),
    });
  });

  it("geeft een failed-uitkomst terug wanneer de AI-antwoordaanroep zelf mislukt", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        { type: "knowledge-source", id: 1, title: "Kennisbasis MijnLeerlijn", similarity: 0.9, reason: "" },
      ])
    );
    mockGenerate.mockRejectedValue(new Error("OpenAI: server error"));
    const { payload } = maakFakePayload(maakSeed());

    const uitkomst = await runAssistantEvaluation(payload, "vraag");

    expect(uitkomst).toEqual({ type: "failed", foutmelding: "OpenAI: server error" });
  });
});
