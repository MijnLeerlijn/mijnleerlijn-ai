import { z } from "zod";
import type { Payload } from "payload";
import { generateStructuredOutput, getAiModelId } from "@/services/ai-client";
import { scrubPotentialPii } from "./pii-scrub";
import { findSimilarArticle, findSimilarDraft } from "./dedup";

// AI-analyse van één Gmail-supportthread tot een conceptkennisartikel — zie
// app/api/support/analyze/route.ts (de enige aanroeper) en de opdracht
// hierboven voor de volledige eisen. Belangrijkste ontwerpregels, allemaal
// met opzet hier en niet elders:
//
// - De AI beslist NOOIT zelf of een concept een bestaand artikel wijzigt of
//   publiceert — deze functie raakt de `articles`-collectie nergens aan,
//   uitsluitend `knowledge-drafts` (en alleen via overrideAccess: true,
//   nooit via de publieke API — zie payload/collections/KnowledgeDrafts.ts).
// - Dubbelcheck op onderwerp gebeurt DETERMINISTISCH in lib/support/dedup.ts,
//   niet door de AI zelf te laten "onthouden" wat er al bestaat (dat zou
//   alleen maar gokken zijn — de AI krijgt de bestaande catalogus niet mee).
// - Persoonsgegevens: de systeemprompt instrueert het model nadrukkelijk
//   nooit namen/schoolnamen/adressen over te nemen; lib/support/pii-scrub.ts
//   is een aanvullend, mechanisch veiligheidsnet (e-mail/telefoon) bovenop
//   die instructie, nooit een vervanging ervoor.
// - Een thread wordt UITSLUITEND op "analyzed" gezet nadat er daadwerkelijk
//   een geldig, gevalideerd resultaat is verwerkt — elke fout (netwerk,
//   ongeldige JSON, schemafout) resulteert in "failed" met de technische
//   reden in aiAnalysisError, nooit stilzwijgend "analyzed".

const AnalyseSchema = z.object({
  title: z.string().min(1).max(200),
  mainQuestion: z.string().min(1),
  isResolved: z.boolean(),
  finalAnswer: z.string(),
  shortAnswer: z.string(),
  fullAnswer: z.string(),
  steps: z
    .array(z.object({ title: z.string().min(1), description: z.string().min(1) }))
    .max(15)
    .default([]),
  category: z.string().min(1),
  keywords: z.array(z.string()).max(10).default([]),
  isGeneralKnowledge: z.boolean(),
  containsPersonalData: z.boolean(),
  personalDataExplanation: z.string().optional().default(""),
  confidenceScore: z.number().min(0).max(100),
  confidenceExplanation: z.string().min(1),
});

type AnalyseOutput = z.infer<typeof AnalyseSchema>;

// Onder dit percentage is de AI zelf te onzeker om iets te bewaren — zie
// "onduidelijk" in de opdracht. Boven MIN maar onder REVIEW: wel bewaren,
// maar met draft.status "review" in plaats van "new", zodat een beheerder
// gerichter kijkt naar de onzekere gevallen.
const MIN_CONFIDENCE_TO_KEEP = 40;
const REVIEW_CONFIDENCE_THRESHOLD = 70;

const MAX_PROMPT_CHARS = 15000;

