import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import type { z } from "zod";
import { requireEnv, optionalEnv } from "@/config/env";

// DE centrale AI-provider-client — zie docs/ARCHITECTURE.md
// §Providerabstracties: "Eigen interne service, gebouwd op de Vercel AI
// SDK. Wisselen tussen Anthropic/OpenAI wordt een configuratiewijziging in
// dit bestand." Elke plek in de app die gestructureerde AI-output nodig
// heeft (op dit moment: lib/support/analyze.ts) hoort hier doorheen te
// lopen — geen los, tweede providerclientje ernaast.
//
// services/ai.ts (zoekantwoorden) is bewust NIET omgebouwd om hierdoorheen
// te lopen: dat bestand is momenteel extractief (geen taalmodel-aanroep,
// zie de motivatie daar) omdat er tot nu toe geen AI-provider-sleutel
// beschikbaar was. Dit bestand is de eerste plek die die sleutel
// daadwerkelijk gebruikt; wanneer services/ai.ts ooit naar echte
// taalmodel-generatie overgaat, hoort die ook via generateStructuredOutput()
// hieronder te lopen, niet via een eigen client.
//
// Providerkeuze: Anthropic (Claude), via de Vercel AI SDK. Er was geen
// bestaande sleutel/keuze in het project vastgelegd (zie docs/TODO.md
// beslissing 2, "open — fase 6, testen met echte NL-content") — Anthropic is
// hier een redelijke, goed gemotiveerde standaardkeuze, maar geen
// onomkeerbaar besluit: alleen dit bestand hoeft te wijzigen om over te
// stappen op een andere Vercel-AI-SDK-provider.

const DEFAULT_MODEL_ID = "claude-sonnet-5";

function anthropicClient() {
  return createAnthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
}

/** Overschrijfbaar via AI_MODEL_ID (env) zonder codewijziging — zie .env.example. */
export function getAiModelId(): string {
  return optionalEnv("AI_MODEL_ID") ?? DEFAULT_MODEL_ID;
}

export interface StructuredOutputArgs<T> {
  schema: z.ZodType<T>;
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Vraagt gestructureerde, tegen `schema` gevalideerde JSON-output van het
 * taalmodel — de Vercel AI SDK dwingt het model naar het schema en gooit
 * zelf een fout bij ongeldige/onvolledige output (nooit stilzwijgend iets
 * verzinnen bovenop een kapotte respons). Aanroepers moeten deze fout zelf
 * afvangen en veilig afhandelen (zie lib/support/analyze.ts) — deze functie
 * doet zelf geen retries of fallbacks.
 */
export async function generateStructuredOutput<T>(args: StructuredOutputArgs<T>): Promise<T> {
  const model = anthropicClient()(getAiModelId());
  const result = await generateObject({
    model,
    schema: args.schema,
    system: args.systemPrompt,
    prompt: args.userPrompt,
  });
  return result.object;
}
