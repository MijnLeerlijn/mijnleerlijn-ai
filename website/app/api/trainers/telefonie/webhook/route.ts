import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { telnyxProvider } from "@/lib/trainers/telefonie/telnyx-provider";
import { verwerkInkomendeCall, verwerkTrainingKeuze, verwerkOpnameAfgerond, verwerkOpnameStatus, OPNAME_STOP_TOETS } from "@/lib/trainers/telefonie/gesprek";
import { maakOfHaalOproep } from "@/lib/trainers/telefonie/oproep-state";
import { ontleedTelnyxWebhookJson, vlakTelnyxEventAf } from "@/lib/trainers/telefonie/webhook-helpers";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving V1, Ronde 3.5 vervolg (2026-08-25) — providermigratie
// Twilio -> Telnyx. DE ENE centrale Call Control-webhookroute (spec §17):
// Telnyx stuurt, anders dan Twilio, ALLE events voor ALLE gesprekken naar
// ÉÉN vooraf in de Telnyx Console geconfigureerde webhook-URL (geen
// per-stap action-URL's) — vervangt daarom de 4 losse Twilio-routes
// (inbound/kies-training/opname-afgerond/opname-status) door één dispatcher
// die op `event_type` routeert. De daadwerkelijke orchestratie blijft
// volledig in lib/trainers/telefonie/gesprek.ts — DEZE functies zijn
// ONGEWIJZIGD hergebruikt: verwerkInkomendeCall, verwerkTrainingKeuze,
// verwerkOpnameAfgerond, verwerkOpnameStatus. Alleen WANNEER/met welk
// event ze aangeroepen worden is nieuw (zie de dispatch hieronder + de
// toelichting per event_type).
//
// Callflow-mapping Twilio -> Telnyx (zie ook telnyx-provider.ts se eigen
// doc-comment voor de onderzoeksbasis):
//  call.initiated   -> uitsluitend beantwoordOproep() (spreken mag pas ná
//                       een bevestigd "answer" — hard bevestigd via Telnyx'
//                       eigen SDK-broncode, zie telnyx-provider.ts).
//  call.answered     -> HIER pas verwerkInkomendeCall (trainerherkenning +
//                       eerste gesproken menu) — functioneel de vervanger
//                       van de oude inbound-route.
//  call.gather.ended -> verwerkTrainingKeuze (de enige gather die dit hele
//                       flow ooit uitgeeft: de trainingkeuze/ja-nee-
//                       bevestiging) — vervanger van kies-training.
//  call.dtmf.received-> BEKENDE BEPERKING (vastgesteld via Telnyx' eigen
//                       SDK-broncode, niet langer een aanname): dit event is
//                       door Telnyx uitsluitend gedocumenteerd als
//                       bijbehorend bij gather/gather_using_speak-commando's,
//                       NIET bij record_start. Deze tak (stopt de opname
//                       vroegtijdig op '#' zolang status='opname_verwacht')
//                       vuurt in de praktijk dus vermoedelijk nooit tijdens
//                       het inspreken van het verslag — bewust toch
//                       aangehouden als onschadelijk vangnet (kost niets als
//                       hij nooit triggert) i.p.v. een architectuurwijziging
//                       (bv. een parallelle gather-opdracht ernaast starten)
//                       vlak vóór een productiebeslissing. GEEN functionele
//                       afhankelijkheid: de opname stopt hoe dan ook altijd
//                       via stilte-timeout/max-duur (ongewijzigde waarden,
//                       zie gesprek.ts) — zie het opleverrapport se
//                       beperkingen-sectie.
//  call.recording.saved/.error -> verwerkOpnameStatus (ongewijzigd, inclusief
//                       de bestaande idempotentieclaim/transcriptieherstel/
//                       audiobewaartermijn uit gate 1) — vervanger van
//                       opname-status. Zegt DAARNA best-effort alsnog gedag +
//                       hangt op (vervanger van opname-afgerond) — Telnyx
//                       heeft geen aparte "opname is gestopt"-actie-callback
//                       zoals Twilio's <Record action>, dus dit gebeurt hier,
//                       niet vooraf. voerVoiceInstructiesUit faalt bij Telnyx
//                       bewust nooit door (zie provider.ts) — onschadelijk
//                       als het gesprek dan al beëindigd is (bv. via de
//                       '#'-route hierboven, of de beller hing zelf al op).
//  alles anders      -> stil genegeerd (bv. call.hangup, call.speak.ended,
//                       call.answered voor een niet-inkomend/onverwacht
//                       been) — Telnyx stuurt veel meer event_types dan deze
//                       flow gebruikt, spec §19 se "nooit een onnodige fout":
//                       een event dat niet in de switch voorkomt is geen fout.
//
// Signatuurverificatie (spec §17) gebeurt ÉÉN keer, vóór elke dispatch —
// Telnyx ondertekent de RUWE body-tekst (nooit de vormvelden/URL zoals
// Twilio), zie telnyx-provider.ts se verifieerWebhookSignature.
//
// HTTP-statuscodes: Telnyx' webhookrespons is PUUR een deliverystatus (in
// tegenstelling tot Twilio's TwiML-respons, die zelf de call-control
// mechanica IS) — 403 uitsluitend bij een ongeldige/ontbrekende signature
// (nooit vertrouwen), 200 in ALLE andere gevallen (ook bij rate-limiting of
// een intern gevangen fout) om een onnodige Telnyx-eigen retrystorm op deze
// webhook-aflevering te voorkomen; de eigenlijke callflow-fouten worden al
// via zetMislukt/console.error binnen gesprek.ts zelf afgehandeld.
export const maxDuration = 300; // zelfde reden als de oude opname-status-route: download+Whisper+AI-structurering kan lang duren

