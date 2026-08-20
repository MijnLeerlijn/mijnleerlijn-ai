import { NextResponse, type NextRequest } from "next/server";
import { twilioProvider } from "@/lib/trainers/telefonie/twilio-provider";
import { verwerkOpnameAfgerond } from "@/lib/trainers/telefonie/gesprek";
import { ontleedWebhookFormulier, externeWebhookUrl } from "@/lib/trainers/telefonie/webhook-helpers";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — <Record>'s eigen `action`-URL:
// vuurt zodra de opname STOPT (stilte/maxLength/stopToets), NIET zodra hij
// daadwerkelijk beschikbaar/gedownload is (dat is recordingStatusCallback,
// zie ../opname-status). Uitsluitend het afsluitende gesproken bericht (spec
// §7-voorbeeld "Dank je...") — GEEN download/transcriptie/conceptaanmaak
// hier, dat zou de beller onnodig aan de lijn houden (spec §19) terwijl de
// opname elders al veilig async verwerkt wordt.
export async function POST(request: NextRequest) {
  const provider = twilioProvider();
  const vormVelden = await ontleedWebhookFormulier(request);
  const url = externeWebhookUrl(request);

  if (!provider.verifieerWebhookSignature({ url, signatureHeader: request.headers.get("x-twilio-signature"), vormVelden })) {
    console.error("[telefonie/opname-afgerond] ongeldige/ontbrekende webhook-signature — geweigerd.");
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(provider.bouwVoiceResponse(verwerkOpnameAfgerond()), { status: 200, headers: { "Content-Type": "text/xml" } });
}
