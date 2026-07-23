import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyseThread, type ThreadVoorAnalyse } from "./analyze";
import { maakFakePayload } from "./fake-payload";
import { generateStructuredOutput } from "@/services/ai-client";

vi.mock("@/services/ai-client", () => ({
  generateStructuredOutput: vi.fn(),
  getAiModelId: () => "gpt-4o-test",
}));

const mockGenerate = vi.mocked(generateStructuredOutput);

function maakThread(overrides: Partial<ThreadVoorAnalyse> = {}): ThreadVoorAnalyse {
  return {
    id: 1,
    subject: "Hoofdprofiel aanmaken lukt niet",
    messages: [
      {
        gmailMessageId: "m1",
        from: "ouder@voorbeeld.nl",
        sentAt: "2026-07-01T10:00:00Z",
        bodyText: "Hoe maak ik een hoofdprofiel aan?",
      },
      {
        gmailMessageId: "m2",
        from: "support@mijnleerlijn.nl",
        sentAt: "2026-07-01T11:00:00Z",
        bodyText: "Ga naar Instellingen > Profielen > Nieuw profiel.",
      },
    ],
    ...overrides,
  };
}

const basisAiOutput = {
  title: "Hoofdprofiel aanmaken",
  mainQuestion: "Hoe maak ik een hoofdprofiel aan?",
  isResolved: true,
  finalAnswer: "Ga naar Instellingen > Profielen > Nieuw profiel.",
  shortAnswer: "Ga naar Instellingen > Profielen > Nieuw profiel.",
  fullAnswer: "Ga naar Instellingen, kies Profielen en klik op Nieuw profiel toevoegen.",
  steps: [],
  category: "profielen",
  keywords: ["hoofdprofiel", "aanmaken"],
  isGeneralKnowledge: true,
  containsPersonalData: false,
  personalDataExplanation: "",
  confidenceScore: 85,
  confidenceExplanation: "Oplossing staat expliciet in het antwoord van support.",
};

beforeEach(() => {
  mockGenerate.mockReset();
});

