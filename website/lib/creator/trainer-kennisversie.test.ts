import { describe, it, expect, vi, beforeEach } from "vitest";
import { genereerTrainerversie, genereerTrainerversieVanTekst } from "./trainer-kennisversie";
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

// Kennisbasis-basiskennis (2026-08-23) — genereerTrainerversie() hierboven is
// nu zelf ook een dunne wrapper om genereerTrainerversieVanTekst() (met
// buildArticleText ervoor); deze dekt de gedeelde kern rechtstreeks, met
// platte tekst als bron (zoals de Kennisbasis dat al is — geen
// buildArticleText nodig) i.p.v. een artikelboom.
describe("genereerTrainerversieVanTekst", () => {
  it("geeft titel/tekst getrimd door, en gebruikt dezelfde systeemprompt als genereerTrainerversie", async () => {
    mockGenerate.mockResolvedValue({ titel: "  Trainertitel  ", tekst: "  Trainertekst  " });

    const resultaat = await genereerTrainerversieVanTekst("Kennisbasis MijnLeerlijn", "De achtergrondtekst.");

    expect(resultaat).toEqual({ titel: "Trainertitel", tekst: "Trainertekst" });
    expect(mockGenerate.mock.calls[0]![0].systemPrompt).toMatch(/verzin nooit/i);
  });

  it("de prompt bevat de meegegeven titel en brontekst, met het meegegeven bronlabel", async () => {
    mockGenerate.mockResolvedValue({ titel: "T", tekst: "X" });

    await genereerTrainerversieVanTekst("Uniek Titelfragment", "Uniek Brontekstfragment", "Kennisbasis-document");

    const call = mockGenerate.mock.calls[0]![0];
    expect(call.userPrompt).toContain("Origineel Kennisbasis-document");
    expect(call.userPrompt).toContain("Uniek Titelfragment");
    expect(call.userPrompt).toContain("Uniek Brontekstfragment");
  });

  it("valt terug op bronlabel 'artikel' als er geen wordt meegegeven", async () => {
    mockGenerate.mockResolvedValue({ titel: "T", tekst: "X" });

    await genereerTrainerversieVanTekst("Titel", "Tekst");

    expect(mockGenerate.mock.calls[0]![0].userPrompt).toContain("Origineel artikel");
  });
});
