import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, embed, transcribe } from "ai";
import { z } from "zod";
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
// Ronde 3.5 (2026-08-25, telefonische verslaglegging) — whisper-1 i.p.v. de
// nieuwere gpt-4o(-mini)-transcribe-modellen: expliciet gekozen om het
// bewezenste, langst-gedocumenteerde Nederlandstalige-ondersteuningstraject
// te gebruiken (OpenAI's eigen Whisper-benchmarks tonen Nederlands als een
// goed ondersteunde taal) voor spraak die inhoudelijk over trainingen/
// scholen gaat — nooit eerder in DEZE sessie live tegen echte trainerspraak
// getest (geen uitgaand netwerk naar api.openai.com beschikbaar), zie het
// opleverrapport. Overschrijfbaar via TRANSCRIPTIE_MODEL_ID, zelfde patroon
// als AI_MODEL_ID/EMBEDDING_MODEL_ID hierboven.
const DEFAULT_TRANSCRIPTIE_MODEL_ID = "whisper-1";

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

/** Overschrijfbaar via TRANSCRIPTIE_MODEL_ID (env) zonder codewijziging — zie .env.example. */
export function getTranscriptieModelId(): string {
  return optionalEnv("TRANSCRIPTIE_MODEL_ID") ?? DEFAULT_TRANSCRIPTIE_MODEL_ID;
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

/**
 * Ronde 3.5 (2026-08-25) — spraak-naar-tekst voor telefonisch ingesproken
 * trainingsverslagen (lib/trainers/telefonie/), dezelfde centrale AI-client/
 * providerabstractie als de rest van dit bestand — GEEN los
 * transcriptie-SDK'tje ernaast (opdrachtseis: "gebruik de bestaande OpenAI/
 * AI-infrastructuur waar passend"). `audio` zijn de RUWE bytes, al door de
 * aanroeper provider-geauthenticeerd opgehaald (lib/trainers/telefonie/
 * telnyx-provider.ts se haalOpnameOp) — deze functie downloadt zelf nooit
 * van een URL, juist om nooit per ongeluk een niet-geauthenticeerde
 * opnamelink te laten volgen.
 *
 * Gooit door bij een fout (zelfde conventie als generateEmbedding hierboven)
 * — de aanroeper (lib/trainers/telefonie/oproep-state.ts) vangt dit af en
 * markeert de oproep als mislukt (foutcode "transcriptie_mislukt"), nooit
 * een leeg/verzonnen transcript doorzetten naar de verslag-AI.
 */
export async function transcribeAudio(audio: ArrayBuffer): Promise<string> {
  const model = openaiClient().transcription(getTranscriptieModelId());
  const result = await transcribe({ model, audio: new Uint8Array(audio) });
  return result.text;
}

export interface ChatTextArgs {
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

/**
 * Creator V1 (2026-08-13): vrije, niet-schemagebonden tekstgeneratie —
 * voor het AI-schrijfgesprek in lib/creator/ (zie de sessie-onderzoeksfase).
 * Bewust een aparte functie i.p.v. generateStructuredOutput() misbruiken met
 * een `{ text: string }`-schema: dit is écht vrije tekst (proza dat de
 * gebruiker verder bewerkt), geen gestructureerde data. Zelfde
 * providerabstractie als de rest van dit bestand (openaiClient()/
 * getAiModelId()) — geen tweede AI-clientje.
 */
export async function generateChatText(args: ChatTextArgs): Promise<string> {
  const model = openaiClient()(getAiModelId());
  const result = await generateText({ model, system: args.systemPrompt, messages: args.messages });
  return result.text;
}

const OcrPdfSchema = z.object({
  paginas: z.array(z.object({ pageNumber: z.number(), text: z.string() })),
});

/**
 * OCR-fallback voor image-only PDF's (bv. Canva-exports zonder tekstlaag,
 * zie lib/knowledge/ocr.ts) — GEEN los OCR-pakket (tesseract.js e.d.) EN
 * GEEN eigen paginarasterisatie (eerdere opzet met unpdf's renderPageAsImage
 * + @napi-rs/canvas: dat native binary bleek op Vercel niet betrouwbaar te
 * laden — "@napi-rs/canvas is not available in this environment",
 * vermoedelijk doordat de per-platform binary van een napi-rs-package via
 * een dynamisch berekende require() pas ten tijde van de eerste aanroep
 * wordt opgehaald, wat Vercels file-tracing (@vercel/nft) kan missen; dit
 * is buiten een echte Vercel-deploy niet waterdicht te verifiëren).
 *
 * In plaats daarvan: het hele PDF-bestand gaat rechtstreeks naar dezelfde
 * centrale AI-client/hetzelfde model als de rest van dit bestand
 * (getAiModelId(), standaard "gpt-4o") als bestandsonderdeel met
 * mediaType "application/pdf" — dit is een door de Vercel AI SDK's OpenAI-
 * provider (@ai-sdk/openai, geïnstalleerde versie) OFFICIEEL ondersteund
 * inputtype (OpenAIResponsesLanguageModel.supportedUrls bevat
 * "application/pdf"; convertToOpenAIResponsesInput() zet een file-part met
 * mediaType "application/pdf" om naar een "input_file"-blok met base64
 * file_data). Geen rasterisatiestap, geen native binary, dus geen Vercel-
 * bundlingrisico. Vereist geen nieuwe environment variable: dezelfde
 * OPENAI_API_KEY/AI_MODEL_ID als de rest van de indexeerpijplijn.
 */
export async function generateTextFromPdf(pdf: {
  data: ArrayBuffer;
  filename: string;
  totalPages: number;
}): Promise<{ pageNumber: number; text: string }[]> {
  const model = openaiClient()(getAiModelId());
  const result = await generateObject({
    model,
    schema: OcrPdfSchema,
    system: `Je bent een OCR-engine. Dit PDF-document heeft ${pdf.totalPages} pagina('s) en bevat geen (bruikbare) tekstlaag — waarschijnlijk bestaat elke pagina uit een afbeelding. Transcribeer LETTERLIJK alle leesbare tekst per pagina, in leesvolgorde (boven naar beneden, links naar rechts). Vat niets samen, verzin niets, voeg geen eigen tekst toe. Geef voor elke pagina (1 t/m ${pdf.totalPages}) exact één item terug in "paginas", met het juiste paginanummer. Staat er op een pagina geen leesbare tekst, geef voor die pagina dan een lege tekst terug.`,
    messages: [
      {
        role: "user",
        content: [{ type: "file", data: pdf.data, mediaType: "application/pdf", filename: pdf.filename }],
      },
    ],
  });
  return result.object.paginas;
}
