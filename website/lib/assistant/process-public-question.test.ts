import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Variant } from "@/types/variant";
import { processPublicQuestion } from "./process-public-question";
import { maakFakePayload } from "@/lib/support/fake-payload";

// Multi-brand variants (2026-07-30): `variant` is nu verplicht in
// processPublicQuestion() se opties — deze tests testen de bestaande
// (variant-onafhankelijke) pijplijnlogica, dus één neutrale mock-variant
// voor alle aanroepen hieronder; variant-scoping zelf wordt apart getest in
// similarity-search.test.ts/bepaal-intentie.test.ts.
const MOCK_VARIANT: Variant = {
  id: "1",
  slug: "mijnleerlijn",
  name: "MijnLeerlijn",
  status: "actief",
  actief: true,
  domain: { type: "custom_domain", value: "mijnleerlijn.chat", domainStatus: "custom_domain" },
  branding: {
    logoUrl: "/brand/logo-kleur.svg",
    accentColor: "#1588c9",
    productName: "MijnLeerlijn",
    tagline: "Onderwijs vanuit Inzicht",
    isPlaceholder: false,
  },
  educationType: "algemeen",
  terminologyDictionary: [],
  websiteTeksten: {
    welkomsttitel: "Waar kunnen we je mee helpen?",
    welkomsttekst: "Stel je vraag aan de MijnLeerlijn Assistent.",
    zoekveldPlaceholder: "Beschrijf zo duidelijk mogelijk waar je tegenaan loopt…",
    helpdeskIntro: "Hoe duidelijker je vraag, hoe beter het antwoord.",
    contactTekst: "Kom je er niet uit? Vul het formulier in.",
    footerTekst: "© 2026 MijnLeerlijn | Onderdeel van sCoolsuite B.V. | Privacy",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "system",
};
import {
  searchKnowledgePhased,
  type SearchHit,
  type PhasedSearchResultaat,
} from "@/lib/embeddings/similarity-search";
import { generateStructuredOutputWithUsage, generateStructuredOutput } from "@/services/ai-client";
import { rewriteSearchQuery } from "./rewrite-query";

// Zelfde mockingpatroon als lib/assistant/process-question.test.ts — deze
// publieke variant doorloopt dezelfde pijplijnstappen, maar test hier
// specifiek het gedrag dat ANDERS is: geen userId nodig, `manuals` bevat
// uitsluitend zichtbare bronnen (gededupliceerd), en het aangemaakte
// gesprek heeft source "helpdesk" + user null.
vi.mock("@/lib/embeddings/similarity-search", () => ({ searchKnowledgePhased: vi.fn() }));
vi.mock("@/services/ai-client", () => ({
  generateStructuredOutputWithUsage: vi.fn(),
  // Kennisbasis MijnLeerlijn — fase 1: bepaal-intentie.ts gebruikt de
  // niet-usage-variant. Standaard "geen-match" (lege kandidaten), zodat
  // bestaande tests hieronder die geen kennisbasis-onderwerpen zaaien
  // ongewijzigd blijven werken — bepaal-intentie.ts slaat deze aanroep
  // sowieso over als er geen gepubliceerde onderwerpen zijn.
  generateStructuredOutput: vi.fn(),
  getAiModelId: () => "gpt-4o-test",
}));
vi.mock("./rewrite-query", () => ({ rewriteSearchQuery: vi.fn() }));

const mockSearch = vi.mocked(searchKnowledgePhased);
const mockGenerate = vi.mocked(generateStructuredOutputWithUsage);
const mockIntentie = vi.mocked(generateStructuredOutput);
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
  mockIntentie.mockReset();
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

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "Hoe maak ik een profiel?" });

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

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

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

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

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

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "onduidelijke vraag" });

    expect(uitkomst.type).toBe("no-answer");
    if (uitkomst.type !== "answered" && uitkomst.type !== "no-answer") return;
    expect(uitkomst.hasAnswer).toBe(false);
    expect(uitkomst.manuals).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("geeft een failed-uitkomst terug wanneer de retrievalfase mislukt, en logt de mislukking best-effort (AI Verbetercentrum)", async () => {
    mockSearch.mockRejectedValue(new Error("Ontbrekende verplichte omgevingsvariabele: OPENAI_API_KEY."));
    const { payload, collection } = maakFakePayload(maakSeed());

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

    expect(uitkomst).toMatchObject({ type: "failed", foutmelding: expect.stringContaining("OPENAI_API_KEY") });
    const record = collection("assistant-conversations")[0]!;
    expect(record.hasAnswer).toBe(false);
    expect(record.reasoning).toContain("OPENAI_API_KEY");
  });

  it("logt ook een mislukking wanneer de antwoordgeneratie zelf faalt (na een geslaagde retrieval)", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        { type: "knowledge-source", id: 1, title: "Handleiding profielen", similarity: 0.9, reason: "" },
      ])
    );
    mockGenerate.mockRejectedValue(new Error("OpenAI: server error"));
    const { payload, collection } = maakFakePayload(maakSeed());

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

    expect(uitkomst.type).toBe("failed");
    expect(collection("assistant-conversations")).toHaveLength(1);
  });
});

