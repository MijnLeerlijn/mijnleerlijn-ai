import type { Payload } from "payload";
import { generateChatText } from "@/services/ai-client";
import { scrubPotentialPii } from "@/lib/support/pii-scrub";
import { bouwSchoolContext, bouwSchoolPrompt } from "./context";

// Sales UX V2 (2026-08-14) — "Waar staan we?"-samenvatting op het
// schooldetail, voortaan GECACHED (sales-schools.cachedSummary/
// cachedSummaryGeneratedAt) i.p.v. bij elke paginaweergave opnieuw
// gegenereerd. Hergebruikt exact dezelfde contextopbouw als de vrije
// school-chat (bouwSchoolContext/bouwSchoolPrompt, lib/sales/context.ts) —
// alleen de instructie is vast i.p.v. een vrije gebruikersvraag.
//
// Wordt aangeroepen vanuit twee plekken: lib/sales/sync.ts (automatisch,
// uitsluitend voor scholen met nieuwe, betrouwbare Monday-activiteit — nooit
// voor alle scholen, nooit bij een paginaweergave) en de handmatige
// "Vernieuwen"-knop (app/api/sales/school/[id]/summary/route.ts).
//
// Privacy (expliciete bouweis): het resultaat gaat door scrubPotentialPii
// vóórdat het wordt opgeslagen — dezelfde discipline als sales-log-events se
// summary-veld (lib/sales/sync.ts).
const SAMENVATTING_INSTRUCTIE =
  "Geef in maximaal 4 zinnen een samenvatting van waar we nu staan met deze school, puur gebaseerd op de hierboven meegegeven schoolcontext. Geen nieuwe feiten verzinnen.";

export async function genereerEnCacheSchoolSamenvatting(payload: Payload, schoolId: number): Promise<string> {
  const context = await bouwSchoolContext(payload, schoolId, SAMENVATTING_INSTRUCTIE);
  const { systemPrompt, contextBericht } = bouwSchoolPrompt(context);

  const ruweSamenvatting = await generateChatText({
    systemPrompt,
    messages: [{ role: "user", content: `${contextBericht}\n\n---\n\nOpdracht:\n${SAMENVATTING_INSTRUCTIE}` }],
  });
  const samenvatting = scrubPotentialPii(ruweSamenvatting.trim());

  await payload.update({
    collection: "sales-schools",
    id: schoolId,
    data: { cachedSummary: samenvatting, cachedSummaryGeneratedAt: new Date().toISOString() },
    overrideAccess: true,
  });

  return samenvatting;
}
