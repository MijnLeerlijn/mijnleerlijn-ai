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
// services/ai.ts (zoekantwoorden, publieke /api/antwoord-route) is BEWUST
// NIET aangeraakt in Sprint 5: dat bestand/die route blijft de bestaande,
// publieke, anonieme, keyword-gebaseerde zoekervaring (services/retrieval.ts)
// — een apart, ouder systeem. lib/assistant/ (Sprint 5, /assistant, achter
// login) is een NIEUWE, aparte pijplijn bovenop de echte semantische
// zoekfunctie uit lib/embeddings/similarity-search.ts (Sprint 4). Beide
// lopen door DEZE centrale client, nooit via een eigen providerclientje.
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
  const { object } = await generateStructuredOutputWithUsage(args);
  return object;
}

export interface StructuredOutputMetUsage<T> {
  object: T;
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
}

/**
 * Zelfde als generateStructuredOutput(), maar geeft ook de tokenusage terug
 * — nodig voor lib/assistant/ (Sprint 5), dat elke vraag/antwoord-uitwisseling
 * logt (inclusief tokens) in de knowledge-drafts-achtige assistant-conversations-
 * collectie. Aparte functie i.p.v. de returnwaarde van generateStructuredOutput()
 * te wijzigen, om alle bestaande aanroepers (die alleen het object gebruiken)
 * ongemoeid te laten.
 */
export async function generateStructuredOutputWithUsage<T>(
  args: StructuredOutputArgs<T>
): Promise<StructuredOutputMetUsage<T>> {
  const model = openaiClient()(getAiModelId());
  const result = await generateObject({
    model,
    schema: args.schema,
    system: args.systemPrompt,
    prompt: args.userPrompt,
  });
  return {
    object: result.object,
    usage: {
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
      totalTokens: result.usage.totalTokens ?? null,
    },
  };
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
