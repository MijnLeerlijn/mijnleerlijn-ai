import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { telnyxProvider } from "@/lib/trainers/telefonie/telnyx-provider";
import {
  verwerkInkomendeCall,
  verwerkTrainingKeuze,
  verwerkOpnameToets,
  verwerkSpreekAfgerond,
  verwerkOpnameStatus,
  verwerkVervolgKeuze,
  verwerkOnverwachteHangup,
} from "@/lib/trainers/telefonie/gesprek";
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
//                       verwacht/afgeleverd.
//                       LIVE REGRESSIE-VERVOLGRONDE (2026-08-27/28, spec
//                       "dispatch op call.gather.ended is live nog steeds
//                       niet voldoende") — ook ná de fix hierboven bleef
//                       '*'/'#' tijdens een actieve opname live zonder
//                       hoorbaar effect. call.gather.ended blijkt dus niet
//                       (voldoende) betrouwbaar tijdens de parallelle gather
//                       — call.dtmf.received (hieronder) is daarom de nieuwe
//                       PRIMAIRE trigger voor verwerkOpnameToets;
//                       call.gather.ended hierboven blijft als FALLBACK
//                       functioneren (bv. als call.dtmf.received onverhoopt
//                       ooit uitblijft). Omdat Telnyx voor DEZELFDE fysieke
//                       toetsdruk soms BEIDE events aflevert, claimt
//                       verwerkOpnameToets zelf atomisch (oproep-state.ts se
//                       claimOpnameToetsVerwerking, PostgreSQL — spec-eis
//                       "geen dedupe uitsluitend in memory, dit draait
//                       serverless") vóór het uitvoeren van de bijbehorende
//                       actie, dus geen aparte dedup-laag hier in de
//                       dispatcher nodig.
//  call.dtmf.received -> zie call.gather.ended hierboven — PRIMAIRE trigger
//                       voor verwerkOpnameToets zolang oproep.status ===
//                       "opname_verwacht"; daarbuiten bewust genegeerd (geen
//                       trainingkeuze via dit event, dat blijft uitsluitend
//                       via call.gather.ended lopen).
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
//  call.recording.saved/.error -> verwerkOpnameStatus — vervanger van
//                       opname-status, inclusief de bestaande idempotentie-
//                       claim/transcriptieherstel/audiobewaartermijn uit gate
//                       1. Root-cause-fix productie-incident (2026-08-27) —
//                       geeft sinds deze ronde ZELF de juiste
//                       vervolginstructies terug i.p.v. dat de route hierna
//                       altijd blind verwerkOpnameAfgerond aanriep: een
//                       BEWUST ('#') of MAX_DUUR-afsluiting eindigt nog
//                       steeds met bedanken+ophangen (verwerkOpnameAfgerond,
//                       claim-gated via oproep-state.ts se
//                       claimAfsluitboodschap — spreekt dus nooit twee keer,
//                       ook niet als de '#'-afhandeling in call.gather.ended/
//                       call.dtmf.received die claim al eerder won); een
//                       AUTOMATISCHE (stilte-)afsluiting hangt sinds deze
//                       ronde NIET meer op (spec-eis §6) — de trainer krijgt
//                       in plaats daarvan de vervolgkeuze-prompt (oproep
//                       gaat naar status 'opname_onderbroken').
//  call.gather.ended/
//  call.dtmf.received
//  bij status
//  'opname_onderbroken' -> verwerkVervolgKeuze (root-cause-fix
//                       productie-incident 2026-08-27, spec-eis §6) — de
//                       '*'/'#'-keuze op de vervolgkeuze-prompt: '*' start
//                       een nieuw opnamefragment (poging+1, terug naar
//                       status 'opname_verwacht'); '#' (of een timeout op
//                       deze gather) rondt af met wat er tot nu toe aan
//                       fragmenten is samengevoegd.
//  call.hangup        -> verwerkOnverwachteHangup (root-cause-fix
//                       productie-incident 2026-08-27, spec-eis §8) — slaat
//                       ALTIJD hangup_cause/hangup_source op (beheer-
//                       diagnostiek), en rondt best-effort af met wat er tot
//                       nu toe verzameld is als de oproep nog niet was
//                       afgerond en er op dit moment geen fragment actief
//                       wordt verwerkt (claimFinalisatieZonderActiefFragment,
//                       oproep-state.ts — een wél actief fragment laat zijn
//                       eigen traject gewoon uitlopen). Geen voice-instructies
//                       (de verbinding is dan al weg).
//  alles anders      -> stil genegeerd (bv. call.speak.started, call.answered
//                       voor een niet-inkomend/onverwacht been) — Telnyx
//                       stuurt veel meer event_types dan deze flow gebruikt,
//                       spec §19 se "nooit een onnodige fout": een event dat
//                       niet in de switch voorkomt is geen fout.
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
        const isOpnameToets = oproep.status === "opname_verwacht";
        // Root-cause-fix productie-incident (2026-08-27, spec-eis §6) — de
        // vervolgkeuze-prompt ná een automatische stilte-stop gebruikt
        // gather_using_speak (zelfde mechaniek als trainingkeuze hieronder,
        // NIET de parallelle stille opname_toets-gather) — call.gather.ended
        // is daarvoor, net als bij trainingkeuze, al de betrouwbare trigger
        // (geen call.dtmf.received-primaire-trigger-nuance nodig, die geldt
        // uitsluitend voor de stille gather naast een actieve opname).
        const isVervolgKeuze = oproep.status === "opname_onderbroken";
        const instructies = isOpnameToets
          ? await verwerkOpnameToets(payload, provider, oproep.id, vormVelden)
          : isVervolgKeuze
            ? await verwerkVervolgKeuze(payload, provider, oproep.id, vormVelden)
            : await verwerkTrainingKeuze(payload, provider, oproep.id, vormVelden);
        // TIJDELIJKE DIAGNOSTIEK (live regressie-vervolgronde 2026-08-27/28,
        // spec "*/# doen niets tijdens de opname") — uitsluitend
        // niet-herleidbare technische velden (geen audio/transcriptie/
        // telefoonnummer/API-key/persoonsgegevens). call.gather.ended is nu
        // de FALLBACK-trigger voor verwerkOpnameToets (call.dtmf.received
        // hieronder is primair) — "genegeerd_of_duplicate" bij een lege
        // instructielijst dekt zowel "geen geldig cijfer" als "duplicaat van
        // een al via call.dtmf.received verwerkte toetsdruk" (zie
        // claimOpnameToetsVerwerking, oproep-state.ts). Verwijderen zodra
        // dit dubbeltriggerpad hard bevestigd stabiel is op live verkeer.
        const gatherHandlerNaam = isOpnameToets ? "verwerkOpnameToets" : isVervolgKeuze ? "verwerkVervolgKeuze" : "verwerkTrainingKeuze";
        console.log(
          `[telefonie/diag] event_type=call.gather.ended digits=${vormVelden.digits ?? "(geen)"} oproepStatus=${oproep.status} oproepId=${oproep.id} handler=${gatherHandlerNaam} uitkomst=${isOpnameToets ? (instructies.length > 0 ? "verwerkt" : "genegeerd_of_duplicate") : "verwerkt"}`
        );
        await provider.voerVoiceInstructiesUit(callControlId, instructies);
        break;
      }

      case "call.dtmf.received": {
        // Live regressie-vervolgronde (2026-08-27/28, spec "dispatch op
        // call.gather.ended is live nog steeds niet voldoende") —
        // call.dtmf.received is nu de PRIMAIRE trigger voor verwerkOpnameToets
        // tijdens een actieve opname (zie de toelichting bovenaan dit
        // bestand). Buiten "opname_verwacht" blijft dit event bewust
        // ongebruikt voor trainingkeuze — die blijft uitsluitend via
        // call.gather.ended lopen (ongewijzigd). Dedup tegen een later
        // call.gather.ended-event voor dezelfde toetsdruk loopt via
        // verwerkOpnameToets se eigen atomaire claim (claimOpnameToetsVerwerking),
        // niet hier in de dispatchlaag.
        if (!beperkPerGesprek.magVerder(callControlId)) break;
        const oproep = await maakOfHaalOproep(payload, callControlId);
        const magVerwerken = oproep.status === "opname_verwacht";
        const instructies = magVerwerken ? await verwerkOpnameToets(payload, provider, oproep.id, vormVelden) : [];
        // TIJDELIJKE DIAGNOSTIEK (zie call.gather.ended hierboven voor de
        // volledige toelichting/verwijdercriterium) — "genegeerd (buiten
        // opname_verwacht)" dekt zowel trainingkeuze-gathers als elk ander
        // moment waarop DTMF hier structureel niet relevant is.
        console.log(
          `[telefonie/diag] event_type=call.dtmf.received digit=${vormVelden.digit ?? "(geen)"} oproepStatus=${oproep.status} oproepId=${oproep.id} handler=${magVerwerken ? "verwerkOpnameToets" : "(geen)"} uitkomst=${!magVerwerken ? "genegeerd (buiten opname_verwacht)" : instructies.length > 0 ? "verwerkt" : "genegeerd_of_duplicate"}`
        );
        if (magVerwerken) await provider.voerVoiceInstructiesUit(callControlId, instructies);
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
        // Root-cause-fix productie-incident (2026-08-27) — verwerkOpnameStatus
        // geeft sinds deze ronde zelf de juiste vervolginstructies terug
        // (bewust/max_duur -> bedanken+ophangen zoals voorheen; automatisch
        // -> de vervolgkeuze-prompt, GEEN ophangen meer, spec-eis §6) — geen
        // aparte, altijd-uitgevoerde verwerkOpnameAfgerond-aanroep hier meer
        // nodig/gewenst (die zou bij een automatische stop alsnog ten
        // onrechte ophangen).
        const instructies = await verwerkOpnameStatus(payload, provider, oproep.id, vormVelden);
        await provider.voerVoiceInstructiesUit(callControlId, instructies);
        break;
      }

      case "call.hangup": {
        // Root-cause-fix productie-incident (2026-08-27, spec-eis §8) — geen
        // rate limit hier: dit event komt per gesprek hooguit één keer voor
        // (het gesprek is hierna per definitie voorbij), en moet altijd
        // verwerkt worden (hangup_cause/hangup_source opslaan + best-effort
        // afronden met wat er al is) ongeacht hoeveel andere events dit
        // gesprek al opgebruikt heeft van beperkPerGesprek se budget.
        const oproep = await maakOfHaalOproep(payload, callControlId);
        await verwerkOnverwachteHangup(payload, provider, oproep.id, vormVelden);
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
