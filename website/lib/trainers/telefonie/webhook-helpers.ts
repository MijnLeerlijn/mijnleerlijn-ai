import type { NextRequest } from "next/server";
import { getTrainersOrigin } from "@/config/env";

// Traineromgeving V1, Ronde 3.5 (2026-08-25, providermigratie 2026-08-25
// vervolg) — kleine, gedeelde helpers voor de telefonie-webhookroute(s)
// (spec §17). ontleedWebhookFormulier hieronder was Twilio's eigen
// contenttype (application/x-www-form-urlencoded) — met de overstap naar
// Telnyx (JSON-webhooks) ongebruikt geworden, maar bewust nog niet
// verwijderd totdat vaststaat dat er geen Twilio-restanten meer naar
// verwijzen (zie het opleverrapport). ontleedTelnyxWebhookJson/
// vlakTelnyxEventAf hieronder zijn Telnyx' eigen equivalent — exact zoals
// hier destijds al voorzien: "een toekomstige tweede provider met een ander
// contenttype krijgt zijn eigen parsingfunctie hier, deze routes blijven dan
// ongewijzigd zolang ze via dezelfde Record<string,string>-vorm blijven werken."
export async function ontleedWebhookFormulier(request: NextRequest): Promise<Record<string, string>> {
  const form = await request.formData();
  const velden: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") velden[key] = value;
  }
  return velden;
}

/**
 * Telnyx' webhook-body is JSON, niet form-urlencoded — en de
 * Ed25519-signature gaat over de LETTERLIJKE, ongeparste body-tekst (spec
 * §17), dus de rauwe tekst moet apart bewaard blijven naast het geparste
 * object (een Response-body kan maar één keer gelezen worden, vandaar hier
 * gecombineerd in één functie i.p.v. twee aparte request.text()/request.json()-
 * aanroepen).
 */
export async function ontleedTelnyxWebhookJson(request: NextRequest): Promise<{ ruweBody: string; event: unknown }> {
  const ruweBody = await request.text();
  try {
    return { ruweBody, event: JSON.parse(ruweBody) };
  } catch {
    return { ruweBody, event: null }; // ongeldige JSON -> event blijft null, signatuurcheck met de rauwe tekst gaat sowieso vooraf en faalt normaliter al
  }
}

/**
 * Telnyx' geneste `{data: {event_type, payload: {...}}}`-vorm plat naar
 * dezelfde Record<string,string>-vorm die ontleedInkomendeCall/
 * ontleedGatherResultaat/ontleedOpnameStatus (provider.ts) al van Twilio's
 * vormvelden verwachtten — event_type erbij als eigen sleutel zodat de
 * dispatcher-route erop kan routeren. Geneste velden (bv. recording_urls)
 * worden bewust NIET platgeslagen/meegenomen: telnyx-provider.ts se
 * haalOpnameOp haalt die zelf vers op via het recording_id, nooit via een
 * (mogelijk allang verlopen) URL uit de oorspronkelijke webhook-payload.
 */
export function vlakTelnyxEventAf(event: unknown): Record<string, string> {
  const data = (event && typeof event === "object" ? (event as Record<string, unknown>).data : undefined) as Record<string, unknown> | undefined;
  const payload = (data?.payload && typeof data.payload === "object" ? (data.payload as Record<string, unknown>) : {}) as Record<string, unknown>;
  const vlak: Record<string, string> = { event_type: typeof data?.event_type === "string" ? data.event_type : "" };
  for (const [sleutel, waarde] of Object.entries(payload)) {
    if (waarde === null || waarde === undefined || typeof waarde === "object") continue;
    vlak[sleutel] = String(waarde);
  }
  return vlak;
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
