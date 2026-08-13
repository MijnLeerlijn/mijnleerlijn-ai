import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { schrijfMailAntwoord } from "./mail-reply";
import { searchKnowledgePhased } from "@/lib/embeddings/similarity-search";
import { buildContext } from "@/lib/assistant/build-context";
import { generateChatText } from "@/services/ai-client";

vi.mock("@/lib/embeddings/similarity-search", () => ({ searchKnowledgePhased: vi.fn() }));
vi.mock("@/lib/assistant/build-context", () => ({ buildContext: vi.fn() }));
vi.mock("@/services/ai-client", () => ({ generateChatText: vi.fn() }));

const mockSearch = vi.mocked(searchKnowledgePhased);
const mockBuildContext = vi.mocked(buildContext);
const mockChat = vi.mocked(generateChatText);

const LEGE_ZOEKRESULTAAT = {
  hits: [],
  fase: "core" as const,
  aantalPerPrioriteit: { core: 0, secondary: 0, reference: 0 },
  aantalVoldoendePerPrioriteit: { core: 0, secondary: 0, reference: 0 },
};

describe("schrijfMailAntwoord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockResolvedValue(LEGE_ZOEKRESULTAAT);
    mockBuildContext.mockResolvedValue([]);
    mockChat.mockResolvedValue("Gegenereerde mail.");
  });

  it("werkt zonder ontvangen mail — de instructie stuurt zowel de zoekopdracht als het prompt-bericht", async () => {
    const payload = {} as Payload;
    await schrijfMailAntwoord(payload, { instructie: "Bedank voor de interesse en stel een demo voor." });

    expect(mockSearch).toHaveBeenCalledWith(payload, expect.objectContaining({ query: "Bedank voor de interesse en stel een demo voor." }));
    const bericht = mockChat.mock.calls[0]?.[0]?.messages[0]?.content as string;
    expect(bericht).toContain("Bedank voor de interesse en stel een demo voor.");
    expect(bericht).not.toContain("Ontvangen mail:");
  });

  it("neemt de ontvangen mail mee in zoekopdracht en prompt wanneer die is meegegeven", async () => {
    const payload = {} as Payload;
    await schrijfMailAntwoord(payload, {
      ontvangenTekst: "Hebben jullie ook Montessori-ondersteuning?",
      instructie: "Leg uit hoe Montessori werkt.",
    });

    const zoekQuery = mockSearch.mock.calls[0]?.[1]?.query;
    expect(zoekQuery).toContain("Leg uit hoe Montessori werkt.");
    expect(zoekQuery).toContain("Montessori-ondersteuning");

    const bericht = mockChat.mock.calls[0]?.[0]?.messages[0]?.content as string;
    expect(bericht).toContain("Ontvangen mail:");
    expect(bericht).toContain("Hebben jullie ook Montessori-ondersteuning?");
    expect(bericht).toContain("Leg uit hoe Montessori werkt.");
  });

  it("geeft de gebruikte kennis terug (voor de 'Gebruikte kennis'-weergave)", async () => {
    mockBuildContext.mockResolvedValue([
      { index: 1, type: "knowledge-source", label: "Handleiding", title: "Leerlingen toevoegen", text: "Ga naar Leerlingen > Toevoegen.", similarity: 0.8, refCollection: "knowledge-sources", refId: 1, url: "/admin/collections/knowledge-sources/1" },
    ]);

    const resultaat = await schrijfMailAntwoord({} as Payload, { instructie: "Leg uit hoe je een leerling toevoegt." });

    expect(resultaat.gebruikteKennis).toEqual([{ titel: "Leerlingen toevoegen", tekst: "Ga naar Leerlingen > Toevoegen." }]);
  });

  it("geeft de opgegeven werkvariant door aan retrieval", async () => {
    const payload = {} as Payload;
    await schrijfMailAntwoord(payload, { instructie: "x", variantId: "mijnmonti-id" });

    expect(mockSearch).toHaveBeenCalledWith(payload, expect.objectContaining({ variantId: "mijnmonti-id" }));
  });
});