const SYSTEEMPROMPT = `Je analyseert een e-mailthread tussen een MijnLeerlijn-helpdesk en een gebruiker (leerkracht/school). Je doel: bepalen of deze thread bruikbare, algemene kennis bevat die andere MijnLeerlijn-gebruikers zou kunnen helpen, en zo ja, die kennis samenvatten als een generiek, herbruikbaar conceptartikel.

STRIKTE REGELS, geen uitzonderingen:
1. Neem NOOIT namen van personen, schoolnamen, e-mailadressen, telefoonnummers of andere identificeerbare klant-/leerling-/schoolgegevens over in title, mainQuestion, finalAnswer, shortAnswer, fullAnswer, steps of keywords. Schrijf in plaats daarvan generiek ("een leerkracht", "de school", "een leerling").
2. Verzin nooit een oplossing die niet daadwerkelijk in de thread staat. Als er geen duidelijk antwoord/oplossing in de thread staat, zet isResolved op false en laat finalAnswer leeg.
3. isGeneralKnowledge is alleen true als de kennis ook waarde heeft voor andere MijnLeerlijn-gebruikers, niet als het antwoord alleen relevant is voor dit specifieke, unieke geval van deze ene school/leerling.
4. containsPersonalData geeft aan of de BRONTHREAD persoonsgegevens bevatte (ongeacht of je die al dan niet correct hebt weggelaten) — dit is puur informatief voor de menselijke beoordelaar, niet een reden om isGeneralKnowledge te veranderen.
5. Wees eerlijk en conservatief in confidenceScore (0-100): hoog alleen als de oplossing expliciet en ondubbelzinnig in de thread staat.
6. steps zijn optioneel — vul ze alleen als de oplossing uit duidelijke, volgbare stappen bestaat.

Antwoord uitsluitend met het gevraagde gestructureerde object.`;

function bouwThreadPrompt(thread: {
  subject: string;
  messages: { from: string; sentAt: string; bodyText: string }[];
}): string {
  const kop = `Onderwerp: ${thread.subject}\n\n`;
  const berichten = thread.messages
    .map(
      (m, i) => `--- Bericht ${i + 1} (${new Date(m.sentAt).toISOString().slice(0, 10)}) ---\n${m.bodyText}`
    )
    .join("\n\n");
  const volledig = kop + berichten;

  if (volledig.length <= MAX_PROMPT_CHARS) return volledig;

  // Bij te lange threads: begin (oorspronkelijke vraag) én einde
  // (waarschijnlijke oplossing) behouden, midden inkorten — liever dat dan
  // blindelings vanaf het begin afkappen en de oplossing missen.
  const eersteDeel = volledig.slice(0, Math.floor(MAX_PROMPT_CHARS * 0.4));
  const laatsteDeel = volledig.slice(-Math.floor(MAX_PROMPT_CHARS * 0.6));
  return `${eersteDeel}\n\n[... ingekort wegens lengte ...]\n\n${laatsteDeel}`;
}

export interface ThreadVoorAnalyse {
  id: number;
  subject: string;
  messages: { gmailMessageId: string; from: string; sentAt: string; bodyText: string }[];
}

export type ThreadUitkomst =
  | { type: "ignored"; reden: string }
  | { type: "created"; draftId: number }
  | { type: "updated"; draftId: number }
  | { type: "failed"; foutmelding: string };

