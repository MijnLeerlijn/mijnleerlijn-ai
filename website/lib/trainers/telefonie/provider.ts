// Traineromgeving V1, Ronde 3.5 (2026-08-25) — telefonieprovider-abstractie
// (spec §16): "Kernlogica voor trainer/training/concept mag niet afhankelijk
// worden van Twilio-specifieke requestvelden." Alles hieronder is in
// generieke, providerneutrale termen — geen CallSid/From/Digits/TwiML/
// X-Twilio-Signature ergens buiten twilio-provider.ts. Een latere overstap
// (bv. naar Telnyx, zie het opleverrapport se provideradvies) is daardoor een
// nieuwe implementatie van DEZE interface, geen wijziging aan de
// webhookroutes/call-state-logica.

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

export interface TelefonieProvider {
  naam: string;

  /**
   * Cryptografische/signature-verificatie van een binnenkomende webhook
   * (spec §17) — MOET true teruggeven vóór er ook maar iets met de
   * request-inhoud gedaan wordt. Neemt de rauwe, ongeparste vormvelden aan
   * (nooit een al-vertrouwd geparst object) zodat de handtekening exact over
   * dezelfde bytes gaat als de provider ze berekende.
   */
  verifieerWebhookSignature(input: { url: string; signatureHeader: string | null; vormVelden: Record<string, string> }): boolean;

  ontleedInkomendeCall(vormVelden: Record<string, string>): InkomendeCallGegevens;
  ontleedGatherResultaat(vormVelden: Record<string, string>): GatherResultaat;
  ontleedOpnameStatus(vormVelden: Record<string, string>): OpnameStatusGegevens;

  /** Bouwt de call-control-respons (TwiML bij Twilio) — Content-Type is altijd text/xml. */
  bouwVoiceResponse(instructies: VoiceInstructie[]): string;

  /** Providerauthenticatie geregeld door de adapter zelf (spec §9: "provider-authenticated downloads") — geeft de ruwe audiobytes terug, nooit een tussenliggende publieke URL. */
  haalOpnameOp(ophaalReferentie: string): Promise<ArrayBuffer>;

  /** Best-effort opruiming bij de provider zelf (spec §9: "audio verwijderen zodra transcriptie succesvol + concept veilig opgeslagen is") — MAG falen zonder de aanroeper te blokkeren; aanroepers loggen een mislukking, gooien 'm nooit door. */
  verwijderOpname(providerRecordingId: string): Promise<void>;
}
