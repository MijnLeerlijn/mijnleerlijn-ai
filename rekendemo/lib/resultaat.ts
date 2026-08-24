import type { EilandId } from "@/lib/werkblad";

export type OpgaveType = "kaal" | "verhaal";

export type Opgave = {
  id: string;
  type: OpgaveType;
  vraag: string;
  antwoord: string;
  berekening: string | null;
  context: string | null;
  /**
   * Beschrijving van de gewenste tekening. Wordt in deze fase alleen
   * gegenereerd en getoond; het daadwerkelijke tekenen volgt in fase 3.
   */
  illustrationDescription: string | null;
};

export type WerkbladResultaat = {
  titel: string;
  doel: string;
  eiland: EilandId;
  taal: string;
  leerjaar: number;
  opgaven: Opgave[];
};