/** Analyseert één thread en verwerkt het resultaat (concept aanmaken/bijwerken of negeren). Werkt de thread zelf niet bij — dat doet de aanroeper (lib/support/run-analysis.ts), zodat deze functie puur en goed testbaar blijft. */
export async function analyseThread(payload: Payload, thread: ThreadVoorAnalyse): Promise<ThreadUitkomst> {
  let ruweOutput: AnalyseOutput;
  try {
    ruweOutput = await generateStructuredOutput({
      schema: AnalyseSchema,
      systemPrompt: SYSTEEMPROMPT,
      userPrompt: bouwThreadPrompt(thread),
    });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    return { type: "failed", foutmelding: `AI-analyse mislukt: ${boodschap}` };
  }

  if (
    !ruweOutput.isResolved ||
    !ruweOutput.finalAnswer.trim() ||
    ruweOutput.confidenceScore < MIN_CONFIDENCE_TO_KEEP
  ) {
    const reden = !ruweOutput.isResolved
      ? "Thread lijkt onopgelost — geen duidelijke oplossing gevonden."
      : ruweOutput.confidenceScore < MIN_CONFIDENCE_TO_KEEP
        ? `Te lage betrouwbaarheid (${ruweOutput.confidenceScore}/100): ${ruweOutput.confidenceExplanation}`
        : "Geen bruikbaar eindantwoord gevonden.";
    return { type: "ignored", reden };
  }

  if (!ruweOutput.isGeneralKnowledge) {
    return {
      type: "ignored",
      reden: `Te klantspecifiek om algemeen bruikbaar te zijn: ${ruweOutput.confidenceExplanation}`,
    };
  }

  // Veiligheidsnet: mechanisch scrubben van e-mail/telefoon, bovenop de
  // promptinstructie — zie lib/support/pii-scrub.ts.
  const shortAnswer = scrubPotentialPii(ruweOutput.shortAnswer);
  const fullAnswer = scrubPotentialPii(ruweOutput.fullAnswer);
  const steps = ruweOutput.steps.map((s) => ({
    title: scrubPotentialPii(s.title),
    description: scrubPotentialPii(s.description),
  }));

  const dedupInvoer = {
    title: ruweOutput.title,
    question: ruweOutput.mainQuestion,
    category: ruweOutput.category,
    keywords: ruweOutput.keywords,
  };

  const gelijkendArtikel = await findSimilarArticle(payload, dedupInvoer);
  const gelijkendConcept = await findSimilarDraft(payload, dedupInvoer);

  const artikelNotitie = gelijkendArtikel
    ? ` Let op: mogelijk vergelijkbaar bestaand artikel gevonden: "${gelijkendArtikel.title}" (${gelijkendArtikel.slug}).`
    : "";

  if (gelijkendConcept) {
    // Aanvullende bron voor een bestaand concept: koppelen + lichte
    // confidence-boost, nooit een duplicaat aanmaken — zie de opdracht.
    const bestaand = await payload.findByID({
      collection: "knowledge-drafts",
      id: gelijkendConcept.id,
      overrideAccess: true,
    });
    const nieuweSourceThreads = [
      ...((bestaand.sourceThreads ?? []) as (number | { id: number })[]).map((s) =>
        typeof s === "number" ? s : s.id
      ),
      thread.id,
    ];
    const nieuweScore = Math.min(100, (bestaand.confidenceScore ?? 0) + 5);
    await payload.update({
      collection: "knowledge-drafts",
      id: gelijkendConcept.id,
      overrideAccess: true,
      data: {
        sourceThreads: [...new Set(nieuweSourceThreads)],
        confidenceScore: nieuweScore,
        confidenceExplanation:
          `${bestaand.confidenceExplanation ?? ""}\n\nAanvullende bron gevonden (thread ${thread.id}), score verhoogd naar ${nieuweScore}.${artikelNotitie}`.trim(),
      },
    });
    return { type: "updated", draftId: gelijkendConcept.id };
  }

  const status = ruweOutput.confidenceScore >= REVIEW_CONFIDENCE_THRESHOLD ? "new" : "review";

  const nieuwConcept = await payload.create({
    collection: "knowledge-drafts",
    overrideAccess: true,
    data: {
      title: ruweOutput.title,
      question: ruweOutput.mainQuestion,
      shortAnswer,
      fullAnswer,
      steps,
      category: ruweOutput.category,
      keywords: ruweOutput.keywords,
      sourceThreads: [thread.id],
      confidenceScore: ruweOutput.confidenceScore,
      confidenceExplanation: `${ruweOutput.confidenceExplanation}${artikelNotitie}`,
      isGeneralKnowledge: ruweOutput.isGeneralKnowledge,
      customerSpecificInformationFound: ruweOutput.containsPersonalData,
      customerSpecificInformationExplanation: ruweOutput.personalDataExplanation,
      status,
      aiModel: getAiModelId(),
      aiAnalyzedAt: new Date().toISOString(),
    },
  });

  return { type: "created", draftId: nieuwConcept.id };
}
