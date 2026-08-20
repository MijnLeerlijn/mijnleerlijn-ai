import type { NextRequest } from "next/server";
import { getTrainersOrigin } from "@/config/env";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — kleine, gedeelde helpers voor
// de 4 telefonie-webhookroutes (spec §17). Providerneutraal qua NAAM (geen
// "twilio" in de functienamen), maar de vormparsing (application/
// x-www-form-urlencoded) is wel degelijk Twilio's eigen contenttype voor
// voice-webhooks — een toekomstige tweede provider met een ander contenttype
// (bv. JSON) krijgt zijn eigen parsingfunctie hier, deze routes blijven dan
// ongewijzigd zolang ze via dezelfde Record<string,string>-vorm blijven werken.
export async function ontleedWebhookFormulier(request: NextRequest): Promise<Record<string, string>> {
  const form = await request.formData();
  const velden: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") velden[key] = value;
  }
  return velden;
}

/**
 * De EXTERNE URL die de provider daadwerkelijk aanriep, voor
 * signatuurverificatie — BEWUST NIET request.url zelf (kan in een
 * geproxiede/serverless omgeving afwijken van wat de provider extern zag,
 * en zou als headergebaseerde waarde in theorie beïnvloedbaar zijn). Altijd
 * opgebouwd uit de vaste, geconfigureerde trainersorigin
 * (getTrainersOrigin(), config/env.ts — dezelfde bron als de CSRF-allowlist)
 * + het pad/de querystring van het inkomende verzoek zelf.
 */
export function externeWebhookUrl(request: NextRequest): string {
  const { pathname, search } = new URL(request.url);
  return `${getTrainersOrigin()}${pathname}${search}`;
}
