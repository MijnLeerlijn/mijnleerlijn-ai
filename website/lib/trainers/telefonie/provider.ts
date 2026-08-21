// Traineromgeving V1, Ronde 3.5 (2026-08-25) — telefonieprovider-abstractie
// (spec §16): "Kernlogica voor trainer/training/concept mag niet afhankelijk
// worden van providerspecifieke requestvelden." Alles hieronder is in
// generieke, providerneutrale termen — geen call_control_id/event_type/
// telnyx-signature-ed25519 ergens buiten de adapter zelf (telnyx-provider.ts,
// de enige huidige implementatie van deze interface). gesprek.ts en de
// webhookroute praten uitsluitend tegen DEZE interface.
//
// Providermigratie (2026-08-25, vervolgronde) — was oorspronkelijk Twilio
// (TwiML/CallSid/Digits/X-Twilio-Signature, zie desgewenst de git-historie
// van dit bestand), nu Telnyx (zie het opleverrapport van de providermigratie
// voor de motivatie: Telnyx' Data Locality-instelling biedt een concreet,
// voor Voice-opnames bevestigd EU-opslagmechanisme, Twilio Voice/recordings
// had dat niet even concreet gedocumenteerd). Twilio beantwoordde een webhook
// SYNCHROON met de volgende instructies in de HTTP-respons zelf (TwiML) —
// Telnyx werkt fundamenteel anders: webhooks krijgen alleen een lege 200-ack,
// en de daadwerkelijke call-control-stappen (spreken/cijfers verzamelen/
// opnemen/ophangen) lopen via APARTE, geauthenticeerde POST-aanroepen naar
// api.telnyx.com met het call_control_id uit de webhook. Een puur synchrone
// "bouw een responsstring"-methode paste daarom niet meer — vandaar het
// asynchrone voerVoiceInstructiesUit hieronder. InkomendeCallGegevens/
// GatherResultaat/OpnameStatusGegevens/VoiceInstructie zelf zijn tijdens de
// migratie ONGEWIJZIGD gebleven — gesprek.ts kende en kent de providerwissel
// dus niet.

export interface InkomendeCallGegevens {
  /** Providerbrede, unieke identifier voor dit hele gesprek — de idempotentiesleutel. */
  providerCallId: string;
  /** Genormaliseerd waar mogelijk door de provider zelf; wordt hierna ALTIJD nogmaals server-side genormaliseerd (nummer.ts) — nooit blind vertrouwd. */
  vanNummerRuw: string | null;
  /** True zodra de provider zelf al aangeeft dat de beller-ID verborgen/anoniem/onbeschikbaar is (spec §4). */
  nummerVerborgen: boolean;
}

export interface GatherResultaat {
  /** Ingedrukte toetsen, of null als er niets binnenkwam (timeout/geen invoer). */
  cijfers: string | null;
}

export interface OpnameStatusGegevens {
  providerCallId: string;
  providerRecordingId: string;
  status: "voltooid" | "mislukt";
  duurSeconden: number | null;
  /** Alleen aanwezig bij status "voltooid" — een providerspecifieke referentie, NOOIT een kale publieke URL (spec §9: "geen opname-URL publiek toegankelijk"). Uitsluitend te gebruiken via haalOpnameOp() hieronder. */
  ophaalReferentie: string | null;
}

/**
 * Providerneutrale spreekinstructies — de webhookroutes/call-state-logica
 * bouwen een lijst hiervan; de provideradapter vertaalt dat naar zijn eigen
 * call-control-formaat (bij Twilio: TwiML-XML). Bewust een gesloten, kleine
 * set (geen vrije TwiML-passthrough vanuit de kernlogica) — precies de
 * grens die spec §16 vraagt.
 */
export type VoiceInstructie =
  | { soort: "zeg_en_ophangen"; tekst: string }
  | { soort: "zeg_en_kies_cijfers"; tekst: string; actieUrl: string; maxCijfers: number; timeoutSeconden: number }
  | {
      soort: "zeg_en_neem_op";
      tekst: string;
      actieUrl: string;
      statusCallbackUrl: string;
      maxDuurSeconden: number;
      stilteTimeoutSeconden: number;
      stopToets: string;
    };

/** Wat de webhookroute zelf als HTTP-antwoord aan de provider moet sturen — zie voerVoiceInstructiesUit. */
export interface VoiceWebhookRespons {
  status: number;
  contentType: string | null;
  body: string | null;
}

export interface TelefonieProvider {
  naam: string;

