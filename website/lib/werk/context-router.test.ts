import { describe, it, expect, vi, beforeEach } from "vitest";
import { routeerWerkVraag } from "./context-router";
import { generateStructuredOutput } from "@/services/ai-client";

vi.mock("@/services/ai-client", () => ({ generateStructuredOutput: vi.fn() }));
const mockGenerate = vi.mocked(generateStructuredOutput);

beforeEach(() => {
  mockGenerate.mockReset();
});

describe("routeerWerkVraag", () => {
  it("geeft de gekozen categorie + genoemde schoolnaam door", async () => {
    mockGenerate.mockResolvedValue({ categorie: "school", genoemdeSchoolNaam: "Springplank" });
    const routering = await routeerWerkVraag("Wat is de status bij Springplank?");
    expect(routering).toEqual({ categorie: "school", genoemdeSchoolNaam: "Springplank" });
  });

  it("normaliseert een lege/whitespace schoolnaam naar null", async () => {
    mockGenerate.mockResolvedValue({ categorie: "planning", genoemdeSchoolNaam: "   " });
    const routering = await routeerWerkVraag("Wat heb ik morgen?");
    expect(routering.genoemdeSchoolNaam).toBeNull();
  });

  it("valt terug op 'algemeen' zonder crash wanneer de AI-aanroep faalt", async () => {
    mockGenerate.mockRejectedValue(new Error("model onbereikbaar"));
    const routering = await routeerWerkVraag("Wat heb ik morgen?");
    expect(routering).toEqual({ categorie: "algemeen", genoemdeSchoolNaam: null });
  });
});
