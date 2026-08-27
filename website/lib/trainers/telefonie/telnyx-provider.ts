import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { requireEnv } from "@/config/env";
import type { TelefonieProvider, InkomendeCallGegevens, GatherResultaat, OpnameStatusGegevens, SpreekAfgerondGegevens, HangupGegevens, VoiceInstructie, VoiceWebhookRespons } from "./provider";

// Traineromgeving V1, Ronde 3.5 vervolg (2026-08-25) — providermigratie
// Twilio -> Telnyx. Dit is de ENIGE plek waar Telnyx-specifieke concepten
// (call_control_id, event_type, telnyx-signature-ed25519, Call Control v2
// REST-commando's) mogen voorkomen (spec §16, zelfde grens als
// twilio-provider.ts eerder). gesprek.ts en de webhookroute praten
// uitsluitend tegen de generieke TelefonieProvider-interface (./provider.ts).
//
// Onderzoeksbasis (bijgewerkt 2026-08-25, vervolgronde) — WebFetch bleef
// geblokkeerd voor developers.telnyx.com, MAAR: de officiële `telnyx`
// npm-package (v7.16.0, gepubliceerd door Telnyx zelf, auto-gegenereerd uit
// hun eigen OpenAPI-spec) is via de npm-registry wél bereikbaar in deze
// sandbox. De volgende feiten zijn dus NIET langer WebSearch-samenvattingen
// maar rechtstreeks afgelezen uit Telnyx' eigen gepubliceerde TypeScript-
// broncode (src/resources/calls/actions.ts, src/resources/webhooks.ts,
// src/resources/recordings/recordings.ts, src/lib/webhooks.ts, src/client.ts):
//  - Basis-URL https://api.telnyx.com/v2, Authorization: Bearer <API-key>.
//  - Commando-paden: POST /calls/{call_control_id}/actions/{answer|speak|
//    gather_using_speak|record_start|record_stop|hangup}.
//  - Webhook-headers telnyx-signature-ed25519 (base64, 64 bytes) +
//    telnyx-timestamp (unix-seconden, 5 min. replaytolerantie) over het
//    LETTERLIJKE bericht `{timestamp}|{rauwe body}`, Ed25519, publieke
//    sleutel base64 (32 bytes) — Telnyx' eigen webhookverificatiecode is
//    functioneel IDENTIEK aan wat hieronder staat.
//  - Event_types die deze dispatcher gebruikt (exacte strings uit Telnyx'
//    eigen discriminated union, resources/webhooks.ts): call.initiated,
//    call.answered, call.gather.ended, call.dtmf.received,
//    call.recording.saved, call.recording.error, call.hangup.
//  - BELANGRIJKE CORRECTIE t.o.v. de vorige ronde: het `call.recording.saved`-
//    webhookpayload bevat GEEN call_control_id én GEEN recording_id (wel
//    aanwezig op call.recording.error, inconsistent tussen de twee) —
//    uitsluitend call_leg_id + kortlevende (10 min.) recording_urls. Voor een
//    eenvoudig, nooit-doorverbonden/nooit-geconfereerd gesprek (exact onze
//    flow) is call_leg_id altijd gelijk aan call_control_id (zie Telnyx' eigen
//    call.initiated-voorbeeldpayload, waar beide identiek zijn) — vandaar de
//    call_leg_id-fallback in vlakTelnyxEventAf (webhook-helpers.ts) en het
//    gebruik van call_leg_id als opzoeksleutel in haalOpnameOp/verwijderOpname
//    hieronder (via GET /recordings?filter[call_leg_id]=..., de door Telnyx'
//    eigen qs-serialisatie bevestigde bracket-notatie).
//  - De REST-respons van GET/DELETE /recordings/{id} gebruikt het veld
//    `download_urls.mp3`, NIET `recording_urls.mp3` (dat laatste bestaat
//    alleen op het `call.recording.saved`-webhookpayload zelf, een ANDERE
//    resource-representatie) — een eerdere versie van dit bestand las het
//    verkeerde veld en zou daardoor élke transcriptiepoging hebben laten
//    mislukken.
//  - gather_using_speak se digitaantal-parameters heten minimum_digits/
//    maximum_digits (niet min_digits/max_digits).
//  - service_level moet expliciet "premium" zijn: bij "basic" staat Telnyx
//    uitsluitend en-US toe, wat nl-NL zou blokkeren/negeren.
//  - EU-opslag: Telnyx' "Data Locality"-instelling (Console: Account
//    Settings > Profile > Data Storage Location, EENMALIG, onomkeerbaar)
//    dekt expliciet "Media Storage (recordings)" naast CDR's/MDR's, met
//    "Germany (EU)" als optie — bij die keuze draait alle Voice API-
//    verwerking + opnameopslag via Telnyx' Frankfurt-datacenter. Dit komt
//    uit WebSearch (niet uit de SDK-broncode, die gaat niet over
//    accountinstellingen) — zie het opleverrapport se beperkingen-sectie.
//
// Bewust GEEN telnyx-npm-package als RUNTIME-afhankelijkheid: de package is
// uitsluitend gebruikt als eenmalige, offline referentiebron tijdens het
// bouwen van dit bestand (npm install in een scratchmap, broncode gelezen,
// weer weggegooid) — de daadwerkelijke runtime-oppervlakte (Ed25519-
// verificatie, een paar REST-aanroepen) blijft met Node's ingebouwde crypto +
// fetch() na te bouwen, met volledige controle over precies welke bytes
// ondertekend/verstuurd worden, zonder een extra productieafhankelijkheid.
//
// Resterende, NIET uit de SDK-broncode af te leiden onzekerheid (SDK-code
// gaat over de API, niet over Console-schermen of accountconfiguratie) —
// zie het opleverrapport se beperkingen-sectie voor de volledige toelichting:
//  - Of "Germany" bij Data Locality specifiek en volledig Voice-opnameopslag
//    dekt (WebSearch-bevestigd, niet SDK-bevestigd).
//  - Of de gekozen stem-ID (TELNYX_TTS_VOICE) nog exact bestaat in Telnyx'
//    doorgezette AWS Polly-catalogus op het moment van de eerste testoproep.
//  - Of call_leg_id in de praktijk altijd exact gelijk is aan call_control_id
//    voor déze specifieke flow (zeer aannemelijk gegeven Telnyx' eigen
//    voorbeeldpayload + dat dit gesprek nooit bridget/doorverbindt, maar niet
//    zelf tegen een live gesprek getest).
// Voor elk van deze drie is hieronder gerichte diagnostiek toegevoegd (zie de
// foutmeldingen in haalMeestRecenteOpname/voerInstructieUit) zodat de eerste
// testoproep, mocht een aanname toch niet kloppen, een exact aanwijsbare
// Vercel-logregel oplevert in plaats van een ondoorzichtige 500.

