import { describe, it, expect, vi, beforeEach } from "vitest";
import { processPublicQuestion } from "./process-public-question";
import { maakFakePayload } from "@/lib/support/fake-payload";
import {
  searchKnowledgePhased,
  type SearchHit,
  type PhasedSearchResultaat,
} from "@/lib/embeddings/similarity-search";
import { generateStructuredOutputWithUsage } from "@/services/ai-client";
import { rewriteSearchQuery } from "./rewrite-query";

// Zelfde mockingpatroon als lib/assistant/process-question.test.ts — deze
// publieke variant doorloopt dezelfde pijplijnstappen, maar test hier
// specifiek het gedrag dat ANDERS is: geen userId nodig, `manuals` bevat
// uitsluitend zichtbare bronnen (gededupliceerd), en het aangemaakte
// gesprek heeft source "helpdesk" + user null.
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
        title: "Handleiding profielen",
        type: "handleiding",
        zichtbaar: true,
        file: 55,
        aiSummary: "Ga naar Instellingen > Profielen.",
        chapters: [
          { title: "01 Inleiding", summary: "Intro." },
          { title: "02 Stappen", summary: "Stappen." },
        ],
      },
      {
        id: 2,
        title: "Niet-zichtbare interne bron",
        type: "intern_document",
        zichtbaar: false,
        aiSummary: "Achtergrondinfo.",
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

describe("processPublicQuestion — publiek-veilige bronnenlijst", () => {
  it("dedupliceert meerdere geciteerde hoofdstukken van dezelfde bron tot één publieke 'manual'", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        {
          type: "knowledge-source-chapter",
          id: 1,
          title: "Handleiding profielen",
          chapterTitle: "01 Inleiding",
          similarity: 0.9,
          reason: "",
        },
        {
          type: "knowledge-source-chapter",
          id: 1,
          title: "Handleiding profielen",
          chapterTitle: "02 Stappen",
          similarity: 0.85,
          reason: "",
        },
      ])
    );
    mockGenerate.mockResolvedValue({
      object: { hasAnswer: true, answer: "Ga naar Instellingen > Profielen.", reasoning: "..." },
      usage: USAGE,
    });
    const { payload, collection } = maakFakePayload(maakSeed());

    const uitkomst = await processPublicQuestion(payload, { question: "Hoe maak ik een profiel?" });

    expect(uitkomst.type).toBe("answered");
    if (uitkomst.type !== "answered" && uitkomst.type !== "no-answer") return;
    expect(uitkomst.manuals).toEqual([{ id: 1, title: "Handleiding profielen", hasFile: true }]);

    const record = collection("assistant-conversations")[0]!;
    expect(record.source).toBe("helpdesk");
    expect(record.user).toBeNull();
  });

  it("regressie: hasAnswer staat expliciet op de respons (los van `type`) — HelpdeskChat.tsx beslist hierop of het contactformulier automatisch verschijnt", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        { type: "knowledge-source", id: 1, title: "Handleiding profielen", similarity: 0.9, reason: "" },
      ])
    );
    mockGenerate.mockResolvedValue({
      object: { hasAnswer: true, answer: "Een echt antwoord.", reasoning: "..." },
      usage: USAGE,
    });
    const { payload } = maakFakePayload(maakSeed());

    const uitkomst = await processPublicQuestion(payload, { question: "vraag" });

    expect(uitkomst.type).toBe("answered");
    if (uitkomst.type !== "answered" && uitkomst.type !== "no-answer") return;
    expect(uitkomst.hasAnswer).toBe(true);
  });

  it("verbergt een geciteerde bron die niet 'zichtbaar' is gemarkeerd — de AI mag 'm wel gebruiken om te antwoorden, maar hij verschijnt niet in de publieke lijst", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        { type: "knowledge-source", id: 2, title: "Niet-zichtbare interne bron", similarity: 0.8, reason: "" },
      ])
    );
    mockGenerate.mockResolvedValue({
      object: { hasAnswer: true, answer: "Antwoord gebaseerd op de interne bron.", reasoning: "..." },
      usage: USAGE,
    });
    const { payload } = maakFakePayload(maakSeed());

    const uitkomst = await processPublicQuestion(payload, { question: "vraag" });

    expect(uitkomst.type).toBe("answered");
    if (uitkomst.type !== "answered" && uitkomst.type !== "no-answer") return;
    expect(uitkomst.manuals).toEqual([]);
    expect(uitkomst.answer).toContain("interne bron");
  });

  it("geeft geen manuals terug bij 'geen antwoord', ook niet als er wel zichtbare bronnen gevonden waren", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        { type: "knowledge-source", id: 1, title: "Handleiding profielen", similarity: 0.1, reason: "" },
      ])
    );
    const { payload } = maakFakePayload(maakSeed());

    const uitkomst = await processPublicQuestion(payload, { question: "onduidelijke vraag" });

    expect(uitkomst.type).toBe("no-answer");
    if (uitkomst.type !== "answered" && uitkomst.type !== "no-answer") return;
    expect(uitkomst.hasAnswer).toBe(false);
    expect(uitkomst.manuals).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("geeft een failed-uitkomst terug wanneer de retrievalfase mislukt, zonder gesprek te loggen", async () => {
    mockSearch.mockRejectedValue(new Error("Ontbrekende verplichte omgevingsvariabele: OPENAI_API_KEY."));
    const { payload, collection } = maakFakePayload(maakSeed());

    const uitkomst = await processPublicQuestion(payload, { question: "vraag" });

    expect(uitkomst).toMatchObject({ type: "failed", foutmelding: expect.stringContaining("OPENAI_API_KEY") });
    expect(collection("assistant-conversations")).toHaveLength(0);
  });
});