describe("processPublicQuestion — non-blocking logging (AI Verbetercentrum)", () => {
  it("geeft het echte antwoord terug met conversationId null als het wegschrijven van het gesprek zelf mislukt", async () => {
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
    payload.create = vi.fn().mockRejectedValue(new Error("database niet bereikbaar"));

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

    expect(uitkomst).toMatchObject({ type: "answered", conversationId: null, answer: "Een echt antwoord." });
  });

  it("geeft conversationId null terug voor een clarification-antwoord als loggen mislukt, zonder de vraag te breken", async () => {
    const { payload } = maakFakePayload(
      maakKennisbasisSeed([
        { id: 1, onderwerp: "A", officieleTerm: "A-term", status: "gepubliceerd" },
        { id: 2, onderwerp: "B", officieleTerm: "B-term", status: "gepubliceerd" },
      ])
    );
    mockIntentie.mockResolvedValue({
      kandidaten: [1, 2],
      gekozenId: null,
      verduidelijkingsvraag: "Bedoel je A of B?",
      gebruikteSynoniem: null,
    });
    payload.create = vi.fn().mockRejectedValue(new Error("database niet bereikbaar"));

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "ambigue vraag" });

    expect(uitkomst).toEqual({ type: "clarification", conversationId: null, question: "Bedoel je A of B?" });
  });
});

describe("processPublicQuestion — question/previousQuestion en AI Verbetercentrum-velden", () => {
  it("slaat question en previousQuestion apart op i.p.v. samengevoegd", async () => {
    mockSearch.mockResolvedValue(maakFaseResultaat([]));
    mockGenerate.mockResolvedValue({ object: { hasAnswer: false, answer: "", reasoning: "..." }, usage: USAGE });
    const { payload, collection } = maakFakePayload(maakSeed());

    await processPublicQuestion(payload, { variant: MOCK_VARIANT,
      question: "en aan meerdere?",
      previousQuestion: "Hoe koppel ik doelen?",
    });

    const record = collection("assistant-conversations")[0]!;
    expect(record.question).toBe("en aan meerdere?");
    expect(record.previousQuestion).toBe("Hoe koppel ik doelen?");
  });

  it("legt intentieType, gekoppeld onderwerp, kandidaten en officiële term vast bij een opgelost onderwerp", async () => {
    const { payload, collection } = maakFakePayload(
      maakKennisbasisSeed([
        { id: 1, onderwerp: "A", officieleTerm: "Leerdoel toevoegen aan leerling", status: "gepubliceerd" },
      ])
    );
    mockIntentie.mockResolvedValue({
      kandidaten: [1],
      gekozenId: 1,
      verduidelijkingsvraag: null,
      gebruikteSynoniem: "doelen",
    });
    mockSearch.mockResolvedValue(maakFaseResultaat([]));
    mockGenerate.mockResolvedValue({ object: { hasAnswer: false, answer: "", reasoning: "..." }, usage: USAGE });

    await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "Hoe koppel ik een leerling aan doelen?" });

    const record = collection("assistant-conversations")[0]!;
    expect(record.intentieType).toBe("opgelost");
    expect(record.kennisbasisOnderwerp).toBe(1);
    expect(record.kennisbasisKandidaten).toEqual([1]);
    expect(record.gebruikteOfficieleTerm).toBe("Leerdoel toevoegen aan leerling");
    expect(record.gebruikteSynoniem).toBe("doelen");
    expect(record.verbeterStatus).toBe("nieuw");
  });

  it("zet geenHandleidingGevonden op true als er geen manuals en geen stappen gevonden zijn", async () => {
    mockSearch.mockResolvedValue(maakFaseResultaat([]));
    mockGenerate.mockResolvedValue({ object: { hasAnswer: false, answer: "", reasoning: "..." }, usage: USAGE });
    const { payload, collection } = maakFakePayload(maakSeed());

    await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

    const record = collection("assistant-conversations")[0]!;
    expect(record.geenHandleidingGevonden).toBe(true);
  });

  it("zet geenHandleidingGevonden op false zodra er een zichtbare handleiding gevonden is", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        { type: "knowledge-source", id: 1, title: "Handleiding profielen", similarity: 0.9, reason: "" },
      ])
    );
    mockGenerate.mockResolvedValue({
      object: { hasAnswer: true, answer: "Antwoord.", reasoning: "..." },
      usage: USAGE,
    });
    const { payload, collection } = maakFakePayload(maakSeed());

    await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

    const record = collection("assistant-conversations")[0]!;
    expect(record.geenHandleidingGevonden).toBe(false);
  });
});

