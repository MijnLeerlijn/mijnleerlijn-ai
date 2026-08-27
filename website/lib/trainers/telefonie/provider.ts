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
  /**
   * Live regressie-vervolgronde (2026-08-27/28, spec: '*' en '#' deden nog
   * steeds niets tijdens een actieve opname) — de client_state die bij het
   * BIJBEHORENDE opname_toets-gather-commando is meegegeven (bij Telnyx
   * letterlijk teruggegeven op zowel call.dtmf.received als
   * call.gather.ended voor datzelfde gather-commando, zie telnyx-provider.ts
   * se opname_starten/opname_hervatten). Dé sleutel voor gesprek.ts se
   * claimOpnameToetsVerwerking: bewust NIET heropnamePogingen zelf, want die
   * teller wordt door een geldige '*'-verwerking al bijgewerkt vóórdat de
   * nieuwe opname daadwerkelijk herbewapend is — een tweede/latere
   * aflevering van DEZELFDE fysieke toetsdruk (bv. eerst
   * call.dtmf.received, later call.gather.ended) zou bij een verse lezing
   * van heropnamePogingen de al-bijgewerkte stand zien en zichzelf ten
   * onrechte als een nieuwe, geldige toetsdruk beschouwen. Null als de
   * provider geen client_state teruggaf (bv. een gather van vóór deze
   * ronde, of een test zonder client_state) — gesprek.ts valt dan terug op
   * ongeclaimd (ongewijzigd) gedrag i.p.v. de toetsdruk te blokkeren.
   */
  clientState: string | null;
}

export interface OpnameStatusGegevens {
  providerCallId: string;
  providerRecordingId: string;
  status: "voltooid" | "mislukt";
  duurSeconden: number | null;
  /** Alleen aanwezig bij status "voltooid" — een providerspecifieke referentie, NOOIT een kale publieke URL (spec §9: "geen opname-URL publiek toegankelijk"). Uitsluitend te gebruiken via haalOpnameOp() hieronder. */
  ophaalReferentie: string | null;
  /**
   * Trainertelefonie V1-afronding (2026-08-26, spec §10/§12/§18) — de
   * client_state die bij het BIJBEHORENDE record_start-commando is
   * meegegeven (bij Telnyx letterlijk teruggegeven op elk vervolg-webhook,
   * zie telnyx-provider.ts). Draagt bij Telnyx de heropnamePogingen-waarde
   * van het moment van opnemen, zodat gesprek.ts kan vaststellen of dit
   * event bij de HUIDIGE (geaccepteerde) opnamepoging hoort, of bij een
   * inmiddels via '*' AFGEWEZEN eerdere poging (die mag nooit alsnog
   * verwerkt worden — spec §12/§18, "een expliciet afgewezen opname mag
   * nooit later alsnog verwerkt worden"). Null als de provider geen
   * client_state teruggaf (bv. een oud/ongebruikelijk event).
   */
  clientState: string | null;
  /**
   * Root-cause-fix productie-incident (2026-08-27, spec-eis §10) — Telnyx'
   * eigen recording_started_at van DIT specifieke fragment, ONGEWIJZIGD
   * doorgegeven. Nodig omdat er bij Telnyx meerdere opnameresources onder
   * hetzelfde call_leg_id kunnen staan zodra een gesprek meerdere fragmenten
   * heeft (ná "verder inspreken") — dit is de sleutel waarmee haalOpnameOp
   * hieronder precies DIT fragment terugvindt, i.p.v. providers.ts se oude
   * "meest recente opname"-heuristiek (die bij meerdere fragmenten het
   * verkeerde fragment zou kunnen kiezen, bv. bij een automatische retry van
   * een EERDER fragment terwijl er inmiddels al een NIEUWER fragment loopt).
   */
  recordingStartedAt: string | null;
}

/**
 * Root-cause-fix productie-incident (2026-08-27, spec-eis §8) — het
 * call.hangup-webhookevent: de beller/callee/provider heeft de verbinding
 * beëindigd. Providerneutraal opgeslagen voor beheerdiagnostiek (spec-eis:
 * "sla hangup_cause/hangup_source op waar mogelijk") — gesprek.ts gebruikt
 * dit event ZELF ook als laatste redmiddel om reeds opgenomen/getranscribeerd
 * materiaal alsnog te verwerken als de oproep nog niet was afgerond (spec-eis
 * §8: "maak de flow bestand tegen een onverwachte call.hangup").
 */