  /**
   * Cryptografische/signature-verificatie van een binnenkomende webhook
   * (spec §17) — MOET true teruggeven vóór er ook maar iets met de
   * request-inhoud gedaan wordt.
   *
   * Twilio ondertekent een HMAC-SHA1 over de EXACTE externe URL + de
   * geparste vormvelden (`url`/`vormVelden`) — Telnyx ondertekent een
   * asymmetrische Ed25519-signature over `{timestampHeader}|{ruweBody}`, de
   * LETTERLIJKE, ongeparste body-tekst (URL en vormvelden spelen daarbij geen
   * rol). Beide velden zijn dus optioneel — elke adapter gebruikt alleen wat
   * zijn eigen provider daadwerkelijk ondertekent, nooit een her-geserialiseerde
   * afleiding daarvan (dat zou de handtekening altijd laten falen/omzeilen).
   */
  verifieerWebhookSignature(input: {
    url: string;
    signatureHeader: string | null;
    vormVelden: Record<string, string>;
    /** Alleen Telnyx: de telnyx-timestamp-header (onderdeel van het ondertekende bericht + replay-tolerantie). */
    timestampHeader?: string | null;
    /** Alleen Telnyx: de rauwe, ongeparste body-tekst — DIT ondertekent Telnyx letterlijk, nooit JSON.parse+JSON.stringify ervan. */
    ruweBody?: string;
  }): boolean;

  ontleedInkomendeCall(vormVelden: Record<string, string>): InkomendeCallGegevens;
  ontleedGatherResultaat(vormVelden: Record<string, string>): GatherResultaat;
  ontleedOpnameStatus(vormVelden: Record<string, string>): OpnameStatusGegevens;

  /**
   * Voert de instructies uit en geeft terug wat de webhookroute zelf als
   * HTTP-antwoord moet sturen. Bij Twilio is dit zuiver synchroon (intern
   * geen I/O) een TwiML-string bouwen — de HTTP-respons IS bij Twilio de
   * hele call-control-mechanica. Bij Telnyx voert dit de daadwerkelijke
   * Call Control-commando's uit (aparte, geauthenticeerde POST-aanroepen
   * naar api.telnyx.com met providerCallId=call_control_id) en geeft altijd
   * een lege 200-ack terug — Telnyx accepteert geen instructies IN het
   * webhookantwoord zelf. Bij Telnyx faalt deze functie bewust NOOIT naar de
   * aanroeper toe (elke individuele commandofout wordt intern gevangen en
   * gelogd, nooit doorgegooid) — spec §19 se "nooit minutenlang aan de lijn/
   * nooit een onnodige 5xx" geldt hier des te sterker omdat een falend
   * vervolgcommando anders de hele webhookafhandeling zou laten crashen.
   */
  voerVoiceInstructiesUit(providerCallId: string, instructies: VoiceInstructie[]): Promise<VoiceWebhookRespons>;

  /**
   * Expliciet een binnenkomend gesprek beantwoorden. Bij Twilio bestaat dit
   * concept niet als aparte stap (de eerste TwiML-respons IS het antwoord) —
   * daar dus een no-op. Bij Telnyx MOET dit een echt "answer"-commando zijn
   * vóórdat enig ander call-control-commando (spreken/verzamelen/opnemen)
   * geldig is — zie telnyx-provider.ts.
   */
  beantwoordOproep(providerCallId: string): Promise<void>;

  /**
   * Een lopende opname vroegtijdig stoppen (bv. de beller drukt de
   * stop-toets). Bij Twilio bestaat dit concept niet los van de opname-
   * instructie zelf (finishOnKey zit al IN de <Record>-instructie) — daar dus
   * een no-op. Bij Telnyx een apart "record_stop"-commando — zie
   * telnyx-provider.ts.
   */
  stopOpname(providerCallId: string): Promise<void>;

  /** Providerauthenticatie geregeld door de adapter zelf (spec §9: "provider-authenticated downloads") — geeft de ruwe audiobytes terug, nooit een tussenliggende publieke URL. */
  haalOpnameOp(ophaalReferentie: string): Promise<ArrayBuffer>;

  /** Best-effort opruiming bij de provider zelf (spec §9: "audio verwijderen zodra transcriptie succesvol + concept veilig opgeslagen is") — MAG falen zonder de aanroeper te blokkeren; aanroepers loggen een mislukking, gooien 'm nooit door. */
  verwijderOpname(providerRecordingId: string): Promise<void>;
}