const TELNYX_API_BASIS = "https://api.telnyx.com/v2";
const REPLAY_TOLERANTIE_SECONDEN = 300; // 5 minuten — bevestigd identiek aan Telnyx' eigen SDK (src/lib/webhooks.ts)

// AWS Polly's standaard (NIET neurale) Nederlandse stem — bewust zonder
// "-Neural"-suffix: Telnyx' eigen documentatie zegt expliciet dat niet elke
// Polly-stem een neurale variant heeft ("Check the available voices for
// compatibility") en dat kon ik niet verifiëren; de standaardstem "Lotte"
// bestaat bij AWS Polly al sinds de introductie van Nederlands en is daarmee
// het laagste-risico gekozen ID. service_level MOET "premium" zijn (spec
// hieronder) — bij "basic" staat Telnyx alleen en-US toe. Verifieer dit bij
// de eerste testoproep: geen gesproken audio + een 4xx op speak/
// gather_using_speak in de Vercel-logs (zie voerInstructieUit) wijst hier
// naartoe; pas dan uitsluitend deze constante aan (Telnyx Console -> Voice ->
// Programmable Voice heeft geen eigen "stem"-instelling, dit is puur een
// per-commando parameter).
const TELNYX_TTS_VOICE = "AWS.Polly.Lotte";
const TELNYX_TTS_TAAL = "nl-NL";
const TELNYX_TTS_SERVICE_LEVEL = "premium";

// Algemene SIP/telefonieplatformkennis (zelfde aanpak als twilio-provider.ts
// eerder se VERBORGEN_NUMMER_WAARDEN) — Telnyx' call.initiated-payload heeft
// geen los "is verborgen"-boolean-veld (bevestigd via de SDK-broncode, dus
// dit ontbreken zelf is hard vastgesteld), uitsluitend een kaal `from`-veld.
// Sentinel-waarden hieronder blijven daarom de best beschikbare aanpak, niet
// zelf tegen een live gesprek met verborgen nummer getest.
const VERBORGEN_NUMMER_WAARDEN = new Set(["anonymous", "restricted", "unavailable", "private", ""]);

function apiKey(): string {
  return requireEnv("TELNYX_API_KEY");
}

/**
 * Ed25519 rauwe publieke sleutel (32 bytes, base64 in TELNYX_PUBLIC_KEY) ->
 * een geldig SPKI-DER-object voor Node's crypto.verify(). De 12-byte prefix
 * hieronder is de vaste, algemene ASN.1/SPKI-header voor Ed25519 (RFC 8410,
 * OID 1.3.101.112) — geen Telnyx-specifieke waarde, een universele constante.
 */
function telnyxPublicKeyObject() {
  const ruwePublicKey = Buffer.from(requireEnv("TELNYX_PUBLIC_KEY"), "base64");
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({ key: Buffer.concat([spkiPrefix, ruwePublicKey]), format: "der", type: "spki" });
}

function berekenDuurSeconden(start: string | undefined, eind: string | undefined): number | null {
  if (!start || !eind) return null;
  const ms = new Date(eind).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 1000) : null;
}

