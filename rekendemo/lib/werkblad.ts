export type EilandId = "aruba" | "curacao";
export type TaalId = "papiamento" | "papiamentu" | "nederlands";
export type LeerjaarId = 1 | 2 | 3 | 4 | 5 | 6;
export type OpgaveTypeId = "kaal" | "verhaal" | "combinatie";
export type AantalOpgaven = 5 | 8 | 10 | 12 | 15;

type Optie<T> = {
  id: T;
  label: string;
  beschrijving?: string;
};

export const EILANDEN: Optie<EilandId>[] = [
  { id: "aruba", label: "Aruba", beschrijving: "Papiamento" },
  { id: "curacao", label: "Curaçao", beschrijving: "Papiamentu" },
];

/**
 * De schrijfwijze van het Papiaments verschilt per eiland (Aruba: Papiamento,
 * Curaçao: Papiamentu). Daarom zijn de taalopties eilandafhankelijk.
 */
const TALEN_PER_EILAND: Record<EilandId, Optie<TaalId>[]> = {
  aruba: [
    { id: "papiamento", label: "Papiamento" },
    { id: "nederlands", label: "Nederlands" },
  ],
  curacao: [
    { id: "papiamentu", label: "Papiamentu" },
    { id: "nederlands", label: "Nederlands" },
  ],
};

export function talenVoorEiland(eiland: EilandId): Optie<TaalId>[] {
  return TALEN_PER_EILAND[eiland];
}

export function standaardTaalVoorEiland(eiland: EilandId): TaalId {
  return TALEN_PER_EILAND[eiland][0].id;
}

export function taalLabel(eiland: EilandId, taal: TaalId): string {
  return talenVoorEiland(eiland).find((optie) => optie.id === taal)?.label ?? "";
}

export const LEERJAREN: Optie<LeerjaarId>[] = [1, 2, 3, 4, 5, 6].map((jaar) => ({
  id: jaar as LeerjaarId,
  label: `Leerjaar ${jaar}`,
}));

export const OPGAVE_TYPEN: Optie<OpgaveTypeId>[] = [
  { id: "kaal", label: "Kale sommen", beschrijving: "Alleen rekenopgaven" },
  { id: "verhaal", label: "Verhaalsommen", beschrijving: "Met context en tekening" },
  { id: "combinatie", label: "Combinatie", beschrijving: "Kale sommen én verhaalsommen" },
];

export const AANTALLEN_OPGAVEN: AantalOpgaven[] = [5, 8, 10, 12, 15];

export type WerkbladInstellingen = {
  eiland: EilandId;
  taal: TaalId;
  rekendoel: string;
  leerjaar: LeerjaarId;
  opgaveType: OpgaveTypeId;
  aantalOpgaven: AantalOpgaven;
  tekenwens: string;
  antwoordenblad: boolean;
};

export const STANDAARD_INSTELLINGEN: WerkbladInstellingen = {
  eiland: "aruba",
  taal: standaardTaalVoorEiland("aruba"),
  rekendoel: "",
  leerjaar: 3,
  opgaveType: "combinatie",
  aantalOpgaven: 8,
  tekenwens: "",
  antwoordenblad: true,
};

export function eilandLabel(eiland: EilandId): string {
  return EILANDEN.find((optie) => optie.id === eiland)?.label ?? "";
}

export function leerjaarLabel(leerjaar: LeerjaarId): string {
  return `Leerjaar ${leerjaar}`;
}

export function opgaveTypeLabel(type: OpgaveTypeId): string {
  return OPGAVE_TYPEN.find((optie) => optie.id === type)?.label ?? "";
}

/** Verhaalsommen krijgen automatisch een educatieve tekening. */
export function bevatTekeningen(type: OpgaveTypeId): boolean {
  return type === "verhaal" || type === "combinatie";
}
