import { describe, it, expect, vi, beforeEach } from "vitest";
import { genereerTrainerversie } from "./trainer-kennisversie";
import { generateStructuredOutput } from "@/services/ai-client";

// Vervolgronde (2026-08-22) — dekt "generator gebruikt bestaand artikel als
// bron" (opdrachtseis testlijst Kennis): bewijst dat de daadwerkelijke
// titel/tekst van het bronartikel in de AI-prompt terechtkomen, en dat de
// functie zelf geen kennisopzoeking of andere bron aanspreekt (i.t.t.
// variant-adapt.ts) — het bronartikel is de enige toegestane bron.
vi.mock("@/services/ai-client", () => ({ generateStructuredOutput: vi.fn() }));

const mockGenerate = vi.mocked(generateStructuredOutput);

beforeEach(() => {
  mockGenerate.mockReset();
});

describe("genereerTrainerversie", () => {
  it("geeft de titel/tekst van het model door, getrimd", async () => {
    mockGenerate.mockResolvedValue({ titel: "  Zo begeleid je een periodevoorbereiding  ", tekst: "  Trainerversie-tekst.  " });

    const resultaat = await genereerTrainerversie({ title: "Zo bereid je een periode voor", sections: [] });

    expect(resultaat).toEqual({ titel: "Zo begeleid je een periodevoorbereiding", tekst: "Trainerversie-tekst." });
  });

  it("de AI-prompt bevat de titel én de sectie-inhoud van het bronartikel — dat artikel is de enige bron", async () => {
    mockGenerate.mockResolvedValue({ titel: "Titel", tekst: "Tekst" });

    await genereerTrainerversie({
      title: "Uniek Brontitel Fragment",
      summary: "Uniek Samenvatting Fragment",
      sections: [{ title: "Uniek Sectietitel Fragment", blocks: [{ blockType: "genummerde_stap", body: "Uniek Stapinhoud Fragment" }] }],
    });

    const call = mockGenerate.mock.calls[0]![0];
    expect(call.userPrompt).toContain("Uniek Brontitel Fragment");
    expect(call.userPrompt).toContain("Uniek Samenvatting Fragment");
    expect(call.userPrompt).toContain("Uniek Sectietitel Fragment");
    expect(call.userPrompt).toContain("Uniek Stapinhoud Fragment");
  });

  it("de systeemprompt verbiedt expliciet het verzinnen van nieuwe feiten", async () => {
    mockGenerate.mockResolvedValue({ titel: "Titel", tekst: "Tekst" });
    await genereerTrainerversie({ title: "Artikel", sections: [] });
    const call = mockGenerate.mock.calls[0]![0];
    expect(call.systemPrompt).toMatch(/verzin nooit/i);
  });
});
