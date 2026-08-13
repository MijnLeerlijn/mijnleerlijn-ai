import { z } from "zod";
import { generateStructuredOutput } from "@/services/ai-client";
import { scrubPotentialPii } from "@/lib/support/pii-scrub";

// Creator V1 (2026-08-13) — "Maak hier een kennisstuk van" (sectie 16 van de
// opdracht). Hergebruikt bewust hetzelfde patroon als lib/support/analyze.ts
// (gestructureerde extractie + scrubPotentialPii als mechanisch vangnet,
// géén tweede scrub-implementatie) — hier toegepast op één mail i.p.v. een
// hele threadgeschiedenis. Persisteert zelf NIETS (geen payload.create) —
// de aanroeper (Creator-actie/API-route) zet het resultaat pas na expliciete
// goedkeuring in knowledge-drafts (origin: "creator-mail", sourceMailDraft:
// <id>), zelfde "mens keurt goed vóór het kennis wordt" als de bestaande
// support-thread-flow. De mail zelf (mail-drafts) blijft een los record —
// zie ontwerpregel 8/9 in de opdracht.
const KennisstukSchema = z.object({
  title: z.string(),
  question: z.string(),
  shortAnswer: z.string(),
  fullAnswer: z.string(),
  containsPersonalData: z.boolean(),
  personalDataExplanation: z.string().optional(),
});

const SYSTEEMPROMPT =
  "Je maakt van een mailwisseling (vraag + antwoord) een generiek, herbruikbaar kennisstuk voor de MijnLeerlijn-kennisbank. Neem NOOIT namen van personen, schoolnamen, e-mailadressen, telefoonnummers of andere identificeerbare gegevens over — schrijf generiek. Verzin geen informatie die niet in de mail/het antwoord stond. Stond er klant-/schoolspecifieke informatie in de brontekst, geef dat aan via containsPersonalData/personalDataExplanation.";

export interface MailToKnowledgeOpties {
  ontvangenTekst: string;
  conceptAntwoord: string;
}

export interface MailToKnowledgeResultaat {
  title: string;
  question: string;
  shortAnswer: string;
  fullAnswer: string;
  customerSpecificInformationFound: boolean;
  customerSpecificInformationExplanation?: string;
}

export async function maakKennisstukVanMail(opties: MailToKnowledgeOpties): Promise<MailToKnowledgeResultaat> {
  const ruweOutput = await generateStructuredOutput({
    schema: KennisstukSchema,
    systemPrompt: SYSTEEMPROMPT,
    userPrompt: `Ontvangen vraag:\n${opties.ontvangenTekst}\n\nGegeven antwoord:\n${opties.conceptAntwoord}`,
  });

  return {
    title: ruweOutput.title,
    question: scrubPotentialPii(ruweOutput.question),
    shortAnswer: scrubPotentialPii(ruweOutput.shortAnswer),
    fullAnswer: scrubPotentialPii(ruweOutput.fullAnswer),
    customerSpecificInformationFound: ruweOutput.containsPersonalData,
    customerSpecificInformationExplanation: ruweOutput.personalDataExplanation,
  };
}
