import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { twilioProvider } from "@/lib/trainers/telefonie/twilio-provider";
import { verwerkInkomendeCall } from "@/lib/trainers/telefonie/gesprek";
import { ontleedWebhookFormulier, externeWebhookUrl } from "@/lib/trainers/telefonie/webhook-helpers";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — Twilio's "A call comes in"
// Voice-URL (spec §1 stap 1-6). Dun: alle orchestratie zit in
// lib/trainers/telefonie/gesprek.ts, zelfde scheiding als elke andere route
// in dit project t.o.v. lib/trainers/.
//
// Sleutel op het BELLENDE nummer (niet IP — Twilio's eigen infrastructuur
// belt dit endpoint vanaf wisselende IP's, en het nummer is de
// betekenisvollere/stabielere sleutel voor "iemand belt herhaaldelijk").
const beperkAanvragen = maakRateLimiter(60_000, 20);

export async function POST(request: NextRequest) {
  const provider = twilioProvider();
  const vormVelden = await ontleedWebhookFormulier(request);
  const url = externeWebhookUrl(request);

  if (!beperkAanvragen.magVerder(vormVelden.From || vormVelden.CallSid || "onbekend")) {
    return new NextResponse(provider.bouwVoiceResponse([{ soort: "zeg_en_ophangen", tekst: "Te veel aanvragen. Probeer het later opnieuw." }]), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Spec §17 — nooit een webhook verwerken op basis van alleen URL-kennis.
  if (!provider.verifieerWebhookSignature({ url, signatureHeader: request.headers.get("x-twilio-signature"), vormVelden })) {
    console.error("[telefonie/inbound] ongeldige/ontbrekende webhook-signature — geweigerd.");
    return new NextResponse(null, { status: 403 });
  }

  const payload = await getPayload({ config });
  try {
    const instructies = await verwerkInkomendeCall(payload, provider, vormVelden);
    return new NextResponse(provider.bouwVoiceResponse(instructies), { status: 200, headers: { "Content-Type": "text/xml" } });
  } catch (error) {
    // Spec §19 — een backend-fout mag de beller nooit minutenlang aan de
    // lijn houden: altijd nette TwiML terug (HTTP 200, Twilio speelt anders
    // zijn EIGEN generieke foutmelding af), nooit een 5xx hier.
    console.error("[telefonie/inbound] onverwachte fout:", error);
    return new NextResponse(
      provider.bouwVoiceResponse([{ soort: "zeg_en_ophangen", tekst: "Er ging iets mis. Probeer het later opnieuw of gebruik de traineromgeving." }]),
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }
}