// Kennisbasis MijnLeerlijn — Fase 4 (2026-07-28): de centrale kennisbasis
// wordt bij elke (niet-"onduidelijk") vraag opgehaald en, indien
// gepubliceerd, gegarandeerd meegestuurd + gelogd — los van de vastgestelde
// intentie/officiële term. lib/support/fake-payload.ts kent geen
// findGlobal(), dus payload.findGlobal is standaard undefined — precies het
// "nog nooit gepubliceerd"-scenario van haalCentraleKennisbasisOp() (geeft
// null terug, faalt nooit hard). Voor het "wél gepubliceerd"-scenario wordt
// findGlobal per test op de fake payload gezet.
describe("processPublicQuestion — centrale Kennisbasis MijnLeerlijn (Fase 4)", () => {
  it("logt centraleKennisbasisGebruikt: false wanneer de Global nog niet gepubliceerd is (standaard fake-payload-gedrag)", async () => {
    mockSearch.mockResolvedValue(maakFaseResultaat([]));
    mockGenerate.mockResolvedValue({ object: { hasAnswer: false, answer: "", reasoning: "..." }, usage: USAGE });
    const { payload, collection } = maakFakePayload(maakSeed());

    await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

    const record = collection("assistant-conversations")[0]!;
    expect(record.centraleKennisbasisGebruikt).toBe(false);
    expect(record.centraleKennisbasisVersion).toBeNull();
    expect(record.tegenstrijdigheid).toBeNull();
  });

  it("haalt de centrale kennisbasis nooit op en logt de standaardwaarden bij een 'onduidelijk'-verduidelijkingsvraag", async () => {
    const { payload, collection } = maakFakePayload(
      maakKennisbasisSeed([
        { id: 1, onderwerp: "A", officieleTerm: "Term A", status: "gepubliceerd" },
        { id: 2, onderwerp: "B", officieleTerm: "Term B", status: "gepubliceerd" },
      ])
    );
    const findGlobalSpy = vi.fn();
    (payload as unknown as { findGlobal: typeof findGlobalSpy }).findGlobal = findGlobalSpy;
    mockIntentie.mockResolvedValue({
      kandidaten: [1, 2],
      gekozenId: null,
      verduidelijkingsvraag: "Bedoel je A of B?",
      gebruikteSynoniem: null,
    });

    await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "iets vaags" });

    expect(findGlobalSpy).not.toHaveBeenCalled();
    const record = collection("assistant-conversations")[0]!;
    expect(record.centraleKennisbasisGebruikt).toBe(false);
    expect(record.centraleKennisbasisVersion).toBeNull();
  });

  it("stuurt het gestructureerde kennisbasisblok mee naar de AI en logt gebruikt:true + de versie, wanneer de Global gepubliceerd is", async () => {
    // Minimaal één context-item met voldoende score nodig, anders wordt de
    // AI (bewust, zie de confidence-gate in answer.ts) helemaal niet
    // aangeroepen — dit test specifiek de promptinhoud, niet de gate zelf.
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        { type: "knowledge-source", id: 1, title: "Handleiding profielen", similarity: 0.9, reason: "" },
      ])
    );
    mockGenerate.mockResolvedValue({
      object: { hasAnswer: true, answer: "Antwoord.", reasoning: "...", tegenstrijdigheid: null },
      usage: USAGE,
    });
    const { payload, collection } = maakFakePayload(maakSeed());
    (payload as unknown as { findGlobal: ReturnType<typeof vi.fn> }).findGlobal = vi.fn().mockResolvedValue({
      _status: "published",
      inhoud: {
        root: {
          children: [{ type: "paragraph", children: [{ type: "text", text: "Achtergrondtekst." }] }],
        },
      },
      updatedAt: "2026-07-28T10:00:00.000Z",
    });

    await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "Wat is de visie van MijnLeerlijn?" });

    const promptAanroep = mockGenerate.mock.calls[0]![0] as { userPrompt: string };
    expect(promptAanroep.userPrompt).toContain("Centrale Kennisbasis MijnLeerlijn");
    expect(promptAanroep.userPrompt).toContain("Achtergrondtekst.");

    const record = collection("assistant-conversations")[0]!;
    expect(record.centraleKennisbasisGebruikt).toBe(true);
    expect(record.centraleKennisbasisVersion).toBe("2026-07-28T10:00:00.000Z");
  });

  it("logt een door het model gerapporteerde tegenstrijdigheid", async () => {
    mockSearch.mockResolvedValue(
      maakFaseResultaat([
        { type: "knowledge-source", id: 1, title: "Handleiding profielen", similarity: 0.9, reason: "" },
      ])
    );
    mockGenerate.mockResolvedValue({
      object: {
        hasAnswer: true,
        answer: "Antwoord, voorzichtig geformuleerd.",
        reasoning: "...",
        tegenstrijdigheid: "De kennisbasis en de handleiding spreken elkaar hier tegen.",
      },
      usage: USAGE,
    });
    const { payload, collection } = maakFakePayload(maakSeed());

    await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

    const record = collection("assistant-conversations")[0]!;
    expect(record.tegenstrijdigheid).toBe("De kennisbasis en de handleiding spreken elkaar hier tegen.");
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

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "Hoe open ik hoofdgebiedprofielen?" });

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

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

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

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

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

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

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

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "onduidelijke vraag" });

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

    await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "vraag" });

    const record = collection("assistant-conversations")[0]!;
    expect(record.steps).toEqual([{ handleidingId: 10, stepId: "stap-a", stepNummer: 1 }]);
  });
});

