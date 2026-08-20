import twilio from "twilio";
import { requireEnv } from "@/config/env";
import type { TelefonieProvider, InkomendeCallGegevens, GatherResultaat, OpnameStatusGegevens, VoiceInstructie } from "./provider";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — de ENIGE plek waar
// Twilio-specifieke concepten (TwiML, CallSid/From/Digits/RecordingSid/
// RecordingStatus, X-Twilio-Signature) mogen voorkomen (spec §16). Elke
// andere telefonie-/webhookmodule praat uitsluitend tegen de generieke
// TelefonieProvider-interface (./provider.ts).
//
// Providerkeuze/motivatie: zie het opleverrapport. Kort: officiële Node-SDK
// met kant-en-klare validateRequest() (HMAC-SHA1 over de exacte
// vormvelden+URL, spec §17), declaratief TwiML-antwoordmodel dat één-op-één
// op stateless Next.js-routes past, zelfbedienings-Nederlandse nummers.

// Twilio's bekende sentinel-waarden voor een verborgen/onbeschikbare
// beller-ID (platformkennis, algemeen gedocumenteerd gedrag — niet in DEZE
// sessie live tegen een echt gesprek geverifieerd, zie het opleverrapport se
// beperkingen-sectie). Hoofdletterongevoelig vergeleken.
const VERBORGEN_NUMMER_WAARDEN = new Set(["anonymous", "restricted", "unavailable", "private", ""]);

function twilioClient() {
  return twilio(requireEnv("TWILIO_ACCOUNT_SID"), requireEnv("TWILIO_AUTH_TOKEN"));
}

function bouwTwiMLInstructie(response: InstanceType<typeof twilio.twiml.VoiceResponse>, instructie: VoiceInstructie): void {
  switch (instructie.soort) {
    case "zeg_en_ophangen":
      response.say({ language: "nl-NL" }, instructie.tekst);
      response.hangup();
      return;
    case "zeg_en_kies_cijfers": {
      const gather = response.gather({
        input: ["dtmf"],
        numDigits: instructie.maxCijfers,
        timeout: instructie.timeoutSeconden,
        action: instructie.actieUrl,
        method: "POST",
      });
      gather.say({ language: "nl-NL" }, instructie.tekst);
      // Geen invoer binnen de timeout -> Twilio vervolgt na </Gather> — geen
      // losse actionOnEmptyResult nodig zolang we hier zelf netjes afsluiten
      // i.p.v. oneindig opnieuw te vragen (spec §19: "geen minutenlang aan de lijn").
      response.say({ language: "nl-NL" }, "Ik heb geen keuze ontvangen. Probeer het later opnieuw vanuit de traineromgeving.");
      response.hangup();
      return;
    }
    case "zeg_en_neem_op": {
      response.say({ language: "nl-NL" }, instructie.tekst);
      response.record({
        action: instructie.actieUrl,
        method: "POST",
        maxLength: instructie.maxDuurSeconden,
        timeout: instructie.stilteTimeoutSeconden,
        finishOnKey: instructie.stopToets,
        playBeep: true,
        recordingStatusCallback: instructie.statusCallbackUrl,
        recordingStatusCallbackMethod: "POST",
        // "absent" = geen opname tot stand gekomen (bv. meteen opgehangen) —
        // de TwiML-SDK kent geen "failed" als callbacktrigger-waarde (dat IS
        // wél een mogelijke RecordingStatus-waarde die Twilio in de callback
        // zelf teruggeeft, zie ontleedOpnameStatus hieronder — twee losse
        // enums, hier de trigger-kant).
        recordingStatusCallbackEvent: ["completed", "absent"],
        // BEWUST false — spec §11/opdrachtseis: transcriptie loopt via de
        // bestaande OpenAI-infrastructuur (services/ai-client.ts), nooit via
        // Twilio's eigen (los gefactureerde, andere-provider) transcriptiedienst.
        transcribe: false,
      });
      // <Record> zonder invoer/te vroeg opgehangen -> Twilio vervolgt hierna.
      response.say({ language: "nl-NL" }, "Ik heb niets ontvangen. Je kunt het later opnieuw proberen.");
      response.hangup();
      return;
    }
  }
}

export function twilioProvider(): TelefonieProvider {
  return {
    naam: "twilio",

    verifieerWebhookSignature({ url, signatureHeader, vormVelden }) {
      if (!signatureHeader) return false;
      try {
        return twilio.validateRequest(requireEnv("TWILIO_AUTH_TOKEN"), signatureHeader, url, vormVelden);
      } catch {
        // Nooit een kapotte/onverwachte headervorm laten crashen — dat is
        // functioneel identiek aan "ongeldige signature", nooit vertrouwen.
        return false;
      }
    },

    ontleedInkomendeCall(vormVelden): InkomendeCallGegevens {
      const van = vormVelden.From ?? "";
      return {
        providerCallId: vormVelden.CallSid ?? "",
        vanNummerRuw: VERBORGEN_NUMMER_WAARDEN.has(van.toLowerCase()) ? null : van,
        nummerVerborgen: VERBORGEN_NUMMER_WAARDEN.has(van.toLowerCase()),
      };
    },

    ontleedGatherResultaat(vormVelden): GatherResultaat {
      const cijfers = vormVelden.Digits;
      return { cijfers: cijfers && cijfers.length > 0 ? cijfers : null };
    },

    ontleedOpnameStatus(vormVelden): OpnameStatusGegevens {
      const status = vormVelden.RecordingStatus === "completed" ? "voltooid" : "mislukt";
      const duur = vormVelden.RecordingDuration ? Number.parseInt(vormVelden.RecordingDuration, 10) : null;
      return {
        providerCallId: vormVelden.CallSid ?? "",
        providerRecordingId: vormVelden.RecordingSid ?? "",
        status,
        duurSeconden: duur !== null && Number.isFinite(duur) ? duur : null,
        ophaalReferentie: status === "voltooid" ? (vormVelden.RecordingUrl ?? null) : null,
      };
    },

    bouwVoiceResponse(instructies): string {
      const response = new twilio.twiml.VoiceResponse();
      for (const instructie of instructies) bouwTwiMLInstructie(response, instructie);
      return response.toString();
    },

    async haalOpnameOp(ophaalReferentie): Promise<ArrayBuffer> {
      // Provider-geauthenticeerde download (spec §9) — Twilio's RecordingUrl
      // vereist Basic Auth (Account SID/Auth Token) en accepteert een
      // media-extensie voor de ruwe audiobytes i.p.v. de JSON-resource
      // (algemene, gedocumenteerde Twilio-conventie — niet in deze sandbox
      // live geverifieerd, geen uitgaand netwerk naar api.twilio.com/
      // media.twiliocdn.com beschikbaar, zie het opleverrapport).
      const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
      const authToken = requireEnv("TWILIO_AUTH_TOKEN");
      const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const response = await fetch(`${ophaalReferentie}.mp3`, { headers: { Authorization: `Basic ${basicAuth}` } });
      if (!response.ok) {
        throw new Error(`Opname ophalen mislukt: HTTP ${response.status}`);
      }
      return response.arrayBuffer();
    },

    async verwijderOpname(providerRecordingId): Promise<void> {
      await twilioClient().recordings(providerRecordingId).remove();
    },
  };
}
