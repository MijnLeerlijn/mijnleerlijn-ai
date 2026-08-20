import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { twilioProvider } from "@/lib/trainers/telefonie/twilio-provider";
import { verwerkTrainingKeuze } from "@/lib/trainers/telefonie/gesprek";
import { ontleedWebhookFormulier, externeWebhookUrl } from "@/lib/trainers/telefonie/webhook-helpers";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — de <Gather>-action-URL na de
// trainingkeuze/ja-nee-bevestiging (spec §5/§7). `oproepId` komt uit de
// querystring die gesprek.ts se verwerkInkomendeCall zelf op de actieUrl
// zette — nooit een client-aangeleverd trainingId/schoolId hier vertrouwen
// (spec §6), uitsluitend de eigen call-state-rij-ID.
const beperkAanvragen = maakRateLimiter(60_000, 20);

export async function POST(request: NextRequest) {
  const provider = twilioProvider();
  const vormVelden = await ontleedWebhookFormulier(request);
  const url = externeWebhookUrl(request);
  const oproepIdRuw = new URL(request.url).searchParams.get("oproepId");
  const oproepId = oproepIdRuw ? Number.parseInt(oproepIdRuw, 10) : NaN;

  if (!beperkAanvragen.magVerder(vormVelden.CallSid || "onbekend")) {
    return new NextResponse(provider.bouwVoiceResponse([{ soort: "zeg_en_ophangen", tekst: "Te veel aanvragen. Probeer het later opnieuw." }]), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  if (!provider.verifieerWebhookSignature({ url, signatureHeader: request.headers.get("x-twilio-signature"), vormVelden })) {
    console.error("[telefonie/kies-training] ongeldige/ontbrekende webhook-signature — geweigerd.");
    return new NextResponse(null, { status: 403 });
  }

  if (!Number.isInteger(oproepId)) {
    return new NextResponse(provider.bouwVoiceResponse([{ soort: "zeg_en_ophangen", tekst: "Er ging iets mis. Probeer het later opnieuw." }]), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  const payload = await getPayload({ config });
  try {
    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, vormVelden);
    return new NextResponse(provider.bouwVoiceResponse(instructies), { status: 200, headers: { "Content-Type": "text/xml" } });
  } catch (error) {
    console.error("[telefonie/kies-training] onverwachte fout:", error);
    return new NextResponse(
      provider.bouwVoiceResponse([{ soort: "zeg_en_ophangen", tekst: "Er ging iets mis. Probeer het later opnieuw of gebruik de traineromgeving." }]),
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }
}
