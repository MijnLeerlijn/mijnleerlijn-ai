import OpenAI from "openai";
import { configuratieFout, providerFout } from "../fouten";
import type { AiProvider, JsonVerzoek } from "../provider";

const STANDAARD_MODEL = "gpt-5";

export function maakOpenAiProvider(): AiProvider {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw configuratieFout("OPENAI_API_KEY ontbreekt in de omgevingsvariabelen.");
  }

  // Een lege OPENAI_MODEL telt als "niet ingesteld"; er is geen tweede fallback.
  const model = process.env.OPENAI_MODEL?.trim() || STANDAARD_MODEL;
  // baseURL is instelbaar (OPENAI_BASE_URL) voor tests en alternatieve endpoints.
  const client = new OpenAI({ apiKey });

  return {
    naam: "openai",
    model,
    async genereerJson({ systeem, gebruiker, schemaNaam, schema }: JsonVerzoek) {
      let tekst: string;

      try {
        const antwoord = await client.responses.create({
          model,
          input: [
            { role: "system", content: systeem },
            { role: "user", content: gebruiker },
          ],
          text: {
            format: {
              type: "json_schema",
              name: schemaNaam,
              schema,
              strict: true,
            },
          },
        });

        tekst = antwoord.output_text;
      } catch (fout) {
        throw providerFout(
          fout instanceof Error ? fout.message : "Onbekende fout bij de AI-provider.",
        );
      }

      if (!tekst || tekst.trim().length === 0) {
        throw providerFout("De AI gaf een leeg antwoord terug.");
      }

      try {
        return JSON.parse(tekst) as unknown;
      } catch {
        throw providerFout("De AI gaf geen geldige JSON terug.");
      }
    },
  };
}