describe("analyseThread", () => {
  it("maakt een concept aan met status 'new' bij een duidelijk opgeloste thread met hoge betrouwbaarheid", async () => {
    mockGenerate.mockResolvedValue(basisAiOutput);
    const { payload, collection } = maakFakePayload({});

    const uitkomst = await analyseThread(payload, maakThread());

    expect(uitkomst.type).toBe("created");
    const drafts = collection("knowledge-drafts");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      title: "Hoofdprofiel aanmaken",
      status: "new",
      isGeneralKnowledge: true,
    });
  });

  it("zet status op 'review' i.p.v. 'new' bij matige betrouwbaarheid (40-69)", async () => {
    mockGenerate.mockResolvedValue({ ...basisAiOutput, confidenceScore: 55 });
    const { payload, collection } = maakFakePayload({});

    await analyseThread(payload, maakThread());

    expect(collection("knowledge-drafts")[0]).toMatchObject({ status: "review" });
  });

  it("negeert een thread zonder duidelijke oplossing (isResolved false)", async () => {
    mockGenerate.mockResolvedValue({ ...basisAiOutput, isResolved: false, finalAnswer: "" });
    const { payload, collection } = maakFakePayload({});

    const uitkomst = await analyseThread(payload, maakThread());

    expect(uitkomst).toMatchObject({ type: "ignored" });
    if (uitkomst.type === "ignored") expect(uitkomst.reden).toMatch(/onopgelost/i);
    expect(collection("knowledge-drafts")).toHaveLength(0);
  });

  it("negeert een te klantspecifieke thread (isGeneralKnowledge false)", async () => {
    mockGenerate.mockResolvedValue({ ...basisAiOutput, isGeneralKnowledge: false });
    const { payload, collection } = maakFakePayload({});

    const uitkomst = await analyseThread(payload, maakThread());

    expect(uitkomst).toMatchObject({ type: "ignored" });
    if (uitkomst.type === "ignored") expect(uitkomst.reden).toMatch(/klantspecifiek/i);
    expect(collection("knowledge-drafts")).toHaveLength(0);
  });

  it("negeert een thread met te lage betrouwbaarheid (< 40)", async () => {
    mockGenerate.mockResolvedValue({ ...basisAiOutput, confidenceScore: 20 });
    const { payload, collection } = maakFakePayload({});

    const uitkomst = await analyseThread(payload, maakThread());

    expect(uitkomst).toMatchObject({ type: "ignored" });
    expect(collection("knowledge-drafts")).toHaveLength(0);
  });

  it("scrubt e-mailadressen/telefoonnummers uit het opgeslagen concept en zet customerSpecificInformationFound", async () => {
    mockGenerate.mockResolvedValue({
      ...basisAiOutput,
      shortAnswer: "Neem contact op met jan@school.nl of 06-12345678 voor hulp.",
      fullAnswer: "Bel de helpdesk op 020-1234567 of mail naar helpdesk@school.nl.",
      containsPersonalData: true,
      personalDataExplanation: "Thread bevatte een e-mailadres en telefoonnummer van de melder.",
    });
    const { payload, collection } = maakFakePayload({});

    await analyseThread(payload, maakThread());

    const draft = collection("knowledge-drafts")[0]!;
    expect(draft.shortAnswer).not.toContain("@school.nl");
    expect(draft.shortAnswer).toContain("[e-mailadres verwijderd]");
    expect(draft.fullAnswer).not.toContain("020-1234567");
    expect(draft.customerSpecificInformationFound).toBe(true);
    expect(draft.customerSpecificInformationExplanation).toContain("telefoonnummer");
  });

  it("koppelt aan een bestaand vergelijkbaar concept i.p.v. een duplicaat aan te maken, en verhoogt de confidence-score", async () => {
    mockGenerate.mockResolvedValue(basisAiOutput);
    const { payload, collection } = maakFakePayload({
      "knowledge-drafts": [
        {
          id: 42,
          title: "Hoofdprofiel aanmaken lukt niet",
          question: "Hoe maak ik een hoofdprofiel aan?",
          category: "profielen",
          keywords: ["hoofdprofiel", "aanmaken"],
          sourceThreads: [7],
          confidenceScore: 80,
          confidenceExplanation: "Eerdere analyse.",
        },
      ],
    });

    const uitkomst = await analyseThread(payload, maakThread({ id: 99 }));

    expect(uitkomst).toEqual({ type: "updated", draftId: 42 });
    expect(collection("knowledge-drafts")).toHaveLength(1);
    const bijgewerkt = collection("knowledge-drafts")[0]!;
    expect(bijgewerkt.sourceThreads).toEqual([7, 99]);
    expect(bijgewerkt.confidenceScore).toBe(85);
  });

  it("is idempotent bij herhaalde analyse van dezelfde (of eenzelfde soort) thread: geen tweede concept", async () => {
    mockGenerate.mockResolvedValue(basisAiOutput);
    const { payload, collection } = maakFakePayload({});

    const eersteUitkomst = await analyseThread(payload, maakThread({ id: 1 }));
    const tweedeUitkomst = await analyseThread(payload, maakThread({ id: 1 }));

    expect(eersteUitkomst.type).toBe("created");
    expect(tweedeUitkomst.type).toBe("updated");
    expect(collection("knowledge-drafts")).toHaveLength(1);
  });

  it("zet de thread op 'failed' (via foutmelding) i.p.v. te crashen bij ongeldige/mislukte AI-output", async () => {
    mockGenerate.mockRejectedValue(new Error("Model gaf geen geldig JSON-object terug"));
    const { payload, collection } = maakFakePayload({});

    const uitkomst = await analyseThread(payload, maakThread());

    expect(uitkomst.type).toBe("failed");
    if (uitkomst.type === "failed") expect(uitkomst.foutmelding).toContain("AI-analyse mislukt");
    expect(collection("knowledge-drafts")).toHaveLength(0);
  });
});