export interface HangupGegevens {
  providerCallId: string;
  /** Telnyx' eigen, providerspecifieke hangup-oorzaakcode (bv. "normal_clearing", "timeout") — nooit vertaald/geïnterpreteerd, uitsluitend opgeslagen voor beheer. Null als de provider dit veld niet meegaf. */
  hangupCause: string | null;
  /** Telnyx' eigen aanduiding van wie ophing (bv. "caller"/"callee"). Null als de provider dit veld niet meegaf. */
  hangupSource: string | null;
}

/**
 * Trainertelefonie V1-afronding, productieblocker-ronde (2026-08-26, spec
 * "instructie moet volledig zijn uitgesproken vóór opname start") — het
 * resultaat van een call.speak.ended-event: DE deterministische, door
 * Telnyx zelf gegarandeerde bevestiging dat een eerder speak-commando
 * volledig is afgespeeld (Expected Webhooks van het speak-commando:
 * call.speak.started/call.speak.ended — hard bevestigd tegen Telnyx' eigen
 * SDK-broncode, zie het opleverrapport). Geen timing-gok, geen arbitraire
 * delay.
 */
export interface SpreekAfgerondGegevens {
  providerCallId: string;
  /** client_state zoals meegegeven op het BIJBEHORENDE speak-commando — draagt hier WELKE vervolgstap (opname starten/hervatten, voor welke poging) hoort te volgen. Null bij een speak zonder client_state (bv. het gewone afscheidsbericht) — die gevallen worden door gesprek.ts se verwerkSpreekAfgerond stil genegeerd. */
  clientState: string | null;
}

/**
 * Providerneutrale spreekinstructies — de webhookroutes/call-state-logica
 * bouwen een lijst hiervan; de provideradapter vertaalt dat naar zijn eigen
 * call-control-formaat (bij Twilio: TwiML-XML). Bewust een gesloten, kleine
 * set (geen vrije TwiML-passthrough vanuit de kernlogica) — precies de
 * grens die spec §16 vraagt.
 */
