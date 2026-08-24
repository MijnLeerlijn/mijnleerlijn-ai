import { maakOpenAiProvider } from "./providers/openai";

export type JsonVerzoek = {
  systeem: string;
  gebruiker: string;
  schemaNaam: string;
  schema: Record<string, unknown>;
};

/**
 * Minimale AI-abstractie: alles wat de generator van een provider nodig heeft is
 * "geef JSON terug volgens dit schema". Een andere provider toevoegen betekent
 * één implementatie erbij en een regel in maakProvider().
 */
export type AiProvider = {
  naam: string;
  model: string;
  genereerJson(verzoek: JsonVerzoek): Promise<unknown>;
};

export function maakProvider(): AiProvider {
  const gekozen = process.env.AI_PROVIDER ?? "openai";

  switch (gekozen) {
    case "openai":
      return maakOpenAiProvider();
    default:
      throw new Error(`Onbekende AI_PROVIDER: ${gekozen}`);
  }
}