async function telnyxCommando(callControlId: string, actie: string, body: Record<string, unknown>, commandIdSuffix?: string): Promise<void> {
  const response = await fetch(`${TELNYX_API_BASIS}/calls/${encodeURIComponent(callControlId)}/actions/${actie}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    // command_id (2026-08-25, na een live testoproep) — Telnyx' eigen
    // commando-deduplicatie: "Telnyx will ignore any command with the same
    // command_id for the same call_control_id" (letterlijk bevestigd via
    // Telnyx' SDK-broncode, op ELK actie-Params-type). Deterministisch per
    // actiesoort+gesprek — BEWUST NIET per aanroep uniek (bv. geen
    // tijdstip/random deel), juist om een herhaalde aanroep vanuit ONS
    // (bv. Telnyx' eigen webhook-redelivery bij een trage respons —
    // verwerkTrainingKeuze doet zelf een synchrone Monday-leesaanroep vlak
    // vóór het commando dat hieruit volgt) te laten samenvallen met de
    // oorspronkelijke, en dus door Telnyx zelf te laten negeren i.p.v. een
    // tweede, echte actie uit te voeren. Veilig voor dit gesloten
    // gespreksscript (gesprek.ts): elke actiesoort komt hooguit één keer
    // legitiem voor per gesprek (zie de toelichting bij haalOpnames/
    // kiesOpname hieronder). Dit voorkomt de klasse fout die live is
    // waargenomen: twee losse opnameresources bij Telnyx voor hetzelfde
    // gesprek (bevestigd via Telnyx Reporting → Call Recordings).
    //
    // commandIdSuffix (2026-08-26, trainertelefonie V1-afronding, spec §10):
    // record_start/record_stop/gather komen nu LEGITIEM meerdere keren voor
    // per gesprek (elke '*'-herstart) — zonder een per-poging-suffix zou
    // Telnyx de TWEEDE/DERDE poging ten onrechte als duplicaat van de eerste
    // negeren. gesprek.ts/telnyx-provider.ts geven hier daarom de
    // heropnamePogingen-waarde aan mee, zodat elke legitieme nieuwe poging
    // een eigen command_id krijgt terwijl een échte herhaalde
    // webhookaflevering van DEZELFDE poging nog altijd hetzelfde command_id
    // oplevert (dus nog altijd correct gededupliceerd wordt).
    body: JSON.stringify({ ...body, command_id: `${actie}:${callControlId}${commandIdSuffix ? `:${commandIdSuffix}` : ""}` }),
  });
  if (!response.ok) {
    // Statuscode + actienaam in de foutmelding (geen bodytekst — kan
    // providerresponstekst met adres-/telefoonnummerinhoud bevatten, spec
    // §9) — bedoeld om bv. een 422 op een ongeldige voice-ID (zie
    // TELNYX_TTS_VOICE hierboven) direct herkenbaar te maken in de logs.
    throw new Error(`Telnyx-commando "${actie}" mislukt: HTTP ${response.status}`);
  }
}

/**
 * Productieblocker-ronde (2026-08-26) — codeert "welke vervolgstap moet er
 * volgen zodra dit speak-commando volledig is afgespeeld" in client_state
 * (Telnyx vereist een geldige base64-string). Uitsluitend een label +
 * poging-nummer (+ optioneel een uniek nonce-getal voor de
 * limietwaarschuwing, zie provider.ts se zeg_en_hervat_opname-doc-comment)
 * — geen persoonsgegeven, veilig om zo mee te sturen (spec §9). Gedecodeerd
 * door gesprek.ts se verwerkSpreekAfgerond(), na het call.speak.ended-event.
 */
function coderenClientState(actie: string, poging: number | string, nonce?: number): string {
  const ruw = nonce !== undefined ? `${actie}:${poging}:${nonce}` : `${actie}:${poging}`;
  return Buffer.from(ruw, "utf8").toString("base64");
}

/** Vertaalt één providerneutrale VoiceInstructie naar de bijbehorende Telnyx Call Control-commando('s). */
async function voerInstructieUit(callControlId: string, instructie: VoiceInstructie): Promise<void> {
  switch (instructie.soort) {
    case "zeg_en_ophangen": {
      // ROOT CAUSE VAN DE PRODUCTIEREGRESSIE (2026-08-27, live bevestigd):
      // deze tak deed hier voorheen een fire-and-forget speak GEVOLGD DOOR
      // een onmiddellijke hangup — Telnyx voert speak/hangup als volledig
      // onafhankelijke commando's uit (geen impliciete wachtrij), dus de
      // hangup sneed de tekst af voordat er iets hoorbaar was. Live-symptomen
      // die dit exact verklaren: call.speak.ended met status="call_hangup"
      // (de tekst werd afgebroken, niet volledig afgespeeld) en
      // client_state=null (dit commando zette nooit een client_state — in
      // tegenstelling tot zeg_en_neem_op/zeg_en_hervat_opname, die de vorige
      // ronde al wél omgezet waren naar de deferred-aanpak hieronder).
      //
      // Fix: zelfde deterministische garantie als de opnamekant. Uitsluitend
      // spreken, met client_state="hangup_na_spraak:<reden>" (geen nonce —
      // zie provider.ts se hangup_uitvoeren-doc-comment: elke
      // zeg_en_ophangen-aanroep is terminaal, dus een deterministisch
      // command_id volstaat en beschermt bovendien tegen een dubbel
      // afgeleverd call.speak.ended-event). De daadwerkelijke hangup volgt
      // pas op dat event (zie ontleedSpreekAfgerond hieronder + gesprek.ts se
      // verwerkSpreekAfgerond, hangup_na_spraak-tak).
      await telnyxCommando(
        callControlId,
        "speak",
        {
          payload: instructie.tekst,
          payload_type: "text",
          voice: TELNYX_TTS_VOICE,
          language: TELNYX_TTS_TAAL,
          service_level: TELNYX_TTS_SERVICE_LEVEL,
          client_state: coderenClientState("hangup_na_spraak", instructie.reden),
        },
        `speak-hangup-${instructie.reden}`
      );
      return;
    }
    case "zeg_en_kies_cijfers":
      // gather_using_speak = Telnyx' gecombineerde spreek+verzamel-commando,
      // dezelfde ene-stap-mechanica als Twilio's <Gather><Say>. actieUrl
      // wordt hier BEWUST niet gebruikt — Telnyx kent geen per-commando
      // vervolg-URL, alle webhooks (inclusief het resulterende
      // call.gather.ended) lopen naar de ene centrale dispatcher-route.
      await telnyxCommando(callControlId, "gather_using_speak", {
        payload: instructie.tekst,
        payload_type: "text",
        voice: TELNYX_TTS_VOICE,
        language: TELNYX_TTS_TAAL,
        service_level: TELNYX_TTS_SERVICE_LEVEL,
        valid_digits: instructie.geldigeCijfers ?? "0123456789",
        minimum_digits: instructie.maxCijfers,
        maximum_digits: instructie.maxCijfers,
        inter_digit_timeout_millis: instructie.timeoutSeconden * 1000,
      });
      return;
    case "zeg_en_neem_op": {
      // Productieblocker-ronde (2026-08-26) — spreekt UITSLUITEND de tekst
      // uit. Een eerdere versie stuurde hier fire-and-forget ook meteen
      // record_start + gather mee — dat gaf GEEN garantie dat de tekst al
      // klaar was met afspelen (Telnyx' eigen SDK-broncode bevestigt dat
      // speak/record_start onafhankelijke commando's zijn, geen impliciete
      // wachtrij tussen commandosoorten). De daadwerkelijke opnamestart
      // volgt nu pas op het call.speak.ended-event (zie
      // ontleedSpreekAfgerond hieronder + gesprek.ts se
      // verwerkSpreekAfgerond) — DE deterministische garantie: Telnyx
      // documenteert "Expected Webhooks: call.speak.started, call.speak.ended"
      // exact voor het speak-commando.
      //
      // client_state (spec §10/§12/§18, "actie:poging") laat het latere
      // call.speak.ended-event weten dat hierna record_start voor DEZE
      // poging moet volgen — puur een poging-nummer plus een vast label,
      // geen persoonsgegeven, veilig om zo mee te sturen (spec §9).
      await telnyxCommando(
        callControlId,
        "speak",
        {
          payload: instructie.tekst,
          payload_type: "text",
          voice: TELNYX_TTS_VOICE,
          language: TELNYX_TTS_TAAL,
          service_level: TELNYX_TTS_SERVICE_LEVEL,
          client_state: coderenClientState("start_opname", instructie.poging),
        },
        `speak-start-poging${instructie.poging}`
      );
      return;
    }
    case "opname_starten": {
      // Bewust GEEN `transcription`-parameter (default false, spec §11:
      // eigen Whisper-infrastructuur, nooit Telnyx' eigen transcriptiedienst
      // — die kost bovendien apart, óók impliciet via timeout_secs se eigen
      // stilte-detectie, zie Telnyx' documentatie daarvan).
      //
      // client_state (spec §10/§12/§18) — draagt instructie.poging mee op
      // ELK vervolgwebhook van DEZE opnamepoging (call.recording.saved/
      // .error), zodat gesprek.ts een inmiddels via '*' afgewezen eerdere
      // poging herkent en NOOIT alsnog verwerkt, ook niet bij een trage/
      // vertraagd afgeleverde webhook. Poging-nummer, geen persoonsgegeven —
      // veilig om zo mee te sturen (spec §9).
      await telnyxCommando(
        callControlId,
        "record_start",
        {
          format: "mp3",
          channels: "single",
          max_length: instructie.maxDuurSeconden,
          timeout_secs: instructie.stilteTimeoutSeconden,
          play_beep: true,
          client_state: Buffer.from(String(instructie.poging), "utf8").toString("base64"),
        },
        `poging${instructie.poging}`
      );
      // Parallelle, stille DTMF-gather (spec §9/§10) — hard bevestigd tegen
      // Telnyx' eigen SDK-broncode (zie het opleverrapport): record_start
      // kent zelf geen stop-op-toets-parameter, en call.dtmf.received hoort
      // uitsluitend bij gather-commando's, NOOIT bij record_start. Dit is
      // dus niet langer een vangnet maar de daadwerkelijke, geverifieerde
      // mechaniek achter zowel '#' (stoppen+verwerken) als '*' (herstarten).
      // ActionGatherParams kent geen audio/tekst-veld (i.t.t.
      // gather_using_speak hierboven) — loopt dus volledig onhoorbaar naast
      // de opname. gather_id="opname_toets" laat de webhookroute dit event
      // onderscheiden van de trainingkeuze-gather (zie route se dispatch) —
      // BLIJFT staan als documentatie/intentie, ook al bleek gather_id zelf
      // nooit op enig webhookevent terug te komen (zie route.ts se
      // toelichting); dispatch loopt inmiddels op oproep.status.
      //
      // client_state (live regressie-vervolgronde 2026-08-27/28) — NIEUW:
      // draagt de poging mee op ELK vervolgevent van DEZE specifieke
      // gather-opdracht (call.dtmf.received/call.gather.ended), zodat
      // gesprek.ts se claimOpnameToetsVerwerking een tweede, latere
      // aflevering van DEZELFDE fysieke toetsdruk herkent — ONAFHANKELIJK
      // van de (mutabele) heropname_pogingen-stand op dat latere moment, zie
      // provider.ts se GatherResultaat.clientState-doc-comment voor de
      // volledige redenering. Bare poging-encoding (geen coderenClientState-
      // actie-prefix nodig) — zelfde stijl als record_start se eigen
      // client_state hierboven.
      await telnyxCommando(
        callControlId,
        "gather",
        {
          gather_id: "opname_toets",
          valid_digits: `${instructie.stopToets}${instructie.herstartToets}`,
          minimum_digits: 1,
          maximum_digits: 1,
          timeout_millis: (instructie.maxDuurSeconden + 30) * 1000,
          initial_timeout_millis: (instructie.maxDuurSeconden + 30) * 1000,
          client_state: coderenClientState("opname_toets", instructie.poging),
        },
        `poging${instructie.poging}`
      );
      return;
    }
    case "stop_opname":
      await telnyxCommando(callControlId, "record_stop", {}, `poging${instructie.poging}`);
      return;
    case "zeg_en_hervat_opname": {
      // Productieblocker-ronde (2026-08-26, spec §11 "een 4e '*' mag # nooit
      // breken") — de HUIDIGE opname blijft geldig: eerst pauzeren (zodat de
      // waarschuwing zelf nooit in de opname/het verslag terechtkomt, spec
      // §9 dataminimalisatie — record_pause/record_resume zijn Telnyx'
      // eigen, officieel gedocumenteerde commando's hiervoor, geen
      // work-around), dan de tekst spreken. Hervatten (+ de gather
      // her-bewapenen) volgt pas op call.speak.ended, net als bij
      // zeg_en_neem_op hierboven — zelfde deterministische garantie.
      // record_pause kent zelf geen Expected Webhooks (Telnyx' eigen
      // documentatie: "There are no webhooks associated with this
      // command"), dus normale sequentiële afhandeling hier volstaat — er
      // ís geen ander officieel wachtmechanisme voor.
      await telnyxCommando(callControlId, "record_pause", {}, `pauze-poging${instructie.poging}-${instructie.nonce}`);
      await telnyxCommando(
        callControlId,
        "speak",
        {
          payload: instructie.tekst,
          payload_type: "text",
          voice: TELNYX_TTS_VOICE,
          language: TELNYX_TTS_TAAL,
          service_level: TELNYX_TTS_SERVICE_LEVEL,
          client_state: coderenClientState("hervat_opname", instructie.poging, instructie.nonce),
        },
        `speak-hervat-poging${instructie.poging}-${instructie.nonce}`
      );
      return;
    }
    case "opname_hervatten": {
      await telnyxCommando(callControlId, "record_resume", {}, `hervat-poging${instructie.poging}-${instructie.nonce}`);
      // Zelfde parallelle, stille gather als opname_starten hierboven — de
      // vorige (die de '*'-druk op de limiet zelf ving) is inmiddels
      // verbruikt (maximum_digits:1), dus zonder deze her-bewapening zou
      // een daaropvolgende '#' niet meer opgevangen worden.
      //
      // client_state draagt hier BEWUST ook de nonce mee (i.t.t. de
      // opname_starten-tak hierboven, waar de kale poging al uniek genoeg
      // is): meerdere ACHTEREENVOLGENDE keren op de limiet delen dezelfde
      // poging (er start immers geen nieuwe opname), dus zonder de nonce zou
      // een tweede, echte '*'-druk op de limiet dezelfde client_state
      // hebben als de EERSTE en zichzelf bij claimOpnameToetsVerwerking ten
      // onrechte als duplicaat van die eerdere druk zien.
      await telnyxCommando(
        callControlId,
        "gather",
        {
          gather_id: "opname_toets",
          valid_digits: `${instructie.stopToets}${instructie.herstartToets}`,
          minimum_digits: 1,
          maximum_digits: 1,
          timeout_millis: (instructie.maxDuurSeconden + 30) * 1000,
          initial_timeout_millis: (instructie.maxDuurSeconden + 30) * 1000,
          client_state: coderenClientState("opname_toets", instructie.poging, instructie.nonce),
        },
        `hervat-poging${instructie.poging}-${instructie.nonce}`
      );
      return;
    }
    case "hangup_uitvoeren":
      await telnyxCommando(callControlId, "hangup", {}, `hangup-${instructie.reden}`);
      return;
  }
}

// Foutdiagnostiek voor /v2/recordings (2026-08-25, na een live HTTP 422 op
// de eerste testoproep — oproep-ID 5, foutmelding "Opnamelijst ophalen bij
// Telnyx mislukt: HTTP 422" was te weinig om de daadwerkelijke oorzaak te
// diagnosticeren). Onderzoek tegen de officiële SDK-broncode (telnyx@7.16.0,
// zelfde offline-referentiemethode als eerder — WebFetch blijft geblokkeerd
// voor developers.telnyx.com):
//  - filter[call_leg_id] IS een echt, door Telnyx gedocumenteerd
//    queryparameter van GET /v2/recordings — bevestigd via
//    RecordingListParams.Filter in src/resources/recordings/recordings.ts
//    ("If present, recordings will be filtered to those with a matching
//    call_leg_id."). Het volledige ondersteunde filteroppervlak van dit
//    endpoint (zelfde bron): call_control_id, call_leg_id, call_session_id,
//    conference_id, conference_region, connection_id, created_at{gte,lte},
//    end_time{gte,lte}, from, sip_call_id, start_time{gte,lte}, to.
//  - call.recording.saved se webhookpayload (CallRecordingSaved.Payload,
//    src/resources/webhooks.ts) bevat: call_leg_id, call_session_id,
//    channels, client_state, connection_id, recording_started_at,
//    recording_ended_at, recording_urls, public_recording_urls — GEEN
//    call_control_id (bevestigt de eerdere bevinding opnieuw, deze keer in
//    een verse install). Van deze velden zijn zowel call_leg_id ALS
//    call_session_id (en connection_id) geldige filters op /v2/recordings —
//    er is dus geen "betere" identifier nodig/beschikbaar; de huidige keuze
//    (call_leg_id) is een van twee geldige opties, niet de enige of een
//    onjuiste.
//  - Onze query-serialisatie (URLSearchParams({"filter[call_leg_id]":...}))
//    is BYTE-VOOR-BYTE identiek bevestigd aan Telnyx' eigen
//    stringifyQuery({filter:{call_leg_id}}) (src/internal/utils/query.ts,
//    qs.stringify met arrayFormat:'comma') — geen serialisatiefout.
//  - Basis-URL (https://api.telnyx.com/v2) en enige benodigde header
//    (Authorization: Bearer <key>) kloppen — bevestigd via src/client.ts se
//    eigen defaultBaseURL/authHeaders.
// Conclusie: veld, waarde-opbouw, serialisatie en basisconfiguratie zijn
// stuk voor stuk tegen de officiële broncode geverifieerd en kloppen. De
// exacte trigger van DEZE 422 is daarmee NIET af te leiden uit statische
// SDK-broncode alleen (die beschrijft de API-vorm, niet elke
// runtime-validatieregel van Telnyx' backend) — vandaar onderstaande
// telnyxFoutdetail(), die Telnyx' eigen gedocumenteerde JSON:API-foutvorm
// (Shared.APIError in shared.ts: {code, title, description?, meta?,
// source?: {parameter?, pointer?}}, in de praktijk verpakt als
// {errors:[...]}）veilig en begrensd uitleest, zodat een volgende 4xx
// zichzelf direct diagnosticeert i.p.v. alleen "HTTP 422" te tonen.
//
// Vervolg (2026-08-25, live oproep-ID 6, ná deze fix): de foutmelding werd
// "HTTP 422 — is invalid" — de parser werkte dus deels, maar gaf een kale,
// ongelabelde tekstflard terug. Root cause: de vorige versie voegde
// code/title(??detail??description)/source.parameter stilzwijgend samen met
// `.filter(Boolean).join(...)` — als alleen description gevuld was (hier het
// geval) verdween elk spoor van WELK veld dat was, en "detail" was boven-
// dien een zelf verzonnen veldnaam (Telnyx' eigen Shared.APIError-type kent
// uitsluitend description, geen detail — hierboven al correct
// gedocumenteerd, maar niet consistent doorgevoerd in de implementatie).
// Fix: elk van de vijf officiële velden (code, title, description,
// source.parameter, source.pointer) krijgt nu een EIGEN, altijd zichtbaar
// label en verschijnt alleen als het daadwerkelijk gevuld is — "description=
// is invalid" i.p.v. kaal "is invalid" maakt meteen duidelijk dat code/
// title/source op déze respons leeg waren, in plaats van dat te laten
// raden. De daadwerkelijke /v2/recordings-aanroep zelf blijft ONGEWIJZIGD
// (geen bewijs voor de oorzaak van de 422 zelf, dus geen wijziging daaraan,
// zoals gevraagd) — dit is uitsluitend een verbetering van de foutextractie.
//
// Bewust NIET toegepast op telnyxCommando() (POST .../actions/*, bv.
// speak/gather_using_speak): die foutmelding is elders in dit bestand al
// EXPLICIET zonder bodytekst gehouden, omdat een 422 daar (bv. op een
// ongeldige TTS-payload) de daadwerkelijk ingesproken tekst — vaak een
// trainernaam/schoolnaam, spec §9 — in Telnyx' eigen foutdetail zou kunnen
// terugkrijgen. /v2/recordings kent dat risico niet (uitsluitend
// call_leg_id/parameter-namen in de respons, nooit gespreksinhoud), dus
// alleen hier toegepast.
const TELNYX_FOUTDETAIL_MAX_LENGTE = 300;

interface TelnyxAPIFoutItem {
  code?: string;
  title?: string;
  description?: string;
  source?: { parameter?: string; pointer?: string };
}

/** Labelt elk van Telnyx' vijf gedocumenteerde foutvelden afzonderlijk — nooit stilzwijgend samenvoegen (zie toelichting hierboven, live bevestigd bij oproep-ID 6). */
function labelTelnyxFoutItem(fout: TelnyxAPIFoutItem): string {
  const labels: string[] = [];
  if (fout.code) labels.push(`code=${fout.code}`);
  if (fout.title) labels.push(`title="${fout.title}"`);
  if (fout.description) labels.push(`description="${fout.description}"`);
  if (fout.source?.parameter) labels.push(`source.parameter=${fout.source.parameter}`);
  if (fout.source?.pointer) labels.push(`source.pointer=${fout.source.pointer}`);
  return labels.length > 0 ? labels.join(" ") : "(foutitem zonder herkende velden)";
}

async function telnyxFoutdetail(response: Response): Promise<string> {
  let ruweTekst: string;
  try {
    ruweTekst = await response.text();
  } catch {
    return "(responsbody niet leesbaar)";
  }
  try {
    const body = JSON.parse(ruweTekst) as { errors?: TelnyxAPIFoutItem[] };
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      const eerste = labelTelnyxFoutItem(body.errors[0]!);
      const extra = body.errors.length > 1 ? ` (+${body.errors.length - 1} meer)` : "";
      return `${eerste}${extra}`.slice(0, TELNYX_FOUTDETAIL_MAX_LENGTE);
    }
  } catch {
    // Geen (geldige) JSON -> val hieronder terug op de rauwe (begrensde) tekst.
  }
  return ruweTekst.slice(0, TELNYX_FOUTDETAIL_MAX_LENGTE) || "(lege responsbody)";
}

interface TelnyxOpnameResource {
  id?: string;
  download_urls?: { mp3?: string | null; wav?: string | null };
  recording_started_at?: string;
  recording_ended_at?: string;
}

function opnameDuurMs(opname: TelnyxOpnameResource): number {
  if (!opname.recording_started_at || !opname.recording_ended_at) return 0;
  const ms = new Date(opname.recording_ended_at).getTime() - new Date(opname.recording_started_at).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : 0;
}

/**
 * Live HTTP 422 op de call_leg_id-gebaseerde opzoeking (2026-08-25,
 * oproep-ID 6): `source.pointer=/call_id`. Onderzoek tegen een verse
 * telnyx-npm-install (v7.16.0) plus CHANGELOG.md (bevat een eerdere,
 * relevante commit "call-recordings: align OpenAPI spec with
 * implementation", v6.10.2 — al opgenomen in onze 7.16.0):
 *  - call_id komt NERGENS voor als publiek veld in Telnyx' Call
 *    Control/Recordings-oppervlak — driedubbel gecontroleerd:
 *    RecordingListParams.Filter/RecordingResponseData (recordings.ts),
 *    CallRecordingSaved.Payload (webhooks.ts), CallRetrieveStatusResponse.Data
 *    (calls.ts). De enige plek in de hele SDK waar een veld letterlijk
 *    "call_id" heet is voice-sdk-call-reports.ts — een volledig ander
 *    product (WebRTC/Voice SDK-clientrapportage), niet Call
 *    Control/telefonie.
 *  - call_leg_id blijft dus een ECHT, gedocumenteerd queryparameter (geen
 *    naamfout in onze request) — "/call_id" is hoogstwaarschijnlijk Telnyx'
 *    eigen INTERNE naam voor het gevalideerde veld, gelekt in de
 *    foutrespons, geen aanwijzing om een ANDERE publieke veldnaam te
 *    gebruiken voor DEZELFDE waarde.
 *  - recording_provider_id/opname_ophaal_referentie zelf kloppen: dezelfde
 *    v3:...-waarde als providerCallId (call_control_id) is exact wat
 *    Telnyx' eigen call.initiated-voorbeeld documenteert voor een simpel,
 *    nooit-doorverbonden gesprek — geen fout ID opgeslagen.
 * Conclusie: dit wijst op een waarde-/backend-validatieprobleem specifiek
 * voor call_leg_id, niet op een verkeerde veldnaam of verkeerd opgeslagen
 * ID. Om toch deterministisch (nooit tijdstip-gok, nooit "haal alles op")
 * verder te kunnen: call_session_id is een ANDER, eveneens officieel
 * gedocumenteerd filterveld op ditzelfde endpoint (RecordingListParams.Filter),
 * en staat als VERPLICHT (niet optioneel) veld op
 * CallRetrieveStatusResponse.Data — op te halen via GET
 * /v2/calls/{call_control_id}, met exact het call_control_id dat we al
 * hebben (geen nieuwe opslag/migratie nodig: bestaande, ongewijzigde
 * recordingProviderId/opnameOphaalReferentie-waarde volstaat als invoer).
 * Bij een 4xx op de call_leg_id-poging wordt dit ÉÉN keer als tweede,
 * met naam genoemde, deterministische poging geprobeerd — nooit een
 * blinde/tijdgebaseerde fallback. Faalt ook deze (of is call_session_id
 * niet op te halen), dan bevat de uiteindelijke foutmelding de foutdetails
 * van BEIDE pogingen (spec §9: nooit audio/gespreksinhoud, uitsluitend
 * technische velden — telnyxFoutdetail blijft ongewijzigd).
 */
async function haalCallSessionId(callControlId: string): Promise<string | null> {
  try {
    const response = await fetch(`${TELNYX_API_BASIS}/calls/${encodeURIComponent(callControlId)}`, { headers: { Authorization: `Bearer ${apiKey()}` } });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { call_session_id?: string } };
    return body.data?.call_session_id ?? null;
  } catch {
    return null;
  }
}

type OpnamesFilterUitkomst = { ok: true; opnames: TelnyxOpnameResource[] } | { ok: false; foutmelding: string };

async function haalOpnamesMetFilter(filterVeld: "call_leg_id" | "call_session_id", waarde: string): Promise<OpnamesFilterUitkomst> {
  const query = new URLSearchParams({ [`filter[${filterVeld}]`]: waarde }).toString();
  const response = await fetch(`${TELNYX_API_BASIS}/recordings?${query}`, { headers: { Authorization: `Bearer ${apiKey()}` } });
  if (!response.ok) {
    return { ok: false, foutmelding: `HTTP ${response.status} — ${await telnyxFoutdetail(response)}` };
  }
  const body = (await response.json()) as { data?: TelnyxOpnameResource[] };
  return { ok: true, opnames: (body.data ?? []).filter((opname) => opname.id) };
}

/**
 * Haalt ALLE opnames van dit gesprek op — spec §9: ophaalReferentie/
 * providerRecordingId zijn bij Telnyx het call_leg_id/call_control_id zelf
 * (call.recording.saved bevat geen apart recording_id, zie de toelichting
 * bovenaan dit bestand). Primair via call_leg_id; bij een 4xx daarop een
 * tweede, expliciet benoemde poging via call_session_id (zie de
 * uitgebreide toelichting hierboven). GEEN aanname over lijstvolgorde: de
 * recordings-lijst-API (RecordingListParams in Telnyx' eigen SDK-broncode)
 * documenteert geen sorteervolgorde, dus haalt hier bewust de volledige
 * lijst op i.p.v. blind het eerste element te gebruiken — kiesOpname
 * hieronder doet de daadwerkelijke, verantwoorde selectie.
 */
async function haalOpnames(callLegId: string): Promise<TelnyxOpnameResource[]> {
  const primair = await haalOpnamesMetFilter("call_leg_id", callLegId);
  if (primair.ok) return primair.opnames;

  const callSessionId = await haalCallSessionId(callLegId);
  if (!callSessionId) {
    throw new Error(`Opnamelijst ophalen bij Telnyx mislukt via call_leg_id (${primair.foutmelding}); call_session_id kon niet worden opgehaald voor een tweede poging.`);
  }
  const secundair = await haalOpnamesMetFilter("call_session_id", callSessionId);
  if (!secundair.ok) {
    throw new Error(`Opnamelijst ophalen bij Telnyx mislukt — call_leg_id: ${primair.foutmelding}; call_session_id: ${secundair.foutmelding}`);
  }
  return secundair.opnames;
}

/**
 * Kiest deterministisch de juiste opname uit haalOpnames se resultaat — NOOIT
 * blind "eerste" of "laatste" in de lijstvolgorde (die is niet
 * gedocumenteerd/gegarandeerd).
 *
 * Live bevestigd (2026-08-25, na een echte testoproep, via Telnyx Reporting
 * → Call Recordings): voor één testgesprek stonden twee losse
 * opnameresources bij Telnyx. Meest aannemelijke oorzaak, afgeleid uit
 * bevestigde broncodefeiten (niet zelf live geverifieerd via Vercel-logs —
 * zie het opleverrapport): record_start werd vóór deze wijziging zonder
 * command_id aangeroepen, dus zonder Telnyx' eigen deduplicatie (zie
 * telnyxCommando hierboven); verwerkTrainingKeuze (gesprek.ts, ONGEWIJZIGD)
 * doet vlak vóór de zeg_en_neem_op-instructie een synchrone, live
 * Monday.com-leesaanroep (haalRecenteTrainingenVoorTelefonie) — een reële
 * kandidaat om de webhookrespons trager te maken dan Telnyx' eigen
 * afleverwachting, wat een herhaalde aflevering van hetzelfde
 * call.gather.ended-event (en dus een tweede, ongededupliceerde
 * record_start) plausibel maakt. telnyxCommando se nieuwe command_id
 * voorkomt dit voortaan bij de bron.
 *
 * Selectiecriterium herzien (2026-08-26, trainertelefonie V1-afronding,
 * spec §10): sinds '*' een LEGITIEME herstart toestaat, bestaan er nu vaak
 * daadwerkelijk meerdere, INHOUDELIJK VERSCHILLENDE opnames voor dezelfde
 * call_leg_id (elke afgewezen poging + de uiteindelijk geaccepteerde) — "de
 * langste duur" zou dan fout kunnen kiezen (een afgewezen, lang uitgesponnen
 * eerste poging zou een korte, doelgerichte herkansing kunnen verdringen).
 * Attempts zijn per constructie strikt sequentieel (elke '*' stopt de
 * huidige opname VOORDAT de volgende start, zie gesprek.ts/telnyx-provider.ts
 * se stop_opname-afhandeling) — de meest recent GESTARTE opname is daarom
 * altijd de laatst geaccepteerde poging, ongeacht duur. Bij meer dan één
 * kandidaat wordt dit dus voortaan het primaire criterium, met de langste
 * duur uitsluitend als tiebreaker (bv. twee vrijwel identiek gestarte
 * dubbele opnames, het oorspronkelijke scenario hierboven). Elk geval met
 * meer dan één kandidaat wordt nog altijd expliciet gelogd (uitsluitend
 * id's/tijden/duur, nooit audio-inhoud, spec §9).
 *
 * `gewensteRecordingStartedAt` (root-cause-fix productie-incident 2026-08-27,
 * spec-eis §10) — sinds "verder inspreken" bestaan er structureel vaker
 * MEERDERE, INHOUDELIJK VERSCHILLENDE, allemaal geaccepteerde fragmenten
 * onder hetzelfde call_leg_id (elk eigen fragment, geen afgewezen pogingen)
 * — "meest recent gestart" is dan voor een RETRY van een OUDER fragment
 * ronduit fout (zou het nieuwste fragment kiezen, niet het fragment dat
 * daadwerkelijk opnieuw geprobeerd moet worden). Bij een meegegeven waarde
 * die EXACT overeenkomt met een kandidaat se eigen recording_started_at
 * (Telnyx' eigen, ongewijzigd doorgegeven waarde — zie provider.ts se
 * OpnameStatusGegevens) wordt die precies gekozen, geen heuristiek nodig.
 * Geen match (of geen waarde meegegeven): terugval op de bestaande
 * "meest recent gestart"-heuristiek — ongewijzigd gedrag voor het
 * enkelvoudige-fragment-geval.
 */
function kiesOpname(opnames: TelnyxOpnameResource[], callLegId: string, gewensteRecordingStartedAt?: string | null): TelnyxOpnameResource {
  if (opnames.length === 0) {
    // Kan structureel voorkomen zolang Telnyx de opname nog niet volledig
    // heeft verwerkt (call.recording.saved kan iets vóór de lijst-indexering
    // vuren) — de bestaande transcriptieretry (gate 1, ongewijzigd) probeert
    // dit vanzelf een volgende ronde opnieuw.
    throw new Error(`Geen opname gevonden bij Telnyx voor call_leg_id=${callLegId}.`);
  }
  if (gewensteRecordingStartedAt) {
    const precies = opnames.find((opname) => opname.recording_started_at === gewensteRecordingStartedAt);
    if (precies) return precies;
  }
  if (opnames.length > 1) {
    console.error(
      `[telefonie/telnyx] meerdere opnames gevonden voor één gesprek (call_leg_id=${callLegId}): ${opnames
        .map((opname) => `${opname.id}(duur=${opnameDuurMs(opname)}ms,start=${opname.recording_started_at ?? "onbekend"})`)
        .join(", ")} — geen exacte fragmentmatch, meest recent gestarte gekozen.`
    );
  }
  return [...opnames].sort((a, b) => {
    const startVerschil = (b.recording_started_at ?? "").localeCompare(a.recording_started_at ?? "");
    if (startVerschil !== 0) return startVerschil;
    return opnameDuurMs(b) - opnameDuurMs(a);
  })[0]!;
}

export function telnyxProvider(): TelefonieProvider {
  return {
    naam: "telnyx",

    verifieerWebhookSignature({ signatureHeader, timestampHeader, ruweBody }) {
      if (!signatureHeader || !timestampHeader || ruweBody === undefined) return false;
      const timestampGetal = Number.parseInt(timestampHeader, 10);
      if (!Number.isFinite(timestampGetal) || Math.abs(Date.now() / 1000 - timestampGetal) > REPLAY_TOLERANTIE_SECONDEN) {
        return false; // ontbrekende/onparseerbare/te oude-of-toekomstige timestamp -> nooit vertrouwen (replay-bescherming)
      }
      try {
        const ondertekendBericht = Buffer.from(`${timestampHeader}|${ruweBody}`, "utf8");
        return cryptoVerify(null, ondertekendBericht, telnyxPublicKeyObject(), Buffer.from(signatureHeader, "base64"));
      } catch {
        // Nooit een kapotte/onverwachte headervorm laten crashen — functioneel identiek aan "ongeldige signature".
        return false;
      }
    },

    ontleedInkomendeCall(vormVelden): InkomendeCallGegevens {
      const van = vormVelden.from ?? "";
      return {
        providerCallId: vormVelden.call_control_id ?? "",
        vanNummerRuw: VERBORGEN_NUMMER_WAARDEN.has(van.toLowerCase()) ? null : van,
        nummerVerborgen: VERBORGEN_NUMMER_WAARDEN.has(van.toLowerCase()),
      };
    },

    ontleedGatherResultaat(vormVelden): GatherResultaat {
      // Live regressie-vervolgronde (2026-08-27/28) — vormVelden.digits
      // (meervoud) is call.gather.ended se eigen veld; call.dtmf.received
      // (nu de PRIMAIRE trigger tijdens een actieve opname, zie route.ts)
      // heeft in plaats daarvan een ENKELVOUDIG `digit`-veld (hard bevestigd
      // tegen Telnyx' eigen SDK-broncode, CallDtmfReceived.Payload) — vandaar
      // de terugval. clientState hieronder: zie GatherResultaat se
      // doc-comment (provider.ts) voor de volledige dedup-redenering.
      const cijfers = vormVelden.digits ?? vormVelden.digit;
      return { cijfers: cijfers && cijfers.length > 0 ? cijfers : null, clientState: vormVelden.client_state ?? null };
    },

    ontleedOpnameStatus(vormVelden): OpnameStatusGegevens {
      const status = vormVelden.event_type === "call.recording.saved" ? "voltooid" : "mislukt";
      // providerRecordingId/ophaalReferentie = call_control_id (bij dit event
      // door vlakTelnyxEventAf al op call_leg_id genormaliseerd, zie
      // webhook-helpers.ts) — GEEN apart recording_id: dat veld ontbreekt op
      // call.recording.saved (hard bevestigd via Telnyx' eigen SDK-broncode,
      // zie de toelichting bovenaan dit bestand). haalOpnameOp/verwijderOpname
      // zoeken de daadwerkelijke opname hiermee op via call_leg_id.
      const callLegId = vormVelden.call_control_id ?? "";
      return {
        providerCallId: callLegId,
        providerRecordingId: callLegId,
        status,
        duurSeconden: berekenDuurSeconden(vormVelden.recording_started_at, vormVelden.recording_ended_at),
        ophaalReferentie: status === "voltooid" ? (callLegId || null) : null,
        // spec §10/§12/§18 — de client_state die bij het bijbehorende
        // record_start-commando is meegegeven (zie voerInstructieUit se
        // zeg_en_neem_op-tak), letterlijk teruggegeven op dit event.
        // vlakTelnyxEventAf (webhook-helpers.ts) slaat elk top-level
        // payloadveld al plat op — geen aparte parsing hier nodig.
        clientState: vormVelden.client_state ?? null,
        // Root-cause-fix productie-incident (2026-08-27, spec-eis §10) —
        // ONGEWIJZIGD doorgegeven, zodat haalOpnameOp bij een retry precies
        // DIT fragment kan terugvinden (zie provider.ts se doc-comment).
        recordingStartedAt: vormVelden.recording_started_at ?? null,
      };
    },

    ontleedHangup(vormVelden): HangupGegevens {
      // Root-cause-fix productie-incident (2026-08-27, spec-eis §8) —
      // call.hangup se payload bevat, net als call.speak.ended, rechtstreeks
      // call_control_id (geen call_leg_id-terugval nodig). hangup_cause/
      // hangup_source zijn Telnyx' eigen, providerspecifieke velden —
      // vlakTelnyxEventAf slaat ze al generiek plat op, dus uitsluitend
      // doorgeven hier, nooit vertalen/interpreteren (spec: uitsluitend
      // beheerdiagnostiek).
      return {
        providerCallId: vormVelden.call_control_id ?? "",
        hangupCause: vormVelden.hangup_cause ?? null,
        hangupSource: vormVelden.hangup_source ?? null,
      };
    },

    ontleedSpreekAfgerond(vormVelden): SpreekAfgerondGegevens {
      // call.speak.ended bevat, anders dan call.recording.saved, WEL
      // rechtstreeks call_control_id (bevestigd tegen Telnyx' eigen
      // SDK-broncode, CallSpeakEnded.Payload in webhooks.ts) — geen
      // call_leg_id-terugval nodig, vlakTelnyxEventAf (webhook-helpers.ts)
      // slaat het toch al plat op.
      return { providerCallId: vormVelden.call_control_id ?? "", clientState: vormVelden.client_state ?? null };
    },

    async voerVoiceInstructiesUit(providerCallId, instructies): Promise<VoiceWebhookRespons> {
      for (const instructie of instructies) {
        try {
          await voerInstructieUit(providerCallId, instructie);
        } catch (error) {
          // Bewust NOOIT doorgooien (zie provider.ts se doc-comment) — een
          // gefaald vervolgcommando (bv. de beller heeft net zelf al
          // opgehangen, of het call_control_id is inmiddels verlopen) mag de
          // webhookafhandeling zelf nooit laten crashen; Telnyx krijgt hoe
          // dan ook een 200-ack. De foutmelding zelf (nooit de bodytekst, zie
          // telnyxCommando) wordt wél gelogd, mét het instructiesoort erbij —
          // dit is de eerste plek om te kijken als de eerste testoproep geen
          // geluid/gedrag laat zien.
          console.error(`[telefonie/telnyx] call-control-commando mislukt (call_control_id=${providerCallId}, soort=${instructie.soort}):`, error instanceof Error ? error.message : error);
        }
      }
      return { status: 200, contentType: null, body: null };
    },

    async beantwoordOproep(providerCallId): Promise<void> {
      await telnyxCommando(providerCallId, "answer", {});
    },

    async haalOpnameOp(ophaalReferentie, fragmentSelectie): Promise<ArrayBuffer> {
      const opname = kiesOpname(await haalOpnames(ophaalReferentie), ophaalReferentie, fragmentSelectie?.recordingStartedAt);
      const mp3Url = opname.download_urls?.mp3;
      if (!mp3Url) {
        throw new Error(`Opname ${opname.id} heeft geen mp3-downloadlink (download_urls.mp3 ontbreekt).`);
      }
      // De signed URL zelf bevat al zijn eigen (kortlevende) autorisatie in
      // de querystring — geen extra Authorization-header nodig/gewenst hier.
      const audioResponse = await fetch(mp3Url);
      if (!audioResponse.ok) {
        throw new Error(`Opname ${opname.id} downloaden mislukt: HTTP ${audioResponse.status}`);
      }
      return audioResponse.arrayBuffer();
    },

    async verwijderOpname(providerRecordingId): Promise<void> {
      const opnames = await haalOpnames(providerRecordingId);
      const primair = kiesOpname(opnames, providerRecordingId);
      const response = await fetch(`${TELNYX_API_BASIS}/recordings/${encodeURIComponent(primair.id!)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey()}` },
      });
      if (!response.ok) {
        throw new Error(`Opname ${primair.id} verwijderen bij Telnyx mislukt: HTTP ${response.status}`);
      }
      // Spec §9/gate 1: nooit audio onbeperkt laten staan. Was er meer dan
      // één kandidaat — sinds trainertelefonie V1-afronding (2026-08-26) de
      // NORMALE situatie na een of meer '*'-herstarts (elke afgewezen
      // poging laat een eigen opnameresource achter, spec §10/§18: "verwijder
      // de audio van een afgewezen opname zo snel mogelijk"), en daarnaast
      // nog altijd mogelijk door de vóór de command_id-fix hierboven al
      // ontstane dubbele-opname-klasse (zie kiesOpname) — dan ook de
      // overige(n) best-effort opruimen — een falende extra verwijdering
      // blokkeert nooit de hierboven al geslaagde hoofdverwijdering (de
      // aanroeper behandelt verwijderOpname zelf ook al als best-effort, zie
      // gesprek.ts se verwerkTranscriptiepoging/verwerkTranscriptieMislukking).
      // Dit is dus bewust ÉÉN aanroep die ALLE opnames van dit gesprek
      // opruimt, ongeacht welke van de N pogingen uiteindelijk geaccepteerd
      // werd — geroepen pas nadat de geaccepteerde poging al veilig
      // getranscribeerd is (zie gesprek.ts), dus nooit vóórdat de nog
      // benodigde opname al gedownload is.
      for (const overig of opnames) {
        if (overig.id === primair.id) continue;
        try {
          const extraResponse = await fetch(`${TELNYX_API_BASIS}/recordings/${encodeURIComponent(overig.id!)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${apiKey()}` },
          });
          if (!extraResponse.ok) throw new Error(`HTTP ${extraResponse.status}`);
        } catch (error) {
          console.error(`[telefonie/telnyx] extra dubbele opname verwijderen mislukt (recording_id=${overig.id}):`, error instanceof Error ? error.message : error);
        }
      }
    },
  };
}
