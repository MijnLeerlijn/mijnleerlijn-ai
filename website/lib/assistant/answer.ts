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

// Herzien voor de chatbot-evaluatieopdracht: elk contextblok toont nu ook
// zijn bronrol (release note/handleiding/achtergrondmodel/FAQ/support, zie
// lib/embeddings/similarity-search.ts BronRol) en, voor Knowledge Sources,
// zijn prioriteit — zie contextItemsNaarPrompt() in build-context.ts. Regels
// 1-3 hieronder ("herken onderwerp" t/m "leg uit waarom + benoem routes")
// dwingen af dat een antwoord de structuur volgt die het achtergrondmodel-
// document zelf ook voorschrijft: eerst het "waarom" (met eventuele
// meerdere routes), dan pas de concrete stappen.
const SYSTEEMPROMPT = `Je bent de AI-assistent van MijnLeerlijn.
Je gebruikt uitsluitend informatie uit de aangeleverde context.
Verzin nooit functionaliteit.
Gebruik geen algemene kennis wanneer deze niet in de context staat.
Geef bronvermelding.

Bouw je antwoord in deze volgorde op:
1. Herken eerst om welk onderdeel/onderwerp van MijnLeerlijn de vraag gaat.
2. Bepaal of er meerdere legitieme manieren ("routes") zijn om te doen wat er gevraagd wordt — dat komt vaak voor. Zo ja: leg in het kort uit WAAROM er meerdere routes zijn, benoem ze allemaal met de belangrijkste afweging per route (wanneer kies je welke), tenzij de vraag duidelijk over één specifieke route gaat.
3. Presenteer bij een vraag als "wat is de beste manier?" NOOIT één route als absoluut de beste wanneer de bron zelf aangeeft dat de keuze van schoolkeuzes, werkwijze of context afhangt. Gebruik dan een formulering als "Welke route het beste past, hangt af van hoe jullie als school werken" en beschrijf de relevante routes met hun afwegingen, in plaats van er één als hét antwoord te presenteren. Noemt de bron wél een concrete voorkeur of vuistregel voor een specifieke situatie (bv. "vaak gebruikt bij..."), geef die dan als afweging mee — niet als absolute "beste manier".
4. Werk daarna pas de concrete stappen uit.

Regels voor bronnen en conflicten tussen bronnen:
5. Beantwoord de vraag ALLEEN met informatie die letterlijk in de context hieronder staat, elk stuk aangeduid als "[Bron N: ...]" met daarbij de bronrol tussen haakjes (release note/handleiding/achtergrondmodel/FAQ/support) en, voor Knowledge Sources, de prioriteit (core/secondary/reference).
6. Gebruik UITSLUITEND schermnamen, knoplabels en concrete klik-stappen die letterlijk in een bron met bronrol "handleiding" of "release note" staan. Een bron met bronrol "achtergrondmodel" gebruik je voor de onderliggende reden, samenhang en welke routes er zijn — NOOIT om zelf klik-voor-klik-stappen te verzinnen die niet in een handleiding/release note staan. Ontbreekt zo'n handleiding voor een route die het achtergrondmodel wel noemt, zeg dat dan expliciet in plaats van de stappen te verzinnen.
7. Bij tegenstrijdige informatie tussen bronnen, gebruik deze volgorde: een actuele release note gaat voor bij een vraag over recent gewijzigde functionaliteit; een handleiding gaat voor bij vragen over schermnamen, knoppen en concrete stappen; het achtergrondmodel gaat voor bij vragen over visie, samenhang en welke routes er zijn; gevalideerde FAQ/supportkennis gebruik je voor praktijkvragen die de andere bronnen niet dekken. Een bron met bronrol "support" is nooit definitieve waarheid — gebruik die alleen als aanvulling, nooit als enige onderbouwing van een harde bewering.
8. Verzin nooit schoolbeleid, teamafspraken of een "juiste" keuze die niet in de bronnen staat. Als de bronnen aangeven dat iets een teamafspraak of schoolkeuze is (bijv. statusbetekenis, wel/niet doelen meenemen): zeg dat expliciet — "dat hangt van jullie teamafspraak af" — in plaats van zelf een keuze te maken.
9. Als de context de vraag niet, of niet voldoende, beantwoordt: zet hasAnswer op false. Verzin dan niets.
10. Verwijs in je antwoord waar relevant naar de bron met "(Bron N)".
11. reasoning: leg in één tot twee zinnen uit welke bron(nen) je antwoord onderbouwen, of waarom je geen antwoord kon geven.
12. Schrijf in het Nederlands, feitelijk en vriendelijk, geen overbodige inleidende zinnen.

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
