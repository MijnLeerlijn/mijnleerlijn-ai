import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { telnyxProvider } from "@/lib/trainers/telefonie/telnyx-provider";
import { verwerkInkomendeCall, verwerkTrainingKeuze, verwerkOpnameToets, verwerkSpreekAfgerond, verwerkOpnameAfgerond, verwerkOpnameStatus } from "@/lib/trainers/telefonie/gesprek";
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
//  call.gather.ended -> TWEE verschillende gathers monden hier uit — de
//                       trainingkeuze/ja-nee-bevestiging-gather (geen opname
//                       actief) en de parallelle '#'/'*'-gather die naast een
//                       actieve opname meeloopt (telnyx-provider.ts se
//                       voerInstructieUit, opname_starten/opname_hervatten-
//                       tak). Onderscheiden via oproep.status ===
//                       "opname_verwacht" -> verwerkOpnameToets; alle andere
//                       statussen -> verwerkTrainingKeuze.
//                       PRODUCTIEREGRESSIE-RONDE (2026-08-27, spec "*/# doen
//                       niets tijdens de opname") — ROOT CAUSE: dit
//                       onderscheid liep tot deze fix via het `gather_id`-veld
//                       dat elk gather-commando zelf meegeeft
//                       (telnyx-provider.ts, gather_id="opname_toets"), in de
//                       veronderstelling dat Telnyx dat op het
//                       call.gather.ended-webhookevent zou terugsturen.
//                       HARD WEERLEGD tegen Telnyx' eigen SDK-broncode
//                       (telnyx@7.17.0, verse install, zelfde offline-
//                       referentiemethode als eerder in dit project):
//                       `gather_id` komt in de VOLLEDIGE SDK uitsluitend voor
//                       als schrijf-parameter (ActionGatherParams,
//                       resources/calls/actions.d.ts) — nooit als veld op
//                       enig webhook-payload-type. `CallGatherEnded.Payload`
//                       (webhooks.d.ts) somt zijn velden expliciet op
//                       (call_control_id/call_leg_id/call_session_id/
//                       client_state/connection_id/digits/from/status/to) —
//                       gather_id ontbreekt daar, ondanks dat
//                       ActionGatherParams se eigen doc-comment claimt "will
//                       be sent back in the corresponding call.gather.ended
//                       webhook" (een kennelijke discrepantie tussen Telnyx'
//                       documentatie en het daadwerkelijke response-schema).
//                       `vormVelden.gather_id === "opname_toets"` was hierdoor
//                       STRUCTUREEL nooit waar — elk call.gather.ended-event,
//                       ook tijdens een actieve opname, ging altijd naar
//                       verwerkTrainingKeuze (die '#'/'*' niet herkent en
//                       zonder hoorbaar effect afwijst/negeert). Vervangen
//                       door oproep.status — EXACT dezelfde voorwaarde die
//                       verwerkOpnameToets zelf al als eigen guard hanteert
//                       (`oproep.status !== "opname_verwacht" -> []`), dus
//                       geen nieuwe aanname, uitsluitend de dispatch-laag op
//                       één lijn met de al-vertrouwde voorwaarde van de
//                       handler zelf.
//                       Correctie op een eerdere, onvolledige redenering in
//                       dit bestand: startRecording() se EIGEN "Expected
//                       Webhooks" (call.recording.saved/.transcription.saved/
//                       .error) noemt inderdaad nooit call.dtmf.received —
//                       maar dat zegt niets over de PARALLELLE gather()-
//                       opdracht die naast de opname meeloopt. gather() se
//                       EIGEN "Expected Webhooks" (actions.js, hard bevestigd)
//                       noemt wél expliciet BEIDE: "call.dtmf.received (you
//                       may receive many of these webhooks)" én
//                       "call.gather.ended" — DTMF tijdens een actieve
//                       parallelle gather wordt door Telnyx dus wél degelijk
//                       verwacht/afgeleverd. call.dtmf.received zelf wordt nog
//                       niet gedispatcht (zie hieronder — bewust nog niet, bij
//                       maximum_digits:1 hoort het bijbehorende
//                       call.gather.ended zelf al voldoende te zijn), maar
//                       wordt deze ronde wél tijdelijk gelogd (puur
//                       diagnostiek) om dat op de eerstvolgende live call
//                       hard te bevestigen.
//  call.speak.ended -> productieblocker-ronde (2026-08-26, spec "instructie
//                       moet volledig zijn uitgesproken vóór opname start")
//                       -> verwerkSpreekAfgerond: DE deterministische
//                       bevestiging (Telnyx' eigen "Expected Webhooks" op het
//                       speak-commando) dat een eerdere zeg_en_neem_op/
//                       zeg_en_hervat_opname-tekst volledig is uitgesproken —
//                       pas dan volgt record_start/record_resume. Een
//                       call.speak.ended zonder herkenbare client_state (bv.
//                       het gewone afscheidsbericht) wordt door
//                       verwerkSpreekAfgerond zelf stil genegeerd, geen
//                       aparte voorwaarde hier nodig.
//  call.recording.saved/.error -> verwerkOpnameStatus (ongewijzigd, inclusief
//                       de bestaande idempotentieclaim/transcriptieherstel/
//                       audiobewaartermijn uit gate 1) — vervanger van
//                       opname-status. Zegt DAARNA best-effort alsnog gedag
//                       (vervanger van opname-afgerond, zelf weer speak-only
//                       + deferred hangup via call.speak.ended, zie hierboven)
//                       — Telnyx heeft geen aparte "opname is gestopt"-actie-
//                       callback zoals Twilio's <Record action>, dus dit
//                       gebeurt hier, niet vooraf. Productieregressie-
//                       vervolgronde (2026-08-27): verwerkOpnameAfgerond is nu
//                       claim-gated (oproep-state.ts se claimAfsluitboodschap)
//                       — dit is dus BEWUST ook een geldige, eigen trigger
//                       voor de afsluitboodschap (niet alleen een fallback bij
//                       het uitblijven van '#'), maar spreekt 'm alleen
//                       daadwerkelijk uit als de '#'-afhandeling hierboven dat
//                       nog niet zelf al deed — nooit allebei. voerVoiceInstructiesUit
//                       faalt bij Telnyx bewust nooit door (zie provider.ts) —
//                       onschadelijk als het gesprek dan al beëindigd is (bv.
//                       via de '#'-afhandeling hierboven, of de beller hing
//                       zelf al op).
//  alles anders      -> stil genegeerd (bv. call.hangup, call.speak.started,
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
        // TIJDELIJKE DIAGNOSTIEK (productieregressie-ronde 2026-08-27, spec
        // "*/# doen niets tijdens de opname") — uitsluitend niet-herleidbare
        // technische velden (geen audio/transcriptie/telefoonnummer/API-key/
        // persoonsgegevens): bevestigt op de eerstvolgende live call of
        // gather_id daadwerkelijk afwezig is (zie de root-cause-toelichting
        // bovenaan dit bestand) en wat digits/status/oproep op dat moment zijn.
        // Verwijderen zodra dit hard bevestigd is.
        console.log(
          `[telefonie/diag] event_type=call.gather.ended gather_id=${vormVelden.gather_id ?? "(geen)"} digits=${vormVelden.digits ?? "(geen)"} oproepStatus=${oproep.status} oproepId=${oproep.id} gekozenTrainingId=${oproep.gekozenMondayTrainingId ?? "(geen)"}`
        );
        const instructies =
          oproep.status === "opname_verwacht"
            ? await verwerkOpnameToets(payload, provider, oproep.id, vormVelden)
            : await verwerkTrainingKeuze(payload, provider, oproep.id, vormVelden);
        await provider.voerVoiceInstructiesUit(callControlId, instructies);
        break;
      }

      case "call.dtmf.received": {
        // TIJDELIJKE DIAGNOSTIEK (productieregressie-ronde 2026-08-27) —
        // uitsluitend loggen, GEEN dispatch: Telnyx' eigen "Expected
        // Webhooks" op de gather-opdracht noemen dit event expliciet naast
        // call.gather.ended (zie de toelichting bovenaan dit bestand). Bij
        // maximum_digits:1 hoort het bijbehorende call.gather.ended-event
        // zelf al voldoende te zijn om '#'/'*' te verwerken — dit event
        // bevestigt uitsluitend of/wanneer Telnyx het daadwerkelijk stuurt.
        // Verwijderen zodra dat hard bevestigd is.
        if (!beperkPerGesprek.magVerder(callControlId)) break;
        const oproep = await maakOfHaalOproep(payload, callControlId);
        console.log(
          `[telefonie/diag] event_type=call.dtmf.received digit=${vormVelden.digit ?? "(geen)"} oproepStatus=${oproep.status} oproepId=${oproep.id} gekozenTrainingId=${oproep.gekozenMondayTrainingId ?? "(geen)"}`
        );
        break;
      }

      case "call.speak.ended": {
        if (!beperkPerGesprek.magVerder(callControlId)) break;
        const oproep = await maakOfHaalOproep(payload, callControlId);
        const instructies = await verwerkSpreekAfgerond(payload, provider, oproep.id, vormVelden);
        await provider.voerVoiceInstructiesUit(callControlId, instructies);
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
        await provider.voerVoiceInstructiesUit(callControlId, await verwerkOpnameAfgerond(payload, oproep.id));
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
