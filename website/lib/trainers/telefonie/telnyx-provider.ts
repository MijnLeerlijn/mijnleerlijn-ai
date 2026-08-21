import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { requireEnv } from "@/config/env";
import type { TelefonieProvider, InkomendeCallGegevens, GatherResultaat, OpnameStatusGegevens, VoiceInstructie, VoiceWebhookRespons } from "./provider";

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

async function telnyxCommando(callControlId: string, actie: string, body: Record<string, unknown>): Promise<void> {
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
    body: JSON.stringify({ ...body, command_id: `${actie}:${callControlId}` }),
  });
  if (!response.ok) {
    // Statuscode + actienaam in de foutmelding (geen bodytekst — kan
    // providerresponstekst met adres-/telefoonnummerinhoud bevatten, spec
    // §9) — bedoeld om bv. een 422 op een ongeldige voice-ID (zie
    // TELNYX_TTS_VOICE hierboven) direct herkenbaar te maken in de logs.
    throw new Error(`Telnyx-commando "${actie}" mislukt: HTTP ${response.status}`);
  }
}

/** Vertaalt één providerneutrale VoiceInstructie naar de bijbehorende Telnyx Call Control-commando('s). */
async function voerInstructieUit(callControlId: string, instructie: VoiceInstructie): Promise<void> {
  switch (instructie.soort) {
    case "zeg_en_ophangen":
      await telnyxCommando(callControlId, "speak", {
        payload: instructie.tekst,
        payload_type: "text",
        voice: TELNYX_TTS_VOICE,
        language: TELNYX_TTS_TAAL,
        service_level: TELNYX_TTS_SERVICE_LEVEL,
      });
      await telnyxCommando(callControlId, "hangup", {});
      return;
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
        valid_digits: "0123456789",
        minimum_digits: instructie.maxCijfers,
        maximum_digits: instructie.maxCijfers,
        inter_digit_timeout_millis: instructie.timeoutSeconden * 1000,
      });
      return;
    case "zeg_en_neem_op":
      // Geen aparte "zeg eerst de tekst"-stap nodig: record_start begint
      // direct (de dispatcher-route sprak de instructietekst zelf al uit via
      // een voorafgaand gather_using_speak-/speak-commando in verwerkTrainingKeuze
      // se eigen VoiceInstructie — hier komt uitsluitend de opnamestap zelf
      // aan de beurt). Bewust GEEN `transcription`-parameter (default false,
      // spec §11: eigen Whisper-infrastructuur, nooit Telnyx' eigen
      // transcriptiedienst — die kost bovendien apart, óók impliciet via
      // timeout_secs se eigen stilte-detectie, zie Telnyx' documentatie
      // daarvan). stopToets wordt hier NIET doorgegeven: record_start kent
      // geen "stop-op-toets"-parameter; vroegtijdig stoppen op '#' wordt door
      // de dispatcher-route apart geprobeerd via het onafhankelijke
      // call.dtmf.received-event (zie de route se doc-comment voor de nu
      // bekende beperking daarvan) — de opname stopt hoe dan ook altijd via
      // stilte-timeout of maxDuurSeconden hieronder, dus dit is een
      // UX-vangnet, geen functionele afhankelijkheid.
      await telnyxCommando(callControlId, "record_start", {
        format: "mp3",
        channels: "single",
        max_length: instructie.maxDuurSeconden,
        timeout_secs: instructie.stilteTimeoutSeconden,
        play_beep: true,
      });
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
 * Haalt ALLE opnames van dit gesprek op via call_leg_id — spec §9:
 * ophaalReferentie/providerRecordingId zijn bij Telnyx het call_leg_id zelf
 * (call.recording.saved bevat geen apart recording_id, zie de toelichting
 * bovenaan dit bestand). GEEN aanname over lijstvolgorde: de recordings-
 * lijst-API (RecordingListParams in Telnyx' eigen SDK-broncode) documenteert
 * geen sorteervolgorde, dus haalt hier bewust de volledige lijst op i.p.v.
 * blind het eerste element te gebruiken — kiesOpname hieronder doet de
 * daadwerkelijke, verantwoorde selectie.
 */
async function haalOpnames(callLegId: string): Promise<TelnyxOpnameResource[]> {
  const query = new URLSearchParams({ "filter[call_leg_id]": callLegId }).toString();
  const response = await fetch(`${TELNYX_API_BASIS}/recordings?${query}`, { headers: { Authorization: `Bearer ${apiKey()}` } });
  if (!response.ok) {
    throw new Error(`Opnamelijst ophalen bij Telnyx mislukt: HTTP ${response.status} — ${await telnyxFoutdetail(response)}`);
  }
  const body = (await response.json()) as { data?: TelnyxOpnameResource[] };
  return (body.data ?? []).filter((opname) => opname.id);
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
 * voorkomt dit voortaan bij de bron. Deze functie blijft er daarnaast
 * defensief tegen (bv. voor al vóór die fix ontstane dubbele opnames, zoals
 * de testoproep): bij meer dan één kandidaat wordt expliciet gesorteerd op
 * de LANGSTE opnameduur (recording_ended_at minus recording_started_at) —
 * bij twee vrijwel gelijktijdig gestarte dubbele opnames is duur een
 * sterker, inhoudelijk onderbouwd signaal voor "de opname die het volledige
 * verslag heeft vastgelegd" dan starttijd alleen — met recording_started_at
 * (meest recent) als tiebreaker. Elk geval met meer dan één kandidaat wordt
 * expliciet gelogd (uitsluitend id's/tijden/duur, nooit audio-inhoud, spec
 * §9) zodat dit zichtbaar blijft.
 */
function kiesOpname(opnames: TelnyxOpnameResource[], callLegId: string): TelnyxOpnameResource {
  if (opnames.length === 0) {
    // Kan structureel voorkomen zolang Telnyx de opname nog niet volledig
    // heeft verwerkt (call.recording.saved kan iets vóór de lijst-indexering
    // vuren) — de bestaande transcriptieretry (gate 1, ongewijzigd) probeert
    // dit vanzelf een volgende ronde opnieuw.
    throw new Error(`Geen opname gevonden bij Telnyx voor call_leg_id=${callLegId}.`);
  }
  if (opnames.length > 1) {
    console.error(
      `[telefonie/telnyx] meerdere opnames gevonden voor één gesprek (call_leg_id=${callLegId}): ${opnames
        .map((opname) => `${opname.id}(duur=${opnameDuurMs(opname)}ms,start=${opname.recording_started_at ?? "onbekend"})`)
        .join(", ")} — langste duur gekozen.`
    );
  }
  return [...opnames].sort((a, b) => {
    const duurVerschil = opnameDuurMs(b) - opnameDuurMs(a);
    if (duurVerschil !== 0) return duurVerschil;
    return (b.recording_started_at ?? "").localeCompare(a.recording_started_at ?? "");
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
      const cijfers = vormVelden.digits;
      return { cijfers: cijfers && cijfers.length > 0 ? cijfers : null };
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
      };
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

    async stopOpname(providerCallId): Promise<void> {
      await telnyxCommando(providerCallId, "record_stop", {});
    },

    async haalOpnameOp(ophaalReferentie): Promise<ArrayBuffer> {
      const opname = kiesOpname(await haalOpnames(ophaalReferentie), ophaalReferentie);
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
      // Spec §9/gate 1: nooit audio onbeperkt laten staan. Was er (bv. door
      // een vóór de command_id-fix hierboven al ontstane dubbele opname,
      // zie kiesOpname) meer dan één kandidaat, dan ook de overige(n)
      // best-effort opruimen — een falende extra verwijdering blokkeert
      // nooit de hierboven al geslaagde hoofdverwijdering (de aanroeper
      // behandelt verwijderOpname zelf ook al als best-effort, zie
      // gesprek.ts se verwerkTranscriptiepoging/verwerkTranscriptieMislukking).
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
