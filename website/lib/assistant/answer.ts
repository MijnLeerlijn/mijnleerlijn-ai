import { z } from "zod";
import { generateStructuredOutputWithUsage, getAiModelId } from "@/services/ai-client";
import { contextItemsNaarPrompt, type ContextItem } from "./build-context";

// Kern-antwoordlogica van de AI-assistent (Sprint 5) — geen Payload-
// afhankelijkheid, puur testbaar. lib/assistant/process-question.ts roept
// dit aan met al-opgehaalde context (lib/embeddings/similarity-search.ts +
// build-context.ts) en schrijft het resultaat weg.
//
// HARDE REGEL, in code afgedwongen — niet alleen in de systeeminstructie
// (die het model zou kunnen negeren), zelfde filosofie als de
// betrouwbaarheidsdrempel in docs/AI-KNOWLEDGE-STRATEGY.md ("dit is een
// deterministische stap in eigen code, geen promptinstructie"): zonder
// bronnen of bij een te lage beste overeenkomstscore wordt het taalmodel
// NOOIT aangeroepen — "de AI mag nooit antwoorden geven zonder bron" (zie de
// opdracht). Confidence is altijd de retrieval-score van de beste bron,
// nooit een zelfinschatting van het model.

export const MIN_SIMILARITY_VOOR_ANTWOORD = 0.5;
const GEEN_ANTWOORD_TEKST = "Dat weet ik niet. Er is onvoldoende informatie in de kennisbank.";

const SYSTEEMPROMPT = `Je bent de AI-assistent van MijnLeerlijn.
Je gebruikt uitsluitend informatie uit de aangeleverde context.
Verzin nooit functionaliteit.
Gebruik geen algemene kennis wanneer deze niet in de context staat.
Geef bronvermelding.

Regels:
1. Beantwoord de vraag ALLEEN met informatie die letterlijk in de context hieronder staat, elk stuk aangeduid als "[Bron N: ...]".
2. Als de context de vraag niet, of niet voldoende, beantwoordt: zet hasAnswer op false. Verzin dan niets.
3. Verwijs in je antwoord waar relevant naar de bron met "(Bron N)".
4. reasoning: leg in één tot twee zinnen uit welke bron(nen) je antwoord onderbouwen, of waarom je geen antwoord kon geven.
5. Schrijf in het Nederlands, feitelijk en vriendelijk, geen overbodige inleidende zinnen.

Antwoord uitsluitend met het gevraagde gestructureerde object.`;

// Schema naar de AI: geen minLength/maxLength (zelfde OpenAI-structured-
// output-les als lib/support/analyze.ts en lib/knowledge/index-source.ts).
const AntwoordSchema = z.object({
  hasAnswer: z.boolean(),
  answer: z.string(),
  reasoning: z.string(),
});

const AntwoordValidatieSchema = z.object({ reasoning: z.string().min(1) });

interface UsageInfo {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

const GEEN_USAGE: UsageInfo = { inputTokens: null, outputTokens: null, totalTokens: null };

export type AssistantAntwoordUitkomst =
  | {
      type: "answered";
      answer: string;
      reasoning: string;
      confidence: number;
      model: string;
      usage: UsageInfo;
    }
  | {
      type: "no-answer";
      answer: string;
      reasoning: string;
      confidence: number;
      model: string;
      usage: UsageInfo;
    }
  | { type: "failed"; foutmelding: string };

export async function genereerAssistentAntwoord(
  vraag: string,
  contextItems: ContextItem[]
): Promise<AssistantAntwoordUitkomst> {
  const besteScore = contextItems[0]?.similarity ?? 0;
  const confidence = Math.round(besteScore * 100);

  if (contextItems.length === 0 || besteScore < MIN_SIMILARITY_VOOR_ANTWOORD) {
    return {
      type: "no-answer",
      answer: GEEN_ANTWOORD_TEKST,
      reasoning:
        contextItems.length === 0
          ? "Geen enkele bron met voldoende semantische overlap gevonden in de kennisbank."
          : `De best passende bron had een te lage overeenkomstscore (${confidence}%) om betrouwbaar te gebruiken.`,
      confidence,
      model: getAiModelId(),
      usage: GEEN_USAGE,
    };
  }

  let object: z.infer<typeof AntwoordSchema>;
  let usage: UsageInfo;
  try {
    const resultaat = await generateStructuredOutputWithUsage({
      schema: AntwoordSchema,
      systemPrompt: SYSTEEMPROMPT,
      userPrompt: `Vraag: ${vraag}\n\nContext:\n${contextItemsNaarPrompt(contextItems)}`,
    });
    object = resultaat.object;
    usage = resultaat.usage;
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    return { type: "failed", foutmelding: boodschap };
  }

  const validatie = AntwoordValidatieSchema.safeParse(object);
  if (!validatie.success || !object.hasAnswer || !object.answer.trim()) {
    return {
      type: "no-answer",
      answer: GEEN_ANTWOORD_TEKST,
      reasoning:
        object.reasoning?.trim() ||
        "Het taalmodel kon de vraag niet betrouwbaar beantwoorden vanuit de aangeleverde context.",
      confidence,
      model: getAiModelId(),
      usage,
    };
  }

  return {
    type: "answered",
    answer: object.answer.trim(),
    reasoning: object.reasoning.trim(),
    confidence,
    model: getAiModelId(),
    usage,
  };
}
