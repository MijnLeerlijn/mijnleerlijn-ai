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
// Onderzoeksbasis (2026-08-25, WebFetch was in deze sandbox geblokkeerd voor
// developers.telnyx.com — onderstaande komt dus uit WebSearch-samenvattingen
// van de officiële Telnyx-documentatie, NIET uit een zelf geopende
// primaire bron; zie het opleverrapport se beperkingen-sectie voor de
// volledige toelichting):
//  - Call Control v2-webhooks zijn JSON, event-gedreven, altijd naar ÉÉN
//    vooraf in de Telnyx Console geconfigureerde webhook-URL (in
//    tegenstelling tot Twilio's per-stap action-URL's) — vandaar de ENE
//    dispatcher-route (zie app/api/trainers/telefonie/telnyx-webhook/route.ts)
//    i.p.v. de 4 aparte Twilio-routes.
//  - Telnyx beantwoordt zijn eigen webhook nooit met call-control-instructies
//    in de HTTP-respons (in tegenstelling tot TwiML) — instructies MOETEN als
//    aparte, Bearer-geauthenticeerde POST-commando's naar
//    api.telnyx.com/v2/calls/{call_control_id}/actions/... verstuurd worden.
//  - Signatuurverificatie: asymmetrische Ed25519 over `{telnyx-timestamp}|
//    {rauwe body}`, geverifieerd met het ACCOUNT-publieke-sleutel (Console:
//    Account Settings > Keys & Credentials > Public Key), headers
//    telnyx-signature-ed25519 (base64 signature) + telnyx-timestamp
//    (unix-seconden, met een replaytolerantie — hier 5 minuten, zelfde
//    default als Telnyx' eigen SDK).
//  - EU-opslag: Telnyx' "Data Locality"-instelling (Console: Account
//    Settings > Profile > Data Storage Location, EENMALIG, onomkeerbaar)
//    dekt expliciet "Media Storage (recordings)" naast CDR's/MDR's, met
//    "Germany (EU)" als optie — bij die keuze draait alle Voice API-
//    verwerking + opnameopslag via Telnyx' Frankfurt-datacenter. Dit is de
//    Console-instelling die in het opleverrapport als vereiste stap staat.
//
// Bewust GEEN telnyx-npm-package als afhankelijkheid: de hele benodigde
// oppervlakte (Ed25519-verificatie, een paar REST-POST/GET/DELETE-aanroepen)
// is met Node's ingebouwde crypto + fetch() exact na te bouwen, met volledige
// controle over precies welke bytes ondertekend/verstuurd worden — bij een
// ongeverifieerde SDK-versie (geen WebFetch-toegang om de exacte
// pakket-API te controleren) is dat een kleinere onzekerheidsmarge dan een
// derde package vertrouwen op basis van uitsluitend zoekresultaat-samenvattingen.

const TELNYX_API_BASIS = "https://api.telnyx.com/v2";
const REPLAY_TOLERANTIE_SECONDEN = 300; // 5 minuten — zelfde default als Telnyx' eigen SDK (WebSearch-bevestigd)

// LET OP (verifieer vóór/tijdens de eerste testoproep, zie het
// opleverrapport se teststappen): dit is de best-gedocumenteerde aanname
// voor een Nederlandse neurale stem die ik zonder WebFetch-toegang tot de
// Telnyx Console/API-referentie kon vaststellen. Als de eerste testoproep
// geen gesproken tekst oplevert (wel een verbinding, geen audio, of een
// 4xx op de speak/gather_using_speak-commando's in de Vercel-logs), is dit
// de eerste plek om te controleren — kies de exacte, actuele voice-ID in de
// Telnyx Console (Voice > Programmable Voice) en pas uitsluitend deze
// constante aan.
const TELNYX_TTS_VOICE = "AWS.Polly.Lotte-Neural";
const TELNYX_TTS_TAAL = "nl-NL";