const beperkPerNummer = maakRateLimiter(60_000, 20); // call.initiated — sleutel: bellend nummer (zelfde grootte als de oude inbound-route)
const beperkPerGesprek = maakRateLimiter(60_000, 20); // call.answered/gather/dtmf/recording.* — sleutel: call_control_id

export async function POST(request: NextRequest) {
  const provider = telnyxProvider();
  const { ruweBody, event } = await ontleedTelnyxWebhookJson(request);

  if (
    !provider.verifieerWebhookSignature({
      url: request.url, // ongebruikt door Telnyx' adapter — de handtekening gaat over de rauwe body, niet de URL
      vormVelden: {}, // ongebruikt door Telnyx' adapter — zie ruweBody hieronder
      signatureHeader: request.headers.get("telnyx-signature-ed25519"),
      timestampHeader: request.headers.get("telnyx-timestamp"),
      ruweBody,
    })
  ) {
    console.error("[telefonie/webhook] ongeldige/ontbrekende webhook-signature — geweigerd.");
    return new NextResponse(null, { status: 403 });
  }

  const vormVelden = vlakTelnyxEventAf(event);
  const eventType = vormVelden.event_type;
  const callControlId = vormVelden.call_control_id;
  if (!eventType || !callControlId) return new NextResponse(null, { status: 200 }); // onherkenbare/lege payload — stil negeren

  const payload = await getPayload({ config });

  try {
    switch (eventType) {
      case "call.initiated": {
        if (!beperkPerNummer.magVerder(vormVelden.from || callControlId)) break;
        await provider.beantwoordOproep(callControlId);
        break;
      }

      case "call.answered": {
        if (!beperkPerGesprek.magVerder(callControlId)) break;
        const instructies = await verwerkInkomendeCall(payload, provider, vormVelden);
        await provider.voerVoiceInstructiesUit(callControlId, instructies);
        break;
      }

      case "call.gather.ended": {
        if (!beperkPerGesprek.magVerder(callControlId)) break;
        const oproep = await maakOfHaalOproep(payload, callControlId);
        const instructies = await verwerkTrainingKeuze(payload, provider, oproep.id, vormVelden);
        await provider.voerVoiceInstructiesUit(callControlId, instructies);
        break;
      }

      case "call.dtmf.received": {
        if (vormVelden.digit !== OPNAME_STOP_TOETS) break;
        const oproep = await maakOfHaalOproep(payload, callControlId);
        if (oproep.status !== "opname_verwacht") break; // alleen relevant tijdens een daadwerkelijk lopende opname
        if (!beperkPerGesprek.magVerder(callControlId)) break;
        await provider.stopOpname(callControlId);
        await provider.voerVoiceInstructiesUit(callControlId, verwerkOpnameAfgerond());
        break;
      }

      case "call.recording.saved":
      case "call.recording.error": {
        // Sleutel op callControlId (bij dit event al op call_leg_id
        // genormaliseerd, zie vlakTelnyxEventAf) — geen apart recording_id
        // beschikbaar op call.recording.saved (zie telnyx-provider.ts se
        // toelichting), dus geen zinvolle fijnere sleutel voorhanden.
        if (!beperkPerGesprek.magVerder(callControlId)) break;
        const oproep = await maakOfHaalOproep(payload, callControlId);
        await verwerkOpnameStatus(payload, provider, oproep.id, vormVelden);
        await provider.voerVoiceInstructiesUit(callControlId, verwerkOpnameAfgerond());
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error(`[telefonie/webhook] onverwachte fout bij event_type=${eventType}:`, error);
  }

  return new NextResponse(null, { status: 200 });
}
