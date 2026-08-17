import { z } from "zod";
import { generateStructuredOutput } from "@/services/ai-client";

// Mijn Werk Fase 2 (2026-08-17) — intentie-routing voor de Mijn Werk
// Vraag-chat, zelfde vormgeving als lib/assistant/bepaal-intentie.ts: één
// generateStructuredOutput()-aanroep, daarna een kleine, in TypeScript
// vastgelegde beslisregel (nooit het model zelf laten kiezen welke context
// het krijgt) — hier simpeler dan bepaal-intentie.ts (geen verduidelijkings-
// ronde nodig): een beste-inschatting-classificatie volstaat, met een veilige
// "algemeen"-terugval bij twijfel of een fout. Doel: nooit standaard de
// volledige agenda/Sales-geschiedenis meesturen (opdrachtseis) — de gekozen
// categorie bepaalt in lib/werk/mijn-werk-chat.ts welke, MINIMALE context
// wordt opgehaald.
export type WerkVraagCategorie = "planning" | "school" | "voorbereiding" | "algemeen";

export interface WerkVraagRoutering {
  categorie: WerkVraagCategorie;
  /**
   * Ruwe schoolnaam zoals genoemd/geparafraseerd in de vraag, puur signaal —
   * WORDT NOOIT ZELF ALS SCHOOLCONTEXT GEBRUIKT. lib/werk/mijn-werk-chat.ts
   * matcht dit deterministisch (matchSchoolBetrouwbaar, lib/werk/
   * school-matching.ts) tegen echt bestaande scholen; bij twijfel geen
   * automatische koppeling.
   */
  genoemdeSchoolNaam: string | null;
}

const SYSTEEMPROMPT = `Je bepaalt welk type vraag een MijnLeerlijn-medewerker stelt aan de "Mijn Werk"-assistent, zodat de juiste, MINIMALE context wordt opgehaald — nooit meer dan nodig.

Categorieën:
- "planning": vragen over wat er op de agenda/taken/sales-planning staat (bv. "Wat heb ik morgen?", "Wat staat er deze week?", "Heb ik donderdag iets bij [school]?").
- "school": vragen die duidelijk uitsluitend over ÉÉN specifieke school gaan, zonder dat het om een agenda-planningsvraag gaat (bv. "Wat is de status bij [school]?", "Waar wachten we op bij [school]?").
- "voorbereiding": vragen over voorbereiden op een concrete, aankomende afspraak (bv. "Bereid mijn training van vrijdag voor.", "Waar moet ik me deze week op voorbereiden?").
- "algemeen": past bij geen van bovenstaande, of is te vaag om te classificeren.

Noem je een school in "genoemdeSchoolNaam" alleen wanneer de vraag daadwerkelijk een specifieke schoolnaam bevat (letterlijk of duidelijk parafraserend) — anders null. Dit is puur signaal ter herkenning, jij matcht deze naam zelf niet tegen een database en verzint nooit een naam die niet in de vraag voorkomt.`;

const RouteringSchema = z.object({
  categorie: z.enum(["planning", "school", "voorbereiding", "algemeen"]),
  genoemdeSchoolNaam: z.string().nullable(),
});

/** Faalt nooit hard — bij een fout valt dit terug op "algemeen" (brede-maar-begrensde planningcontext, zie mijn-werk-chat.ts), nooit een crash van de hele Vraag-chat. */
export async function routeerWerkVraag(vraag: string): Promise<WerkVraagRoutering> {
  try {
    const result = await generateStructuredOutput({
      schema: RouteringSchema,
      systemPrompt: SYSTEEMPROMPT,
      userPrompt: `Vraag: "${vraag}"`,
    });
    return { categorie: result.categorie, genoemdeSchoolNaam: result.genoemdeSchoolNaam?.trim() || null };
  } catch {
    return { categorie: "algemeen", genoemdeSchoolNaam: null };
  }
}
