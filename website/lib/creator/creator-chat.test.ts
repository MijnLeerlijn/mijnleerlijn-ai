import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { creatorChat } from "./creator-chat";
import { searchKnowledgePhased } from "@/lib/embeddings/similarity-search";
import { buildContext } from "@/lib/assistant/build-context";
import { haalAchtergrondKennisbasisVoorVariant } from "@/lib/assistant/kennisbasis-context";
import { generateStructuredOutput } from "@/services/ai-client";

vi.mock("@/lib/embeddings/similarity-search", () => ({ searchKnowledgePhased: vi.fn() }));
vi.mock("@/lib/assistant/build-context", () => ({ buildContext: vi.fn() }));
vi.mock("@/lib/assistant/kennisbasis-context", () => ({ haalAchtergrondKennisbasisVoorVariant: vi.fn() }));
vi.mock("@/services/ai-client", () => ({ generateStructuredOutput: vi.fn() }));

const mockSearch = vi.mocked(searchKnowledgePhased);
const mockBuildContext = vi.mocked(buildContext);
const mockAchtergrond = vi.mocked(haalAchtergrondKennisbasisVoorVariant);
const mockGenerate = vi.mocked(generateStructuredOutput);

const LEGE_ZOEKRESULTAAT = {
  hits: [],
  fase: "core" as const,
  aantalPerPrioriteit: { core: 0, secondary: 0, reference: 0 },
  aantalVoldoendePerPrioriteit: { core: 0, secondary: 0, reference: 0 },
};

function maakPayload(findResultaat: { docs: unknown[] } = { docs: [] }): Payload {
  return { find: vi.fn().mockResolvedValue(findResultaat) } as unknown as Payload;
}

const BASIS_OPTIES = {
  documentTitel: "Doelen plannen",
  documentTekst: "Bestaande documenttekst.",
  berichten: [{ role: "user" as const, content: "Schrijf een intro." }],
  knowledgeType: "pedagogisch" as const,
};

