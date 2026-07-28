// AI Verbetercentrum — pure, testbare vertaling van de actieve filters naar
// Payload REST `where`-queryparameters (bracket-notatie, zoals Payload's
// eigen REST-API die verwacht — zie https://payloadcms.com/docs/queries/overview).
//
// `intentieType` heeft bewust maar één actieve waarde tegelijk (geen
// onafhankelijke checkbox naast "verduidelijkingsvraag gesteld"): allebei
// tegelijk aanvinken zou een `AND`-query opleveren die nooit iets matcht
// (hetzelfde veld kan niet twee waarden tegelijk hebben). Intern dus één
// select-achtige `intentieFilter`, niet twee losse booleans.

export type IntentieFilter = "geen-match" | "onduidelijk" | null;

export interface VerbetercentrumFilterState {
  intentieFilter: IntentieFilter;
  negatieveFeedback: boolean;
  contactformulierGebruikt: boolean;
  lageConfidence: boolean;
  lageConfidenceGrens: number;
  geenHandleidingGevonden: boolean;
  nogNietBeoordeeld: boolean;
  /** Kennisbasis MijnLeerlijn — Fase 4: alleen gesprekken met een door de AI gerapporteerde tegenstrijdigheid tussen de centrale kennisbasis en een andere bron/de vastgestelde term. */
  tegenstrijdigheidGedetecteerd: boolean;
}

// "Nog geen kennisbasis-item" (intentieType: geen-match) staat standaard
// actief — dit is het primaire werkscherm van het Verbetercentrum.
export const STANDAARD_FILTERS: VerbetercentrumFilterState = {
  intentieFilter: "geen-match",
  negatieveFeedback: false,
  contactformulierGebruikt: false,
  lageConfidence: false,
  lageConfidenceGrens: 50,
  geenHandleidingGevonden: false,
  nogNietBeoordeeld: false,
  tegenstrijdigheidGedetecteerd: false,
};

/** Geeft URLSearchParams-entries terug voor de actieve filters — leeg als er geen enkel filter actief is. */
export function buildFilterWhereParams(filters: VerbetercentrumFilterState): [string, string][] {
  const params: [string, string][] = [];
  let index = 0;
  const voegClauseToe = (veld: string, operator: string, waarde: string) => {
    params.push([`where[and][${index}][${veld}][${operator}]`, waarde]);
    index += 1;
  };

  if (filters.intentieFilter) voegClauseToe("intentieType", "equals", filters.intentieFilter);
  if (filters.negatieveFeedback) voegClauseToe("feedbackRating", "equals", "niet_nuttig");
  if (filters.contactformulierGebruikt) voegClauseToe("contactFormSubmitted", "equals", "true");
  if (filters.lageConfidence) voegClauseToe("confidence", "less_than", String(filters.lageConfidenceGrens));
  if (filters.geenHandleidingGevonden) voegClauseToe("geenHandleidingGevonden", "equals", "true");
  if (filters.nogNietBeoordeeld) voegClauseToe("verbeterStatus", "equals", "nieuw");
  if (filters.tegenstrijdigheidGedetecteerd) voegClauseToe("tegenstrijdigheid", "exists", "true");

  return params;
}
