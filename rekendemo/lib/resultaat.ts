import type { EilandId } from "@/lib/werkblad";

export type OpgaveType = "kaal" | "verhaal";

/**
 * Bepaalt of er een generatieve tekening gemaakt mag worden:
 * - context: de tekening ondersteunt het verhaal, exacte aantallen zijn niet nodig
 * - exact-count: de leerling moet dingen tellen in de tekening; die bouwen we
 *   later programmatisch op, want een beeldmodel telt niet betrouwbaar.
 */
export type IllustratieType = "context" | "exact-count";

export type Opgave = {
  id: string;
  type: OpgaveType;
  vraag: string;
  antwoord: string;
  berekening: string | null;
  context: string | null;
  /** Beschrijving van de gewenste tekening; basis voor de beeldprompt. */
  illustrationDescription: string | null;
  /** Alleen gevuld bij verhaalsommen. */
  illustrationType: IllustratieType | null;
};

export type WerkbladResultaat = {
  titel: string;
  doel: string;
  eiland: EilandId;
  taal: string;
  leerjaar: number;
  opgaven: Opgave[];
};