describe("creatorChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockResolvedValue(LEGE_ZOEKRESULTAAT);
    mockBuildContext.mockResolvedValue([]);
    mockAchtergrond.mockResolvedValue(null);
    mockGenerate.mockResolvedValue({ assistantMessage: "Ik heb het document aangepast.", documentContent: "Volledige nieuwe documenttekst." });
  });

  it("geeft assistantMessage en documentContent gescheiden terug — nooit de documenttekst in het chatbericht (bug #2)", async () => {
    const resultaat = await creatorChat(maakPayload(), BASIS_OPTIES);

    expect(resultaat.assistantMessage).toBe("Ik heb het document aangepast.");
    expect(resultaat.documentContent).toBe("Volledige nieuwe documenttekst.");
  });

  it("laat documentContent op null staan bij een puur conversationeel antwoord (geen documentwijziging)", async () => {
    mockGenerate.mockResolvedValue({ assistantMessage: "Die kennisbron gebruik ik dan niet meer.", documentContent: null });

    const resultaat = await creatorChat(maakPayload(), BASIS_OPTIES);

    expect(resultaat.documentContent).toBeNull();
  });

  it("geeft de systeemprompt een expliciete platte-tekst-instructie mee (bug #4 — geen markdown/JSON in AI-output)", async () => {
    await creatorChat(maakPayload(), BASIS_OPTIES);

    const call = mockGenerate.mock.calls[0]?.[0];
    expect(call?.systemPrompt).toContain("GEEN markdown-opmaak");
    expect(call?.systemPrompt).toContain("GEEN JSON");
  });

  it("verbiedt het verzinnen van softwarefunctionaliteit bij knowledgeType 'product'", async () => {
    await creatorChat(maakPayload(), { ...BASIS_OPTIES, knowledgeType: "product" });

    const call = mockGenerate.mock.calls[0]?.[0];
    expect(call?.systemPrompt).toMatch(/verzin NOOIT/i);
  });

  it("sluit expliciet uitgesloten bronnen uit van de prompt-context (bug #3 — verwijderde kennis mag niet terugkomen)", async () => {
    mockBuildContext.mockResolvedValue([
      { index: 1, type: "knowledge-source", label: "Handleiding", title: "Groepsplan aanmaken", text: "Ga naar Groepen > Nieuw.", similarity: 0.9, refCollection: "knowledge-sources", refId: 5, url: "/admin/collections/knowledge-sources/5" },
      { index: 2, type: "knowledge-source", label: "Handleiding", title: "Leerling toevoegen", text: "Ga naar Leerlingen > Nieuw.", similarity: 0.8, refCollection: "knowledge-sources", refId: 6, url: "/admin/collections/knowledge-sources/6" },
    ]);

    const resultaat = await creatorChat(maakPayload(), { ...BASIS_OPTIES, uitgeslotenRefs: [{ refCollection: "knowledge-sources", refId: 5 }] });

    const call = mockGenerate.mock.calls[0]?.[0];
    expect(call?.systemPrompt).not.toContain("Groepsplan aanmaken");
    expect(call?.systemPrompt).toContain("Leerling toevoegen");
    expect(resultaat.gebruikteKennis.some((k) => k.refId === 5)).toBe(false);
    expect(resultaat.gebruikteKennis.some((k) => k.refId === 6)).toBe(true);
  });

  it("neemt handmatig gepinde kennis op die nog niet in de automatische resultaten zit", async () => {
    const payload = maakPayload({ docs: [{ id: 7, title: "Rapportages exporteren", content: "Ga naar Rapportages > Exporteren." }] });

    const resultaat = await creatorChat(payload, { ...BASIS_OPTIES, gepindeKnowledgeSourceIds: [7] });

    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({ collection: "knowledge-sources", where: { id: { in: [7] } } }));
    expect(resultaat.gebruikteKennis.some((k) => k.refId === 7 && k.title === "Rapportages exporteren")).toBe(true);
  });

  it("voegt geen dubbele kennis toe wanneer een gepinde bron al automatisch gevonden is", async () => {
    mockBuildContext.mockResolvedValue([
      { index: 1, type: "knowledge-source", label: "Handleiding", title: "Rapportages exporteren", text: "Ga naar Rapportages > Exporteren.", similarity: 0.9, refCollection: "knowledge-sources", refId: 3, url: "/admin/collections/knowledge-sources/3" },
    ]);
    const payload = maakPayload();

    const resultaat = await creatorChat(payload, { ...BASIS_OPTIES, gepindeKnowledgeSourceIds: [3] });

    expect(payload.find).not.toHaveBeenCalled();
    expect(resultaat.gebruikteKennis.filter((k) => k.refId === 3)).toHaveLength(1);
  });

  it("stuurt de huidige documenttekst mee in de prompt", async () => {
    await creatorChat(maakPayload(), { ...BASIS_OPTIES, documentTekst: "EEN-HERKENBARE-BESTAANDE-ZIN." });

    const call = mockGenerate.mock.calls[0]?.[0];
    expect(call?.systemPrompt).toContain("EEN-HERKENBARE-BESTAANDE-ZIN.");
  });

  it("stuurt de laatste gebruikersinstructie als userPrompt, eerdere berichten als gespreksgeschiedenis in de systeemprompt", async () => {
    await creatorChat(maakPayload(), {
      ...BASIS_OPTIES,
      berichten: [
        { role: "user", content: "Schrijf een intro over kerndoelen." },
        { role: "assistant", content: "Ik heb een intro geschreven." },
        { role: "user", content: "Maak de toon informeler." },
      ],
    });

    const call = mockGenerate.mock.calls[0]?.[0];
    expect(call?.userPrompt).toContain("Maak de toon informeler.");
    expect(call?.userPrompt).not.toContain("Schrijf een intro over kerndoelen.");
    expect(call?.systemPrompt).toContain("Schrijf een intro over kerndoelen.");
  });
});
