import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, embed } from "ai";
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
// Providerkeuze: OpenAI, via de Vercel AI SDK — tot 2026-07-23 stond hier
// Anthropic; overgezet omdat er tijdelijk geen Anthropic-credits konden
// worden aangeschaft (creditcardprobleem). Precies zo'n wissel is waarom
// deze abstractielaag bestaat: alleen dit bestand is gewijzigd, lib/support/
// analyze.ts en alle aanroepers van generateStructuredOutput() zijn
// ongewijzigd. Nog steeds geen onomkeerbaar besluit — wisselen naar een
// andere Vercel-AI-SDK-provider blijft een wijziging van uitsluitend dit
// bestand.

const DEFAULT_MODEL_ID = "gpt-4o";
const DEFAULT_EMBEDDING_MODEL_ID = "text-embedding-3-small";

function openaiClient() {
  return createOpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
}

/** Overschrijfbaar via AI_MODEL_ID (env) zonder codewijziging — zie .env.example. */
export function getAiModelId(): string {
  return optionalEnv("AI_MODEL_ID") ?? DEFAULT_MODEL_ID;
}

/** Overschrijfbaar via EMBEDDING_MODEL_ID (env) zonder codewijziging — zie .env.example. */
export function getEmbeddingModelId(): string {
  return optionalEnv("EMBEDDING_MODEL_ID") ?? DEFAULT_EMBEDDING_MODEL_ID;
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
  const model = openaiClient()(getAiModelId());
  const result = await generateObject({
    model,
    schema: args.schema,
    system: args.systemPrompt,
    prompt: args.userPrompt,
  });
  return result.object;
}

/**
 * Vraagt een embedding-vector op voor `text` — gebruikt door
 * lib/embeddings/ (Knowledge Sources/Drafts/Articles) voor semantische
 * zoekfunctionaliteit. Zelfde providerabstractie als generateStructuredOutput:
 * de Vercel AI SDK's eigen `embed()`, geen los embeddings-SDK'tje ernaast.
 * Gooit door bij een fout — aanroepers vangen dit zelf af (zie
 * lib/embeddings/process-embedding.ts), zelfde conventie als hierboven.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const model = openaiClient().embedding(getEmbeddingModelId());
  const result = await embed({ model, value: text });
  return result.embedding;
}
