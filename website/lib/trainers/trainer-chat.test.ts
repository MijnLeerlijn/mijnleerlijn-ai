import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { stelTrainerVraag } from "./trainer-chat";
import { bouwTrainerSchoolContext, bouwTrainerSchoolPrompt, bouwTrainerAlgemeneContext, bouwTrainerAlgemeenPrompt } from "./ai-context";
import { generateChatText } from "@/services/ai-client";
import type { AuthTrainer } from "./auth";

// Traineromgeving V1, Ronde 2 afronding — Trainer-AI (2026-08-19). Dekt de
// orchestratie/routering/audit — de contextopbouw zelf (ownership,
// ONVERTROUWD-labeling, contextminimalisatie) is al gedekt in
// lib/trainers/ai-context.test.ts en wordt hier gemockt, zelfde scheiding
// als lib/werk/mijn-werk-chat.test.ts.
vi.mock("./ai-context", () => ({
  bouwTrainerSchoolContext: vi.fn(),
  bouwTrainerSchoolPrompt: vi.fn(),
  bouwTrainerAlgemeneContext: vi.fn(),
  bouwTrainerAlgemeenPrompt: vi.fn(),
}));
vi.mock("@/services/ai-client", () => ({ generateChatText: vi.fn() }));

const mockSchoolContext = vi.mocked(bouwTrainerSchoolContext);
const mockSchoolPrompt = vi.mocked(bouwTrainerSchoolPrompt);
const mockAlgemeneContext = vi.mocked(bouwTrainerAlgemeneContext);
const mockAlgemeenPrompt = vi.mocked(bouwTrainerAlgemeenPrompt);
const mockChat = vi.mocked(generateChatText);

const TRAINER: AuthTrainer = {
  id: 1,
  name: "Wessel",
  email: "wessel@mijnleerlijn.nl",
  mondayTrainerboardId: "18424768045",
  mondayUitvoerderItemId: "12419116827",
  actief: true,
};

function maakFakePayload() {
  return { create: vi.fn().mockResolvedValue({ id: 1 }) } as unknown as Payload;
}

beforeEach(() => {
  mockSchoolContext.mockReset();
  mockSchoolPrompt.mockReset();
  mockAlgemeneContext.mockReset();
  mockAlgemeenPrompt.mockReset();
  mockChat.mockReset().mockResolvedValue("AI-antwoord");
});

describe("stelTrainerVraag — routering (deterministisch, geen LLM-classificatie)", () => {
  it("schoolId aanwezig -> uitsluitend schoolcontext, nooit de algemene/dashboard-context", async () => {
    mockSchoolContext.mockResolvedValue({ school: { id: "500", naam: "Montessori Gorinchem" } } as never);
    mockSchoolPrompt.mockReturnValue({ systemPrompt: "SP-school", contextBericht: "CB-school" });

    const payload = maakFakePayload();
    const uitkomst = await stelTrainerVraag(payload, TRAINER, "Wat is er besproken?", "500");

    expect(mockSchoolContext).toHaveBeenCalledWith(TRAINER, "500");
    expect(mockAlgemeneContext).not.toHaveBeenCalled();
    expect(mockChat).toHaveBeenCalledWith(expect.objectContaining({ systemPrompt: "SP-school" }));
    expect(uitkomst).toEqual({ soort: "antwoord", antwoord: "AI-antwoord", context: "school" });
  });

  it("schoolId null -> uitsluitend de algemene/dashboard-context, nooit een schoolcontext", async () => {
    mockAlgemeneContext.mockResolvedValue({ dashboard: {} } as never);
    mockAlgemeenPrompt.mockReturnValue({ systemPrompt: "SP-algemeen", contextBericht: "CB-algemeen" });

    const payload = maakFakePayload();
    const uitkomst = await stelTrainerVraag(payload, TRAINER, "Wat staat er deze week?", null);

    expect(mockAlgemeneContext).toHaveBeenCalledWith(TRAINER);
    expect(mockSchoolContext).not.toHaveBeenCalled();
    expect(mockChat).toHaveBeenCalledWith(expect.objectContaining({ systemPrompt: "SP-algemeen" }));
    expect(uitkomst).toEqual({ soort: "antwoord", antwoord: "AI-antwoord", context: "algemeen" });
  });

  it("een schoolId die niet bij deze trainer hoort (bouwTrainerSchoolContext geeft null) -> school_niet_gevonden, GEEN AI-aanroep", async () => {
    mockSchoolContext.mockResolvedValue(null);

    const payload = maakFakePayload();
    const uitkomst = await stelTrainerVraag(payload, TRAINER, "Vraag", "999-niet-eigen");

    expect(uitkomst).toEqual({ soort: "school_niet_gevonden" });
    expect(mockChat).not.toHaveBeenCalled();
  });
});

describe("stelTrainerVraag — audit-logging (best-effort, nooit vraag-/antwoordtekst zelf)", () => {
  it("logt een geslaagde schoolvraag zonder de vraag- of antwoordtekst op te slaan", async () => {
    mockSchoolContext.mockResolvedValue({ school: { id: "500", naam: "Montessori Gorinchem" } } as never);
    mockSchoolPrompt.mockReturnValue({ systemPrompt: "SP", contextBericht: "CB" });

    const payload = maakFakePayload();
    await stelTrainerVraag(payload, TRAINER, "Een specifieke, gevoelige vraag over de school", "500");

    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "trainer-ai-log-events",
        data: expect.objectContaining({
          trainer: 1,
          contextSoort: "school",
          mondaySchoolId: "500",
          schoolNaam: "Montessori Gorinchem",
          uitkomst: "beantwoord",
          vraagLengte: "Een specifieke, gevoelige vraag over de school".length,
        }),
        overrideAccess: true,
      })
    );
    const dataArg = (payload.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(JSON.stringify(dataArg)).not.toContain("gevoelige vraag");
    expect(JSON.stringify(dataArg)).not.toContain("AI-antwoord");
  });

  it("logt een mislukte poging als 'mislukt' en laat de fout alsnog doorgooien naar de aanroeper", async () => {
    mockAlgemeneContext.mockResolvedValue({ dashboard: {} } as never);
    mockAlgemeenPrompt.mockReturnValue({ systemPrompt: "SP", contextBericht: "CB" });
    mockChat.mockRejectedValue(new Error("AI-provider onbereikbaar"));

    const payload = maakFakePayload();
    await expect(stelTrainerVraag(payload, TRAINER, "Vraag", null)).rejects.toThrow("AI-provider onbereikbaar");

    expect(payload.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ uitkomst: "mislukt" }) }));
  });

  it("een mislukte auditlogging blokkeert het AI-antwoord niet (best-effort)", async () => {
    mockAlgemeneContext.mockResolvedValue({ dashboard: {} } as never);
    mockAlgemeenPrompt.mockReturnValue({ systemPrompt: "SP", contextBericht: "CB" });
    const payload = { create: vi.fn().mockRejectedValue(new Error("DB weg")) } as unknown as Payload;

    const uitkomst = await stelTrainerVraag(payload, TRAINER, "Vraag", null);

    expect(uitkomst).toEqual({ soort: "antwoord", antwoord: "AI-antwoord", context: "algemeen" });
  });
});
