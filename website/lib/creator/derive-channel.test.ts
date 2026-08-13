import { describe, it, expect, vi, beforeEach } from "vitest";
import { deriveerContent } from "./derive-channel";
import { generateStructuredOutput } from "@/services/ai-client";

vi.mock("@/services/ai-client", () => ({ generateStructuredOutput: vi.fn() }));

const mockGenerate = vi.mocked(generateStructuredOutput);

describe("deriveerContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerate.mockResolvedValue({ titel: "Onderwerp", tekst: "Body", cta: "Klik hier" });
  });

  it("geeft per kanaal een eigen instructie mee aan de systeemprompt", async () => {
    await deriveerContent({ bronTitel: "Artikel", bronTekst: "Tekst", channel: "linkedin" });
    const call = mockGenerate.mock.calls[0]?.[0];
    expect(call?.systemPrompt).toContain("LinkedIn-post");
  });

  it("neemt doelgroep-instructie voor nieuwe scholen op", async () => {
    await deriveerContent({ bronTitel: "Artikel", bronTekst: "Tekst", channel: "nieuwsbrief", audience: "nieuwe_scholen" });
    const call = mockGenerate.mock.calls[0]?.[0];
    expect(call?.systemPrompt).toContain("nog niet gebruiken");
  });

  it("neemt een andere doelgroep-instructie voor bestaande scholen op (CTA-verschil, sectie 10)", async () => {
    await deriveerContent({ bronTitel: "Artikel", bronTekst: "Tekst", channel: "nieuwsbrief", audience: "bestaande_scholen" });
    const call = mockGenerate.mock.calls[0]?.[0];
    expect(call?.systemPrompt).toContain("al met MijnLeerlijn werken");
  });

  it("geeft extra kennis door in de prompt wanneer meegegeven", async () => {
    await deriveerContent({
      bronTitel: "Artikel",
      bronTekst: "Tekst",
      channel: "nieuwsbrief",
      extraKennis: [{ titel: "Kerndoelen", tekst: "Uitleg over kerndoelen." }],
    });
    const call = mockGenerate.mock.calls[0]?.[0];
    expect(call?.systemPrompt).toContain("Kerndoelen");
  });

  it("geeft het gestructureerde resultaat rechtstreeks terug", async () => {
    const resultaat = await deriveerContent({ bronTitel: "Artikel", bronTekst: "Tekst", channel: "partnertekst" });
    expect(resultaat).toEqual({ titel: "Onderwerp", tekst: "Body", cta: "Klik hier" });
  });
});
