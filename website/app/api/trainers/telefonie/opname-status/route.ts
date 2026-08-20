import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { twilioProvider } from "@/lib/trainers/telefonie/twilio-provider";
import { verwerkOpnameStatus } from "@/lib/trainers/telefonie/gesprek";
import { ontleedWebhookFormulier, externeWebhookUrl } from "@/lib/trainers/telefonie/webhook-helpers";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — Twilio's recordingStatusCallback
// (spec §8/§12): DE plek waar opname ophalen -> transcriberen -> bestaande
// Ronde-3-verslag-AI daadwerkelijk gebeurt. Idempotentie tegen een dubbele/
// herhaalde callback zit in gesprek.ts se claimOpnameVerwerking (atomische
// conditionele UPDATE, spec §12/§18/§24) — deze route hoeft daar zelf niets
// extra's voor te doen, roept gewoon telkens opnieuw aan.
//
// Twilio verwacht op een statuscallback geen TwiML-inhoud (de beller heeft
// al opgehangen/de goodbye gehad via ../opname-afgerond) — uitsluitend een
// 2xx-statuscode om de callback als afgehandeld te markeren.
const beperkAanvragen = maakRateLimiter(60_000, 20);

// Zwaarste route van de vier: opname downloaden + Whisper-transcriptie +
// bestaande AI-structurering kunnen bij een lange dictatie (spec §8: tot
// 10-15 min) samen een aanzienlijke tijd kosten. Vercel's Hobby-plan
// negeert dit (hard plafond 60s) — zie het opleverrapport se
// beperkingen-sectie; op Pro/Enterprise is dit wél instelbaar.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const provider = twilioProvider();
  const vormVelden = await ontleedWebhookFormulier(request);
  const url = externeWebhookUrl(request);
  const oproepIdRuw = new URL(request.url).searchParams.get("oproepId");
  const oproepId = oproepIdRuw ? Number.parseInt(oproepIdRuw, 10) : NaN;

  if (!beperkAanvragen.magVerder(vormVelden.RecordingSid || vormVelden.CallSid || "onbekend")) {
    return new NextResponse(null, { status: 429 });
  }

  if (!provider.verifieerWebhookSignature({ url, signatureHeader: request.headers.get("x-twilio-signature"), vormVelden })) {
    console.error("[telefonie/opname-status] ongeldige/ontbrekende webhook-signature — geweigerd.");
    return new NextResponse(null, { status: 403 });
  }

  if (!Number.isInteger(oproepId)) {
    console.error("[telefonie/opname-status] ontbrekend/ongeldig oproepId in querystring.");
    return new NextResponse(null, { status: 400 });
  }

  const payload = await getPayload({ config });
  try {
    await verwerkOpnameStatus(payload, provider, oproepId, vormVelden);
  } catch (error) {
    // Spec §19 — database tijdelijk onbereikbaar e.d.: nette 200 richting
    // Twilio (voorkomt een onnodige providerretrystorm bovenop een reeds
    // gefaalde poging), de fout is al in de oproeprij vastgelegd door
    // verwerkOpnameStatus zelf waar mogelijk; alleen een échte, buiten die
    // functie opgetreden crash komt hier terecht.
    console.error("[telefonie/opname-status] onverwachte fout:", error);
  }
  return new NextResponse(null, { status: 200 });
}