// Zelfde defensieve aanpak/velden als twilio-provider.ts se
// VERBORGEN_NUMMER_WAARDEN — algemene SIP/telefonieplatformkennis, NIET in
// deze sessie live tegen een echt Telnyx-gesprek geverifieerd (zie het
// opleverrapport se beperkingen-sectie).
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
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Telnyx-commando "${actie}" mislukt: HTTP ${response.status}`);
  }
}

/** Vertaalt één providerneutrale VoiceInstructie naar de bijbehorende Telnyx Call Control-commando('s). */
async function voerInstructieUit(callControlId: string, instructie: VoiceInstructie): Promise<void> {
  switch (instructie.soort) {
    case "zeg_en_ophangen":
      await telnyxCommando(callControlId, "speak", { payload: instructie.tekst, payload_type: "text", voice: TELNYX_TTS_VOICE, language: TELNYX_TTS_TAAL });
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
        valid_digits: "0123456789",
        min_digits: instructie.maxCijfers,
        max_digits: instructie.maxCijfers,
        inter_digit_timeout_millis: instructie.timeoutSeconden * 1000,
      });
      return;
    case "zeg_en_neem_op":
      // Geen aparte "zeg eerst de tekst"-stap nodig: record_start begint
      // direct (de dispatcher-route sprak de instructietekst zelf al uit via
      // een voorafgaand gather_using_speak-/speak-commando in verwerkTrainingKeuze
      // se eigen VoiceInstructie — hier komt uitsluitend de opnamestap zelf
      // aan de beurt). stopToets wordt hier NIET doorgegeven: Telnyx' eigen
      // record_start kent geen "stop-op-toets"-parameter; vroegtijdig
      // stoppen op '#' wordt door de dispatcher-route apart afgehandeld via
      // het onafhankelijke call.dtmf.received-event (zie de route se
      // doc-comment) — de opname stopt sowieso altijd via stilte-timeout of
      // maxDuurSeconden hieronder, dus dit is een UX-vangnet, geen
      // functionele afhankelijkheid.
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
      return {
        providerCallId: vormVelden.call_control_id ?? "",
        providerRecordingId: vormVelden.recording_id ?? "",
        status,
        duurSeconden: berekenDuurSeconden(vormVelden.recording_started_at, vormVelden.recording_ended_at),
        // Bewust het recording_id zelf, GEEN URL (spec §9: nooit een kale
        // publieke URL als ophaalReferentie opslaan) — Telnyx' eigen
        // recording_urls uit de webhook-payload zijn S3-signed-URL's met
        // slechts ~10 minuten geldigheid, te kort voor onze eigen
        // transcriptieretry-bewaartermijn van 24 uur (zie gesprek.ts).
        // haalOpnameOp hieronder haalt daarom bij ELKE poging een VERSE
        // signed URL op via het recording_id, i.p.v. een verlopen URL te
        // hergebruiken.
        ophaalReferentie: status === "voltooid" ? (vormVelden.recording_id ?? null) : null,
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
          // dan ook een 200-ack. Generieke regel, geen providerresponstekst
          // (kan in theorie geadresseerde/telefonienummerinhoud bevatten).
          console.error(`[telefonie/telnyx] call-control-commando mislukt (call_control_id=${providerCallId}, soort=${instructie.soort}).`);
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
      // ophaalReferentie = Telnyx' recording_id (spec §9: providerspecifieke
      // referentie, nooit een kale URL) — verse GET per poging levert een
      // nieuwe, kortlevende signed URL (zie ontleedOpnameStatus hierboven).
      const metaResponse = await fetch(`${TELNYX_API_BASIS}/recordings/${encodeURIComponent(ophaalReferentie)}`, {
        headers: { Authorization: `Bearer ${apiKey()}` },
      });
      if (!metaResponse.ok) {
        throw new Error(`Opnamemetadata ophalen mislukt: HTTP ${metaResponse.status}`);
      }
      const meta = (await metaResponse.json()) as { data?: { recording_urls?: { mp3?: string } } };
      const mp3Url = meta.data?.recording_urls?.mp3;
      if (!mp3Url) {
        throw new Error("Geen mp3-ophaal-URL aanwezig in de Telnyx-opnamemetadata.");
      }
      // De signed URL zelf bevat al zijn eigen (kortlevende) autorisatie in
      // de querystring — geen extra Authorization-header nodig/gewenst hier.
      const audioResponse = await fetch(mp3Url);
      if (!audioResponse.ok) {
        throw new Error(`Opname downloaden mislukt: HTTP ${audioResponse.status}`);
      }
      return audioResponse.arrayBuffer();
    },

    async verwijderOpname(providerRecordingId): Promise<void> {
      const response = await fetch(`${TELNYX_API_BASIS}/recordings/${encodeURIComponent(providerRecordingId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey()}` },
      });
      if (!response.ok) {
        throw new Error(`Opname verwijderen bij Telnyx mislukt: HTTP ${response.status}`);
      }
    },
  };
}