export type VoiceInstructie =
  | {
      /**
       * Productie-regressieronde (2026-08-27, spec "nergens meer terminale
       * tekst afspelen waarna de call onmiddellijk wordt opgehangen") —
       * spreekt UITSLUITEND de tekst uit. Root cause van de live regressie:
       * een eerdere versie deed hier fire-and-forget speak GEVOLGD DOOR een
       * onmiddellijke hangup — exact dezelfde fout die de vorige ronde
       * (Blocker 2) al repareerde voor zeg_en_neem_op/zeg_en_hervat_opname,
       * maar toen niet op deze afsluitende tak toegepast. De daadwerkelijke
       * hangup volgt nu pas op het bijbehorende call.speak.ended (zie
       * "hangup_uitvoeren" hieronder + gesprek.ts se verwerkSpreekAfgerond)
       * — zelfde deterministische garantie als de opnamekant.
       */
      soort: "zeg_en_ophangen";
      tekst: string;
      /**
       * Waarom deze call wordt afgesloten — meegegeven in het speak-commando
       * se client_state ("hangup_na_spraak:<reden>"), zodat
       * verwerkSpreekAfgerond() na afloop weet dat er (uitsluitend) opgehangen
       * moet worden, en de reden herkenbaar in de Telnyx-call-state/logs
       * staat. Herbruikt waar van toepassing de bestaande OproepFoutcode-
       * waarden (oproep-state.ts) — geen los, tweede vocabulaire nodig.
       */
      reden: string;
    }
  | {
      soort: "zeg_en_kies_cijfers";
      tekst: string;
      actieUrl: string;
      maxCijfers: number;
      timeoutSeconden: number;
      /**
       * Root-cause-fix productie-incident (2026-08-27, spec-eis §6) —
       * optioneel: welke toetsen geldig zijn (Telnyx' valid_digits).
       * Ontbreekt (bestaande aanroepers, o.a. trainingkeuze): "0123456789",
       * ongewijzigd gedrag. De vervolgkeuze-prompt ná een automatische
       * stilte-stop (gesprek.ts se verwerkVervolgKeuze) geeft hier
       * VERVOLG_DOORGAAN_TOETS+VERVOLG_AFRONDEN_TOETS ('*'/'#') mee — die
       * horen niet bij een numerieke keuze.
       */
      geldigeCijfers?: string;
    }
  | {
      /**
       * Productieblocker-ronde (2026-08-26) — spreekt UITSLUITEND de tekst
       * uit. Start ZELF geen opname meer (dat deed een eerdere versie van
       * deze instructie wel, fire-and-forget, met het risico dat record_start
       * al begint terwijl de tekst nog speelt). Zodra Telnyx bevestigt dat de
       * tekst volledig is uitgesproken (call.speak.ended, zie
       * SpreekAfgerondGegevens hierboven), pakt gesprek.ts se
       * verwerkSpreekAfgerond() het via het meegegeven client_state weer op
       * en levert dan pas de "opname_starten"-instructie hieronder — dat IS
       * de deterministische garantie, geen timing-gok.
       */
      soort: "zeg_en_neem_op";
      tekst: string;
      actieUrl: string;
      statusCallbackUrl: string;
      /** '#' — direct stoppen en verwerken (spec §9). */
      stopToets: string;
      /** '*' — huidige opname afwijzen en opnieuw beginnen, ZELFDE gekozen training (spec §10). */
      herstartToets: string;
      /**
       * Het hoeveelste opnameattempt dit wordt (0 = de eerste opname, 1/2/...
       * na elke '*'-herstart) — meegegeven in het speak-commando se
       * client_state, zodat verwerkSpreekAfgerond() na afloop weet welke
       * opname te starten.
       */
      poging: number;
    }
  | {
      /**
       * De daadwerkelijke record_start + de parallelle opname_toets-gather
       * (spec §9/§10/§18) — uitsluitend uitgevoerd NADAT Telnyx bevestigde
       * dat de bijbehorende zeg_en_neem_op-tekst volledig is uitgesproken.
       */
      soort: "opname_starten";
      maxDuurSeconden: number;
      stilteTimeoutSeconden: number;
      stopToets: string;
      herstartToets: string;
      /**
       * Zelfde poging-nummer als de voorafgaande zeg_en_neem_op — de
       * adapter gebruikt dit voor zowel command_id (nooit onterecht
       * gededupliceerd door Telnyx' eigen "zelfde command_id"-regel, zie
       * telnyx-provider.ts se telnyxCommando) als client_state (om een
       * afgewezen poging later herkenbaar te NEGEREN) uniek per poging te
       * maken.
       */
      poging: number;
    }
  /**
   * Stopt een lopende opname zonder verder iets te zeggen — spec §9 (vóór
   * het afscheidsbericht) en spec §10 (vóór een '*'-herstart, zodat er nooit
   * twee opnames tegelijk lopen op dezelfde call). Bij Twilio bestaat dit
   * concept niet los van de opname-instructie zelf — daar dus een no-op,
   * zelfde patroon als stopOpname()/beantwoordOproep() hieronder.
   * `poging` = het attempt dat gestopt wordt (zelfde reden als hierboven:
   * command_id moet per '*'-herstart uniek blijven, anders dedupliceert
   * Telnyx' eigen "zelfde command_id"-regel elke volgende stop-poging weg).
   */
  | { soort: "stop_opname"; poging: number }
  | {
      /**
       * Productieblocker-ronde (2026-08-26, spec §11 "een 4e '*' mag # nooit
       * breken") — de herstartlimiet is bereikt: de HUIDIGE opname blijft
       * gewoon geldig/lopend, NOOIT gestopt. Pauzeert 'm eerst (zodat de
       * waarschuwing zelf nooit in het verslag terechtkomt, spec §9
       * dataminimalisatie), spreekt dan de tekst uit, en hervat pas NA
       * call.speak.ended (zie "opname_hervatten" hieronder) — wijzigt NOOIT
       * `poging`, want er start geen nieuwe opname.
       */
      soort: "zeg_en_hervat_opname";
      tekst: string;
      poging: number;
      /**
       * Puur een uniek getal (Math.random() over een groot bereik — GEEN
       * Date.now(): twee sequentiële keren op de limiet bleken in de
       * praktijk soms binnen dezelfde milliseconde te vallen, wat het
       * command_id opnieuw liet botsen) om het command_id van de
       * bijbehorende pauzeer/spreek/hervat/her-bewapen-reeks te
       * onderscheiden van een EERDERE keer dat de limiet al bereikt was
       * (dezelfde `poging` blijft immers ongewijzigd bij herhaalde '*'-
       * drukken op de limiet) — zonder dit zou Telnyx' eigen "zelfde
       * command_id"-deduplicatie de her-bewapening van de gather bij een
       * TWEEDE keer op de limiet ten onrechte overslaan, waardoor '#'
       * daarna alsnog niet meer opgevangen zou worden.
       */
      nonce: number;
    }
  | {
      /**
       * De daadwerkelijke record_resume + de parallelle opname_toets-gather
       * — uitsluitend uitgevoerd NADAT Telnyx bevestigde dat de
       * bijbehorende zeg_en_hervat_opname-tekst volledig is uitgesproken.
       * Raakt de opname zelf verder niet aan (geen nieuwe poging).
       */
      soort: "opname_hervatten";
      maxDuurSeconden: number;
      stopToets: string;
      herstartToets: string;
      poging: number;
      nonce: number;
    }
  | {
      /**
       * De daadwerkelijke hangup-commando — uitsluitend uitgevoerd NADAT
       * Telnyx bevestigde dat de bijbehorende zeg_en_ophangen-tekst volledig
       * is uitgesproken. Geen `nonce`, in tegenstelling tot
       * zeg_en_hervat_opname/opname_hervatten: elke zeg_en_ophangen-aanroeper
       * is per constructie terminaal (bereikt hooguit één keer per gesprek),
       * dus een deterministisch command_id (`${actie}:${callControlId}:hangup-
       * ${reden}`) volstaat — een dubbel afgeleverd call.speak.ended-event
       * (Telnyx' eigen webhook-redelivery) resulteert dan in HETZELFDE
       * command_id, en Telnyx' eigen "zelfde command_id"-deduplicatie
       * voorkomt vanzelf een tweede, overbodige hangup-aanroep.
       */
      soort: "hangup_uitvoeren";
      reden: string;
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
  /** Productieblocker-ronde (2026-08-26) — het call.speak.ended-event: dé deterministische bevestiging dat een eerder speak-commando volledig is afgespeeld. */
  ontleedSpreekAfgerond(vormVelden: Record<string, string>): SpreekAfgerondGegevens;
  /** Root-cause-fix productie-incident (2026-08-27, spec-eis §8) — het call.hangup-event. */
  ontleedHangup(vormVelden: Record<string, string>): HangupGegevens;

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
   * Providerauthenticatie geregeld door de adapter zelf (spec §9:
   * "provider-authenticated downloads") — geeft de ruwe audiobytes terug,
   * nooit een tussenliggende publieke URL.
   *
   * `fragmentSelectie` (root-cause-fix productie-incident 2026-08-27,
   * spec-eis §10) — optioneel: welke SPECIFIEKE opnameresource opgehaald
   * moet worden (Telnyx' eigen recording_started_at van dat fragment, zie
   * OpnameStatusGegevens hierboven) — nodig zodra een gesprek meerdere
   * fragmenten heeft (ná "verder inspreken"), anders zou een automatische
   * retry van een OUDER fragment per ongeluk het nieuwste/meest recente
   * fragment kunnen ophalen. Weggelaten (of geen match gevonden): valt terug
   * op de bestaande "meest recent gestarte opname"-heuristiek — ongewijzigd
   * gedrag voor het enkelvoudige-fragment-geval.
   */
  haalOpnameOp(ophaalReferentie: string, fragmentSelectie?: { recordingStartedAt: string | null }): Promise<ArrayBuffer>;

  /** Best-effort opruiming bij de provider zelf (spec §9: "audio verwijderen zodra transcriptie succesvol + concept veilig opgeslagen is") — MAG falen zonder de aanroeper te blokkeren; aanroepers loggen een mislukking, gooien 'm nooit door. */
  verwijderOpname(providerRecordingId: string): Promise<void>;
}
