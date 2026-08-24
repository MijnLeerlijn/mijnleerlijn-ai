import { maakOpenAiBeeldProvider } from "./providers/openai";

export type BeeldVerzoek = {
  prompt: string;
};

export type Beeld = {
  /** Data-URL, zodat de afbeelding later ook server-side of in een PDF bruikbaar is. */
  dataUrl: string;
  model: string;
};

/**
 * Minimale beeldabstractie: "maak één afbeelding bij deze prompt". De provider
 * weet niets van eilanden, werkbladen of UI — alleen van zijn eigen API.
 */
export type BeeldProvider = {
  naam: string;
  model: string;
  genereerBeeld(verzoek: BeeldVerzoek): Promise<Beeld>;
};

export function maakBeeldProvider(): BeeldProvider {
  const gekozen = process.env.IMAGE_PROVIDER ?? "openai";

  switch (gekozen) {
    case "openai":
      return maakOpenAiBeeldProvider();
    default:
      throw new Error(`Onbekende IMAGE_PROVIDER: ${gekozen}`);
  }
}
