import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { stelVraagOverVoorstel, maakVoorstelUitOverleg } from "./proposal-chat";
import { bouwSchoolContext, bouwSchoolPrompt } from "./context";
import { generateChatText, generateStructuredOutput } from "@/services/ai-client";
import { vervangVoorstel } from "./proposals";

vi.mock("./context", () => ({ bouwSchoolContext: vi.fn(), bouwSchoolPrompt: vi.fn() }));
vi.mock("@/services/ai-client", () => ({ generateChatText: vi.fn(), generateStructuredOutput: vi.fn() }));
vi.mock("./proposals", () => ({ vervangVoorstel: vi.fn() }));

const mockBouwContext = vi.mocked(bouwSchoolContext);
const mockBouwPrompt = vi.mocked(bouwSchoolPrompt);
const mockChatText = vi.mocked(generateChatText);
const mockStructured = vi.mocked(generateStructuredOutput);
const mockVervang = vi.mocked(vervangVoorstel);
const mockFindByID = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

function maakPayload(): Payload {
  return { findByID: mockFindByID, create: mockCreate, update: mockUpdate } as unknown as Payload;
}

const VOORSTEL = { id: 50, status: "pending", proposalText: "Bel over inschrijving", reason: "x", proposedDate: "2026-08-20", proposedChannel: "telefoon", school: 1 };

beforeEach(() => {
  mockFindByID.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockBouwContext.mockReset().mockResolvedValue({ school: { id: 1, schoolName: "x", relatiestatus: null, salesfase: null, plaats: null, onderwijstype: null }, recenteLogEvents: [], mijnleerlijnKennis: [], variantKennis: null });
  mockBouwPrompt.mockReset().mockReturnValue({ systemPrompt: "SYSTEEM", contextBericht: "CONTEXT" });
  mockChatText.mockReset().mockResolvedValue("AI-antwoord.");
  mockStructured.mockReset();
  mockVervang.mockReset().mockResolvedValue({ nieuwProposalId: 999 });
});

describe("stelVraagOverVoorstel — chat is gesprek, wijzigt nooit het voorstel", () => {
  it("gooit een fout als het voorstel niet bestaat", async () => {
    mockFindByID.mockResolvedValue(null);

    await expect(stelVraagOverVoorstel(maakPayload(), 999, "vraag", [])).rejects.toThrow("niet gevonden");
  });

  it("bouwt de context voor de JUISTE school (isolatie) en geeft het antwoord terug", async () => {
    mockFindByID.mockResolvedValue(VOORSTEL);

    const resultaat = await stelVraagOverVoorstel(maakPayload(), 50, "Ik wil liever mailen dan bellen.", []);

    expect(mockBouwContext).toHaveBeenCalledWith(expect.anything(), 1, "Ik wil liever mailen dan bellen.");
    expect(resultaat.antwoord).toBe("AI-antwoord.");
  });

  it("neemt het huidige voorstel (tekst/reden/datum/kanaal) mee in de eerste berichtcontext", async () => {
    mockFindByID.mockResolvedValue(VOORSTEL);

    await stelVraagOverVoorstel(maakPayload(), 50, "vraag", []);

    const call = mockChatText.mock.calls[0]![0];
    expect(call.messages[0]!.content).toContain("Bel over inschrijving");
    expect(call.messages[0]!.content).toContain("ONVERTROUWDE klantdata");
  });

  it("geeft de meegegeven geschiedenis door aan het model (echt meerdere beurten)", async () => {
    mockFindByID.mockResolvedValue(VOORSTEL);
    const geschiedenis = [
      { role: "user" as const, content: "Ik wil liever mailen dan bellen." },
      { role: "assistant" as const, content: "Begrepen, ik pas het voorstel aan naar mail." },
    ];

    await stelVraagOverVoorstel(maakPayload(), 50, "En over twee weken pas, denk ik.", geschiedenis);

    const call = mockChatText.mock.calls[0]![0];
    expect(call.messages).toHaveLength(4); // context + 2 geschiedenis + nieuwe vraag
    expect(call.messages[1]).toEqual(geschiedenis[0]);
    expect(call.messages[2]).toEqual(geschiedenis[1]);
    expect(call.messages[3]).toEqual({ role: "user", content: "En over twee weken pas, denk ik." });
  });

  it("wijzigt NOOIT de sales-proposals-data tijdens het chatten — geen create/update-aanroep", async () => {
    mockFindByID.mockResolvedValue(VOORSTEL);

    await stelVraagOverVoorstel(maakPayload(), 50, "Maak een beter voorstel.", []);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockVervang).not.toHaveBeenCalled();
  });
});

describe("maakVoorstelUitOverleg — Maak hiervan nieuw voorstel", () => {
  const GESCHIEDENIS = [
    { role: "user" as const, content: "Ik wil liever mailen dan bellen." },
    { role: "assistant" as const, content: "Begrepen." },
  ];

  it("gooit een fout als het voorstel niet bestaat", async () => {
    mockFindByID.mockResolvedValue(null);

    await expect(maakVoorstelUitOverleg(maakPayload(), 999, GESCHIEDENIS, 7)).rejects.toThrow("niet gevonden");
  });

  it("gooit een fout als het voorstel al is afgehandeld", async () => {
    mockFindByID.mockResolvedValue({ ...VOORSTEL, status: "accepted" });

    await expect(maakVoorstelUitOverleg(maakPayload(), 50, GESCHIEDENIS, 7)).rejects.toThrow("al afgehandeld");
  });

  it("gooit een fout als er nog geen overleg is (lege geschiedenis)", async () => {
    mockFindByID.mockResolvedValue(VOORSTEL);

    await expect(maakVoorstelUitOverleg(maakPayload(), 50, [], 7)).rejects.toThrow("overleg");
  });

  it("maakt via vervangVoorstel een nieuw voorstel met de chatgeschiedenis als overlegGeschiedenis", async () => {
    mockFindByID.mockResolvedValue(VOORSTEL);
    mockStructured.mockResolvedValue({
      aanbevolenVolgendeStap: "Stuur een mail i.p.v. bellen",
      aanbevolenDatum: "2026-09-01",
      aanbevolenKanaal: "mail",
      aanbevolenType: "mail",
      reden: "Michel gaf aan liever te mailen.",
      confidence: "hoog",
    });

    const resultaat = await maakVoorstelUitOverleg(maakPayload(), 50, GESCHIEDENIS, 7);

    expect(resultaat).toEqual({ nieuwProposalId: 999 });
    expect(mockVervang).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        oudProposalId: 50,
        actorId: 7,
        nieuwVoorstel: expect.objectContaining({
          school: 1,
          proposalText: "Stuur een mail i.p.v. bellen",
          proposedChannel: "mail",
          overlegGeschiedenis: GESCHIEDENIS,
        }),
      })
    );
  });

  it("neemt het overleg letterlijk mee in de prompt naar het model", async () => {
    mockFindByID.mockResolvedValue(VOORSTEL);
    mockStructured.mockResolvedValue({ aanbevolenVolgendeStap: "x", aanbevolenDatum: null, aanbevolenKanaal: null, aanbevolenType: null, reden: "x", confidence: "middel" });

    await maakVoorstelUitOverleg(maakPayload(), 50, GESCHIEDENIS, 7);

    const call = mockStructured.mock.calls[0]![0] as { userPrompt: string };
    expect(call.userPrompt).toContain("Ik wil liever mailen dan bellen.");
    expect(call.userPrompt).toContain("Michel:");
  });
});
