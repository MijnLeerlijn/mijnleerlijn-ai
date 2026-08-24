import { z } from "zod";
import { generateStructuredOutput, getAiModelId } from "@/services/ai-client";

// Vervolgronde (2026-08-22) — kern-antwoordlogica voor de trainer-Kennis-
// Q&A. Geen Payload-afhankelijkheid, puur testbaar — zelfde opzet als
// lib/assistant/answer.ts, dat hier bewust NIET hergebruikt wordt: dat
// bestand is specifiek voor de (variant-scoped, meerlagige) centrale
// Helpdesk-kennisbasis, met machinery (tegenstrijdigheid, achtergrondmodel,
// structured-stappen) die hier niet van toepassing is. Deze functie is de
// eenvoudige tegenhanger, uitsluitend voor gepubliceerde trainer-
// kennisversies.
//
// HARDE REGEL, in code afgedwongen — niet alleen in de systeeminstructie:
// zonder bronnen of bij een te lage beste overeenkomstscore wordt het
// taalmodel NOOIT aangeroepen. Confidence is altijd de retrieval-score van
// de beste bron, nooit een zelfinschatting van het model. Zelfde filosofie
// als MIN_SIMILARITY_VOOR_ANTWOORD in lib/assistant/answer.ts.

export const MIN_SIMILARITY_VOOR_TRAINERANTWOORD = 0.5;
const GEEN_ANTWOORD_TEKST = "Daarover heb ik in de beschikbare trainerkennis nog onvoldoende informatie.";

export interface TrainerKennisBron {
  id: number;
  titel: string;
  tekst: string;
  similarity: number;
  /** Hoofdstuk waar de best passende chunk van deze bron in stond (opdrachtseis §5) — ontbreekt/null als het document geen hoofdstukmetadata heeft, of de treffer vóór de eerste heading viel. */
  heading?: string | null;
  headingSlug?: string | null;
}

const SYSTEEMPROMPT = `Je bent de kennisassistent voor trainers van MijnLeerlijn.
Je beantwoordt vragen van trainers over MijnLeerlijn en de eigen werkwijze, uitsluitend met informatie uit de aangeleverde trainerkennis hieronder.
Verzin nooit informatie die niet letterlijk in die trainerkennis staat.
Gebruik geen algemene kennis, geen schoolspecifieke context, geen aannames over een specifieke school of training.
De gebruikte kennisartikelen worden AL apart, als klikbare lijst met titel, onder je antwoord getoond — dat is de bronvermelding. Schrijf zelf dus geen eigen bronverwijzing in de lopende tekst (geen "(Bron N)", "[Bron N]", "Volgens artikel ...", of vergelijkbare formuleringen).

Regels:
1. Beantwoord de vraag ALLEEN met informatie die letterlijk in de context hieronder staat, elk stuk aangeduid als "[Bron N: titel]".
2. Als de context de vraag niet, of niet voldoende, beantwoordt: zet hasAnswer op false. Verzin dan niets.
3. reasoning: leg in één zin uit welke bron(nen) je antwoord onderbouwen, of waarom je geen antwoord kon geven.
4. Schrijf in het Nederlands, feitelijk en vriendelijk, geen overbodige inleidende zinnen.

Antwoord uitsluitend met het gevraagde gestructureerde object.`;

const AntwoordSchema = z.object({
  hasAnswer: z.boolean(),
  answer: z.string(),
  reasoning: z.string(),
});

export type TrainerKennisAntwoordUitkomst =
  | { type: "answered"; answer: string; reasoning: string; confidence: number; model: string; bronnen: TrainerKennisBron[] }
  | { type: "no-answer"; answer: string; reasoning: string; confidence: number; model: string; bronnen: TrainerKennisBron[] }
  | { type: "failed"; foutmelding: string };

// Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing":
// `bronnen` kan sindsdien meerdere entries voor HETZELFDE document bevatten
// (verschillende hoofdstukken, zie zoekRelevanteKennis in lib/trainers/
// kennis.ts) — elke entry draagt nog altijd de VOLLEDIGE, ongewijzigde
// documenttekst (bron.tekst verandert niet). Zonder dedup zou het model
// dezelfde volledige tekst tweemaal als aparte "bron" te zien krijgen.
// Bewust een dedup UITSLUITEND hier, voor de prompt — de teruggegeven
// `bronnen` (de citaties naar de trainer toe) blijven ongewijzigd
// per-hoofdstuk, zodat meerdere relevante hoofdstukken alsnog allemaal een
// eigen "Bekijk hoofdstuk"-link krijgen (opdrachtseis §5).
function dedupliceerPerDocument(bronnen: TrainerKennisBron[]): TrainerKennisBron[] {
  const gezien = new Set<number>();
  const resultaat: TrainerKennisBron[] = [];
  for (const bron of bronnen) {
    if (gezien.has(bron.id)) continue;
    gezien.add(bron.id);
    resultaat.push(bron);
  }
  return resultaat;
}

function contextNaarPrompt(bronnen: TrainerKennisBron[]): string {
  return dedupliceerPerDocument(bronnen)
    .map((b, i) => `[Bron ${i + 1}: ${b.titel}]\n${b.tekst}`)
    .join("\n\n");
}

export async function genereerTrainerKennisAntwoord(vraag: string, bronnen: TrainerKennisBron[]): Promise<TrainerKennisAntwoordUitkomst> {
  const besteScore = bronnen[0]?.similarity ?? 0;
  const confidence = Math.round(besteScore * 100);

  if (bronnen.length === 0 || besteScore < MIN_SIMILARITY_VOOR_TRAINERANTWOORD) {
    return {
      type: "no-answer",
      answer: GEEN_ANTWOORD_TEKST,
      reasoning:
        bronnen.length === 0
          ? "Geen enkel gepubliceerd trainerkennisartikel met voldoende semantische overlap gevonden."
          : `De best passende bron had een te lage overeenkomstscore (${confidence}%) om betrouwbaar te gebruiken.`,
      confidence,
      model: getAiModelId(),
      bronnen: [],
    };
  }

  let object: z.infer<typeof AntwoordSchema>;
  try {
    object = await generateStructuredOutput({
      schema: AntwoordSchema,
      systemPrompt: SYSTEEMPROMPT,
      userPrompt: `Vraag: ${vraag}\n\nContext:\n${contextNaarPrompt(bronnen)}`,
    });
  } catch (error) {
    return { type: "failed", foutmelding: error instanceof Error ? error.message : String(error) };
  }

  if (!object.hasAnswer || !object.answer.trim()) {
    return {
      type: "no-answer",
      answer: GEEN_ANTWOORD_TEKST,
      reasoning: object.reasoning?.trim() || "Het taalmodel kon de vraag niet betrouwbaar beantwoorden vanuit de trainerkennis.",
      confidence,
      model: getAiModelId(),
      bronnen: [],
    };
  }

  return {
    type: "answered",
    answer: object.answer.trim(),
    reasoning: object.reasoning.trim(),
    confidence,
    model: getAiModelId(),
    bronnen,
  };
}
