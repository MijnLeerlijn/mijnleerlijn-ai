import { describe, it, expect, vi, beforeEach } from "vitest";
import { rewriteSearchQuery } from "./rewrite-query";
import { generateStructuredOutput } from "@/services/ai-client";

vi.mock("@/services/ai-client", () => ({ generateStructuredOutput: vi.fn() }));

const mockGenerate = vi.mocked(generateStructuredOutput);

beforeEach(() => {
  mockGenerate.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("rewriteSearchQuery — succesvol herschrijven", () => {
  it("geeft de herschreven zoekopdracht van het model terug", async () => {
    mockGenerate.mockResolvedValue({ zoekopdracht: "doelen toevoegen aan leerling" });

    const resultaat = await rewriteSearchQuery("Hoe koppel ik een leerling aan leerdoelen?");

    expect(resultaat).toBe("doelen toevoegen aan leerling");
  });

  it("roept het model aan met de vaste systeemprompt en de vraag als userPrompt", async () => {
    mockGenerate.mockResolvedValue({ zoekopdracht: "leerling uit groep verwijderen" });

    await rewriteSearchQuery("Hoe haal ik een kind uit de klas?");

    expect(mockGenerate).toHaveBeenCalledWith({
      schema: expect.anything(),
      systemPrompt: expect.stringContaining("MijnLeerlijn"),
      userPrompt: "Hoe haal ik een kind uit de klas?",
    });
  });

  it("trimt overtollige witruimte uit de modeloutput", async () => {
    mockGenerate.mockResolvedValue({ zoekopdracht: "  voortgang leerling bekijken  " });

    const resultaat = await rewriteSearchQuery("Waar zie ik de ontwikkeling van een leerling?");

    expect(resultaat).toBe("voortgang leerling bekijken");
  });
});

describe("rewriteSearchQuery — valt terug op de originele vraag", () => {
  it("gebruikt de originele vraag wanneer de AI-aanroep faalt (bv. ontbrekende OPENAI_API_KEY)", async () => {
    mockGenerate.mockRejectedValue(new Error("Ontbrekende verplichte omgevingsvariabele: OPENAI_API_KEY."));

    const resultaat = await rewriteSearchQuery("Hoe verander ik een set met leerdoelen?");

    expect(resultaat).toBe("Hoe verander ik een set met leerdoelen?");
  });

  it("gebruikt de originele vraag wanneer het model een lege zoekopdracht teruggeeft", async () => {
    mockGenerate.mockResolvedValue({ zoekopdracht: "   " });

    const resultaat = await rewriteSearchQuery("een onduidelijke vraag");

    expect(resultaat).toBe("een onduidelijke vraag");
  });
});

describe("rewriteSearchQuery — logging", () => {
  it("logt zowel de originele als de herschreven vraag (development)", async () => {
    mockGenerate.mockResolvedValue({ zoekopdracht: "doelenset aanpassen" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await rewriteSearchQuery("Hoe verander ik een set met leerdoelen?");

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Hoe verander ik een set met leerdoelen?"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("doelenset aanpassen"));
  });
});
