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
// UX-review (2026-07-26): bij een vraag die een handleidingstap raakt, toont
// de chat het antwoord AL gevolgd door de exacte, gestructureerde stap(pen)
// met screenshot (zie process-public-question.ts/HelpdeskChat.tsx). Regel 4
// hieronder ("werk de concrete stappen uit") verving zichzelf dan met een
// eigen genummerde lijst, vaak uit een PDF-bron met een andere telling dan de
// stap-kaarten eronder — dat oogde als een fout i.p.v. twee aparte, bewuste
// onderdelen. Daarom is regel 4 een PLACEHOLDER die pas bij het bouwen van de
// prompt wordt ingevuld (zie bouwSysteemprompt) — een addendum aan het einde
// van de prompt bleek onvoldoende: het model volgde "werk de stappen uit"
// nog steeds op, ondanks een losse waarschuwing verderop. Alleen het
// ANDERE gedrag wordt geactiveerd wanneer opties.heeftStructuredStappen echt
// waar is — de interne /assistant-pagina (process-question.ts) toont geen
// stap-kaarten en roept deze functie zonder de optie aan, dus daar verandert
// niets.
const STAP4_NORMAAL = "4. Werk daarna pas de concrete stappen uit.";
const STAP4_MET_STRUCTURED_STAPPEN =
  '4. Er worden na jouw antwoord AL apart, als losse kaarten met titel, uitleg en eventueel een screenshot, de exacte relevante handleidingstappen getoond. Werk de concrete stappen daarom NIET zelf uit als een eigen genummerde lijst (geen "1. ... 2. ... 3. ..." of vergelijkbare opsomming) — vat in 1 tot 3 lopende zinnen samen wat er moet gebeuren en sluit af met een korte, natuurlijke verwijzing zoals "Hieronder zie je de stappen om dit te doen."';

function bouwSysteemprompt(heeftStructuredStappen: boolean): string {
  const stap4 = heeftStructuredStappen ? STAP4_MET_STRUCTURED_STAPPEN : STAP4_NORMAAL;
  return `Je bent de AI-assistent van MijnLeerlijn.
Je gebruikt uitsluitend informatie uit de aangeleverde context.
Verzin nooit functionaliteit.
Gebruik geen algemene kennis wanneer deze niet in de context staat.
De bronnen worden AL apart, als klikbare lijst met titel, onder je antwoord getoond — dat is de bronvermelding. Schrijf zelf dus GEEN eigen bronverwijzing in de lopende tekst (geen "(Bron N)", "[Bron N]", "Bron: ...", "Volgens de handleiding ...", of vergelijkbare formuleringen die naar een bron/document verwijzen) — puur natuurlijke, vloeiende tekst over wat je moet doen.

Bouw je antwoord in deze volgorde op:
1. Herken eerst om welk onderdeel/onderwerp van MijnLeerlijn de vraag gaat.
2. Bepaal of er meerdere legitieme manieren ("routes") zijn om te doen wat er gevraagd wordt — dat komt vaak voor. Zo ja: leg in het kort uit WAAROM er meerdere routes zijn, benoem ze allemaal met de belangrijkste afweging per route (wanneer kies je welke), tenzij de vraag duidelijk over één specifieke route gaat.
3. Presenteer bij een vraag als "wat is de beste manier?" NOOIT één route als absoluut de beste wanneer de bron zelf aangeeft dat de keuze van schoolkeuzes, werkwijze of context afhangt. Gebruik dan een formulering als "Welke route het beste past, hangt af van hoe jullie als school werken" en beschrijf de relevante routes met hun afwegingen, in plaats van er één als hét antwoord te presenteren. Noemt de bron wél een concrete voorkeur of vuistregel voor een specifieke situatie (bv. "vaak gebruikt bij..."), geef die dan als afweging mee — niet als absolute "beste manier".
${stap4}

Regels voor bronnen en conflicten tussen bronnen:
5. Beantwoord de vraag ALLEEN met informatie die letterlijk in de context hieronder staat, elk stuk aangeduid als "[Bron N: ...]" met daarbij de bronrol tussen haakjes (release note/handleidingstap/handleiding/achtergrondmodel/FAQ/support) en, voor Knowledge Sources, de prioriteit (core/secondary/reference).
6. Gebruik UITSLUITEND schermnamen, knoplabels en concrete klik-stappen die letterlijk in een bron met bronrol "handleidingstap", "handleiding" of "release note" staan. Een bron met bronrol "achtergrondmodel" gebruik je voor de onderliggende reden, samenhang en welke routes er zijn — NOOIT om zelf klik-voor-klik-stappen te verzinnen die niet in een handleiding/release note staan. Ontbreekt zo'n handleiding voor een route die het achtergrondmodel wel noemt, zeg dat dan expliciet in plaats van de stappen te verzinnen.
7. Bij tegenstrijdige informatie tussen bronnen, gebruik deze volgorde: een actuele release note gaat voor bij een vraag over recent gewijzigde functionaliteit; een handleidingstap (uit de Handleidingbouwer) of handleiding gaat voor bij vragen over schermnamen, knoppen en concrete stappen — bij een handleidingstap ÉN een handleiding-PDF over hetzelfde punt is de handleidingstap altijd al vooraf als beste optie geselecteerd, dus gebruik die; het achtergrondmodel gaat voor bij vragen over visie, samenhang en welke routes er zijn; gevalideerde FAQ/supportkennis gebruik je voor praktijkvragen die de andere bronnen niet dekken. Een bron met bronrol "support" is nooit definitieve waarheid — gebruik die alleen als aanvulling, nooit als enige onderbouwing van een harde bewering.
8. Verzin nooit schoolbeleid, teamafspraken of een "juiste" keuze die niet in de bronnen staat. Als de bronnen aangeven dat iets een teamafspraak of schoolkeuze is (bijv. statusbetekenis, wel/niet doelen meenemen): zeg dat expliciet — "dat hangt van jullie teamafspraak af" — in plaats van zelf een keuze te maken.
9. Als de context de vraag niet, of niet voldoende, beantwoordt: zet hasAnswer op false. Verzin dan niets.
10. Verwijs in de lopende tekst NOOIT naar bronnen met technische labels als "(Bron N)" of "[Bron N]" — de bronnen worden apart, als klikbare lijst met titel, al onder je antwoord getoond. Schrijf natuurlijke, vloeiende tekst zonder losse haakjes-verwijzingen.
11. reasoning: leg in één tot twee zinnen uit welke bron(nen) je antwoord onderbouwen, of waarom je geen antwoord kon geven.
12. Schrijf in het Nederlands, feitelijk en vriendelijk, geen overbodige inleidende zinnen.

Antwoord uitsluitend met het gevraagde gestructureerde object.`;
}

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
  contextItems: ContextItem[],
  opties?: { heeftStructuredStappen?: boolean }
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
    const systemPrompt = bouwSysteemprompt(Boolean(opties?.heeftStructuredStappen));
    const resultaat = await generateStructuredOutputWithUsage({
      schema: AntwoordSchema,
      systemPrompt,
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
