import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { adapteerVoorVariant } from "./variant-adapt";
import { searchKnowledgePhased } from "@/lib/embeddings/similarity-search";
import { haalAchtergrondKennisbasisVoorVariant } from "@/lib/assistant/kennisbasis-context";
import { generateChatText } from "@/services/ai-client";

vi.mock("@/lib/embeddings/similarity-search", () => ({ searchKnowledgePhased: vi.fn() }));
vi.mock("@/lib/assistant/kennisbasis-context", () => ({ haalAchtergrondKennisbasisVoorVariant: vi.fn() }));
vi.mock("@/lib/assistant/build-context", () => ({ buildContext: vi.fn().mockResolvedValue([]) }));
vi.mock("@/services/ai-client", () => ({ generateChatText: vi.fn() }));

const mockSearch = vi.mocked(searchKnowledgePhased);
const mockAchtergrond = vi.mocked(haalAchtergrondKennisbasisVoorVariant);
const mockChat = vi.mocked(generateChatText);

describe("adapteerVoorVariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockResolvedValue({ hits: [], fase: "core", aantalPerPrioriteit: { core: 0, secondary: 0, reference: 0 }, aantalVoldoendePerPrioriteit: { core: 0, secondary: 0, reference: 0 } });
    mockAchtergrond.mockResolvedValue(null);
    mockChat.mockResolvedValue("aangepaste tekst");
  });

  it("roept retrieval en achtergrondkennis exact één keer aan, met exact de opgegeven doelvariant — nooit meerdere varianten tegelijk", async () => {
    const payload = {} as Payload;
    await adapteerVoorVariant(payload, {
      masterTitel: "Doelen plannen",
      masterTekst: "Zo plan je doelen.",
      targetVariantId: "montessori-variant-id",
      targetVariantNaam: "MijnMonti",
      terminologyDictionary: [{ centralTerm: "leerdoel", variantTerm: "ontwikkelingsdoel" }],
    });

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith(payload, expect.objectContaining({ variantId: "montessori-variant-id" }));
    expect(mockAchtergrond).toHaveBeenCalledTimes(1);
    expect(mockAchtergrond).toHaveBeenCalledWith(payload, "montessori-variant-id");
  });

  it("neemt de terminologielijst van de doelvariant op in de systeemprompt", async () => {
    const payload = {} as Payload;
    await adapteerVoorVariant(payload, {
      masterTitel: "Doelen plannen",
      masterTekst: "Zo plan je doelen.",
      targetVariantId: "v1",
      targetVariantNaam: "MijnMonti",
      terminologyDictionary: [{ centralTerm: "leerdoel", variantTerm: "ontwikkelingsdoel" }],
    });

    const call = mockChat.mock.calls[0]?.[0];
    expect(call?.systemPrompt).toContain("leerdoel");
    expect(call?.systemPrompt).toContain("ontwikkelingsdoel");
    expect(call?.systemPrompt).toContain("MijnMonti");
    expect(call?.systemPrompt).not.toContain("simpelweg");
  });

  it("stuurt de mastertekst als gebruikersbericht mee", async () => {
    const payload = {} as Payload;
    await adapteerVoorVariant(payload, {
      masterTitel: "Doelen plannen",
      masterTekst: "Zo plan je doelen precies.",
      targetVariantId: "v1",
      targetVariantNaam: "MijnMonti",
      terminologyDictionary: [],
    });

    const call = mockChat.mock.calls[0]?.[0];
    expect(call?.messages[0]?.content).toContain("Zo plan je doelen precies.");
  });
});
