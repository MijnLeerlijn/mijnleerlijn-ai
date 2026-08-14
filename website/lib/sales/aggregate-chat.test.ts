import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { stelVraagOverAlleScholen } from "./aggregate-chat";
import { generateChatText } from "@/services/ai-client";

vi.mock("@/services/ai-client", () => ({ generateChatText: vi.fn() }));
const mockChat = vi.mocked(generateChatText);
const mockFind = vi.fn();

function maakPayload(): Payload {
  return { find: mockFind } as unknown as Payload;
}

const EEN_SCHOOL = {
  id: 1,
  schoolName: "Testschool Zwolle",
  relatiestatus: "Prospect",
  plaats: "Zwolle",
  lastMondayActivityAt: "2026-06-01T00:00:00.000Z",
  onderwijstype: { id: 1, name: "MijnMonti" },
  cachedSummary: "School toont interesse in Montessori-materialen, wacht op demo.",
};

describe("stelVraagOverAlleScholen", () => {
  beforeEach(() => {
    mockChat.mockReset().mockResolvedValue("Testantwoord.");
    mockFind.mockReset();
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [EEN_SCHOOL], totalDocs: 1 });
      return Promise.resolve({ docs: [] });
    });
  });

  it("stuurt een gestructureerd scholenoverzicht mee — niet de volledige logboeken (expliciete privacy-eis)", async () => {
    await stelVraagOverAlleScholen(maakPayload(), "Welke scholen hebben geen vervolgactie?");

    const userMessage = mockChat.mock.calls[0]![0].messages[0]!.content as string;
    expect(userMessage).toContain("Testschool Zwolle");
    expect(userMessage).toContain("status: Prospect");
    expect(userMessage).toContain("onderwijstype: MijnMonti");
    expect(userMessage).toContain("plaats: Zwolle");
  });

  it("gebruikt de al PII-gescrubde cachedSummary, geen ruwe logboektekst", async () => {
    await stelVraagOverAlleScholen(maakPayload(), "Vraag");

    const userMessage = mockChat.mock.calls[0]![0].messages[0]!.content as string;
    expect(userMessage).toContain("School toont interesse in Montessori-materialen, wacht op demo.");
  });

  it("markeert of een school een open actie/pending voorstel heeft", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [EEN_SCHOOL], totalDocs: 1 });
      if (collection === "sales-actions") return Promise.resolve({ docs: [{ school: 1 }] });
      if (collection === "sales-proposals") return Promise.resolve({ docs: [] });
      return Promise.resolve({ docs: [] });
    });

    await stelVraagOverAlleScholen(maakPayload(), "Vraag");

    const userMessage = mockChat.mock.calls[0]![0].messages[0]!.content as string;
    expect(userMessage).toContain("heeft een open actie");
    expect(userMessage).toContain("geen openstaand voorstel");
  });

  it("bevat de ONVERTROUWDE-klantdata-promptregel — prompt-injection uit Monday-data blijft onschadelijk", async () => {
    await stelVraagOverAlleScholen(maakPayload(), "Vraag");

    const systemPrompt = mockChat.mock.calls[0]![0].systemPrompt as string;
    const userMessage = mockChat.mock.calls[0]![0].messages[0]!.content as string;
    expect(systemPrompt).toMatch(/geen instructie aan jou/i);
    expect(userMessage).toContain("ONVERTROUWDE klantdata");
  });

  it("stuurt de vraag van de gebruiker expliciet mee", async () => {
    await stelVraagOverAlleScholen(maakPayload(), "Wat zou ik deze week oppakken?");

    const userMessage = mockChat.mock.calls[0]![0].messages[0]!.content as string;
    expect(userMessage).toContain("Wat zou ik deze week oppakken?");
  });

  it("geeft scholenGebruikt en scholenTotaal terug", async () => {
    const resultaat = await stelVraagOverAlleScholen(maakPayload(), "Vraag");
    expect(resultaat).toEqual({ antwoord: "Testantwoord.", scholenGebruikt: 1, scholenTotaal: 1 });
  });

  it("voegt een afkapnotitie toe wanneer niet alle scholen meegaan", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [EEN_SCHOOL], totalDocs: 400 });
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await stelVraagOverAlleScholen(maakPayload(), "Vraag");

    expect(resultaat.scholenTotaal).toBe(400);
    expect(resultaat.scholenGebruikt).toBe(1);
    const userMessage = mockChat.mock.calls[0]![0].messages[0]!.content as string;
    expect(userMessage).toContain("1 van de 400 scholen");
  });
});
