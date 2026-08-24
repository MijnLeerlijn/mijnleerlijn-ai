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

const MAX_TEKSTLENGTE = 600;

export type InstellingenParse =
  | { ok: true; instellingen: WerkbladInstellingen }
  | { ok: false; bericht: string };

/** Serverzijdige controle van de formulierinvoer voordat we de AI aanroepen. */
export function parseInstellingen(onbekend: unknown): InstellingenParse {
  if (typeof onbekend !== "object" || onbekend === null) {
    return { ok: false, bericht: "Geen geldige invoer ontvangen." };
  }

  const ruw = onbekend as Record<string, unknown>;

  const eiland = EILANDEN.find((optie) => optie.id === ruw.eiland)?.id;
  if (!eiland) return { ok: false, bericht: "Kies een geldig eiland." };

  const taal = talenVoorEiland(eiland).find((optie) => optie.id === ruw.taal)?.id;
  if (!taal) return { ok: false, bericht: "Kies een taal die bij het eiland hoort." };

  const rekendoel = typeof ruw.rekendoel === "string" ? ruw.rekendoel.trim() : "";
  if (rekendoel.length === 0) return { ok: false, bericht: "Vul een rekendoel in." };
  if (rekendoel.length > MAX_TEKSTLENGTE) {
    return { ok: false, bericht: "Het rekendoel is te lang." };
  }

  const leerjaar = LEERJAREN.find((optie) => optie.id === ruw.leerjaar)?.id;
  if (!leerjaar) return { ok: false, bericht: "Kies een geldig leerjaar." };

  const opgaveType = OPGAVE_TYPEN.find((optie) => optie.id === ruw.opgaveType)?.id;
  if (!opgaveType) return { ok: false, bericht: "Kies een geldig type opgaven." };

  const aantalOpgaven = AANTALLEN_OPGAVEN.find((optie) => optie === ruw.aantalOpgaven);
  if (!aantalOpgaven) return { ok: false, bericht: "Kies een geldig aantal opgaven." };

  const tekenwens = typeof ruw.tekenwens === "string" ? ruw.tekenwens.trim() : "";
  if (tekenwens.length > MAX_TEKSTLENGTE) {
    return { ok: false, bericht: "De tekenwens is te lang." };
  }

  return {
    ok: true,
    instellingen: {
      eiland,
      taal,
      rekendoel,
      leerjaar,
      opgaveType,
      aantalOpgaven,
      tekenwens,
      antwoordenblad: ruw.antwoordenblad === true,
    },
  };
}