function maakKennisbasisSeed(onderwerpen: { id: number; [key: string]: unknown }[]) {
  return { ...maakSeed(), "kennisbasis-onderwerpen": onderwerpen };
}

describe("processPublicQuestion — Kennisbasis MijnLeerlijn intentiebepaling (fase 1)", () => {
  it("geeft een clarification-uitkomst terug en slaat retrieval/antwoordgeneratie helemaal over bij een onduidelijke vraag", async () => {
    const { payload, collection } = maakFakePayload(
      maakKennisbasisSeed([
        { id: 1, onderwerp: "A", officieleTerm: "A-term", status: "gepubliceerd" },
        { id: 2, onderwerp: "B", officieleTerm: "B-term", status: "gepubliceerd" },
      ])
    );
    mockIntentie.mockResolvedValue({
      kandidaten: [1, 2],
      gekozenId: null,
      verduidelijkingsvraag: "Bedoel je A of B?",
    });

    const uitkomst = await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "ambigue vraag" });

    expect(uitkomst).toMatchObject({ type: "clarification", question: "Bedoel je A of B?" });
    expect(mockSearch).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    const record = collection("assistant-conversations")[0]!;
    expect(record.hasAnswer).toBe(false);
  });

  it("gebruikt de officiële term van het opgeloste onderwerp als zoekvraag i.p.v. rewriteSearchQuery", async () => {
    const { payload } = maakFakePayload(
      maakKennisbasisSeed([
        { id: 1, onderwerp: "A", officieleTerm: "Leerdoel toevoegen aan leerling", status: "gepubliceerd" },
      ])
    );
    mockIntentie.mockResolvedValue({ kandidaten: [1], gekozenId: 1, verduidelijkingsvraag: null });
    mockSearch.mockResolvedValue(maakFaseResultaat([]));
    mockGenerate.mockResolvedValue({ object: { hasAnswer: false, answer: "", reasoning: "..." }, usage: USAGE });

    await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "Hoe koppel ik een leerling aan doelen?" });

    expect(mockSearch).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ query: "Leerdoel toevoegen aan leerling" })
    );
    expect(mockRewrite).not.toHaveBeenCalled();
  });

  it("valt terug op de bestaande rewriteSearchQuery-flow zonder gepubliceerde kennisbasis-onderwerpen (regressie)", async () => {
    mockSearch.mockResolvedValue(maakFaseResultaat([]));
    mockGenerate.mockResolvedValue({ object: { hasAnswer: false, answer: "", reasoning: "..." }, usage: USAGE });
    const { payload } = maakFakePayload(maakSeed());

    await processPublicQuestion(payload, { variant: MOCK_VARIANT, question: "een vraag" });

    expect(mockIntentie).not.toHaveBeenCalled();
    expect(mockRewrite).toHaveBeenCalledWith("een vraag");
  });
});
