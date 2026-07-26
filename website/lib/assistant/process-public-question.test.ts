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

function lexicalMet(tekst: string): unknown {
  return { root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: tekst }] }] } };
}

function maakHandleidingSeed() {
  return {
    ...maakSeed(),
    handleidingen: [
      {
        id: 10,
        titel: "Hoofdgebiedprofiel aanmaken",
        slug: "hoofdgebiedprofiel-aanmaken",
        korteOmschrijving: "Uitleg.",
        stappen: [
          {
            id: "stap-a",
            titel: "Open Beheer",
            uitleg: lexicalMet("Ga naar Beheer en kies Hoofdgebiedprofielen."),
            media: [{ bestand: { url: "/media/screenshot-1.png", altText: "Het Beheer-menu" }, onderschrift: "Het menu" }],
          },
          {
            id: "stap-b",
            titel: "Maak profiel aan",
            uitleg: lexicalMet("Klik rechtsboven op Nieuw profiel."),
          },
          { id: "stap-verborgen", titel: "Verborgen stap", uitleg: lexicalMet("Tekst."), verborgen: true },
        ],
      },
    ],
  };
}

describe("processPublicQuestion — relevante handleidingstappen (Handleidingbouwer)", () => {
  it("geeft de getoonde stap(pen) terug met afbeelding, onderschrift, alt-tekst, stapnummer en een link naar de volledige handleiding", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        {
          type: "handleiding-step",
          id: 10,
          title: "Hoofdgebiedprofiel aanmaken",
          chapterTitle: "Open Beheer",
          stepId: "stap-a",
          similarity: 0.9,
          reason: "",
        },
      ])
    );
    mockGenerate.mockResolvedValue({
      object: { hasAnswer: true, answer: "Ga naar Beheer en kies Hoofdgebiedprofielen.", reasoning: "..." },
      usage: USAGE,
    });
    const { payload } = maakFakePayload(maakHandleidingSeed());

    const uitkomst = await processPublicQuestion(payload, { question: "Hoe open ik hoofdgebiedprofielen?" });

    expect(uitkomst.type).toBe("answered");
    if (uitkomst.type !== "answered" && uitkomst.type !== "no-answer") return;
    expect(uitkomst.steps).toEqual([
      {
        handleidingId: 10,
        handleidingSlug: "hoofdgebiedprofiel-aanmaken",
        handleidingTitel: "Hoofdgebiedprofiel aanmaken",
        handleidingUrl: "/handleidingen/hoofdgebiedprofiel-aanmaken",
        stepId: "stap-a",
        stepNummer: 1,
        titel: "Open Beheer",
        uitleg: "Ga naar Beheer en kies Hoofdgebiedprofielen.",
        images: [{ url: "/media/screenshot-1.png", caption: "Het menu", alt: "Het Beheer-menu" }],
      },
    ]);
  });

  it("toont alleen de relevant gevonden stap, niet de hele handleiding — stap 2 komt niet mee als alleen stap 1 gevonden is", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        {
          type: "handleiding-step",
          id: 10,
          title: "Hoofdgebiedprofiel aanmaken",
          chapterTitle: "Open Beheer",
          stepId: "stap-a",
          similarity: 0.9,
          reason: "",
        },
      ])
    );
    mockGenerate.mockResolvedValue({
      object: { hasAnswer: true, answer: "Antwoord.", reasoning: "..." },
      usage: USAGE,
    });
    const { payload } = maakFakePayload(maakHandleidingSeed());

    const uitkomst = await processPublicQuestion(payload, { question: "vraag" });

    if (uitkomst.type !== "answered" && uitkomst.type !== "no-answer") return;
    expect(uitkomst.steps).toHaveLength(1);
    expect(uitkomst.steps[0]?.stepId).toBe("stap-a");
  });

  it("laat een verborgen stap nooit zien, zelfs niet als de retrieval 'm (onterecht) zou teruggeven — verdediging in diepte", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        {
          type: "handleiding-step",
          id: 10,
          title: "Hoofdgebiedprofiel aanmaken",
          chapterTitle: "Verborgen stap",
          stepId: "stap-verborgen",
          similarity: 0.9,
          reason: "",
        },
      ])
    );
    mockGenerate.mockResolvedValue({
      object: { hasAnswer: true, answer: "Antwoord.", reasoning: "..." },
      usage: USAGE,
    });
    const { payload } = maakFakePayload(maakHandleidingSeed());

    const uitkomst = await processPublicQuestion(payload, { question: "vraag" });

    if (uitkomst.type !== "answered" && uitkomst.type !== "no-answer") return;
    expect(uitkomst.steps).toEqual([]);
  });

  it("geeft een lege images-lijst voor een stap zonder screenshot", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        {
          type: "handleiding-step",
          id: 10,
          title: "Hoofdgebiedprofiel aanmaken",
          chapterTitle: "Maak profiel aan",
          stepId: "stap-b",
          similarity: 0.9,
          reason: "",
        },
      ])
    );
    mockGenerate.mockResolvedValue({
      object: { hasAnswer: true, answer: "Antwoord.", reasoning: "..." },
      usage: USAGE,
    });
    const { payload } = maakFakePayload(maakHandleidingSeed());

    const uitkomst = await processPublicQuestion(payload, { question: "vraag" });

    if (uitkomst.type !== "answered" && uitkomst.type !== "no-answer") return;
    expect(uitkomst.steps[0]?.images).toEqual([]);
  });

  it("geeft geen stappen terug bij 'geen antwoord'", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        {
          type: "handleiding-step",
          id: 10,
          title: "Hoofdgebiedprofiel aanmaken",
          stepId: "stap-a",
          similarity: 0.1,
          reason: "",
        },
      ])
    );
    const { payload } = maakFakePayload(maakHandleidingSeed());

    const uitkomst = await processPublicQuestion(payload, { question: "onduidelijke vraag" });

    if (uitkomst.type !== "answered" && uitkomst.type !== "no-answer") return;
    expect(uitkomst.steps).toEqual([]);
  });

  it("legt de getoonde stap ook vast op het conversatierecord (analytics-klaar, nog niet verwerkt)", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        {
          type: "handleiding-step",
          id: 10,
          title: "Hoofdgebiedprofiel aanmaken",
          chapterTitle: "Open Beheer",
          stepId: "stap-a",
          similarity: 0.9,
          reason: "",
        },
      ])
    );
    mockGenerate.mockResolvedValue({
      object: { hasAnswer: true, answer: "Antwoord.", reasoning: "..." },
      usage: USAGE,
    });
    const { payload, collection } = maakFakePayload(maakHandleidingSeed());

    await processPublicQuestion(payload, { question: "vraag" });

    const record = collection("assistant-conversations")[0]!;
    expect(record.steps).toEqual([{ handleidingId: 10, stepId: "stap-a", stepNummer: 1 }]);
  });
});
