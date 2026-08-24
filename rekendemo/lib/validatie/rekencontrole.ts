import type { Opgave } from "@/lib/resultaat";

export type RekenStatus = "correct" | "fout" | "niet_controleerbaar";

export type Rekencontrole = {
  status: RekenStatus;
  /** Foutteksten zonder opgavenummer; de validatieregel nummert ze. */
  meldingen: string[];
  /** De uitkomst die wij zelf berekend hebben, als dat lukte. */
  uitkomst: number | null;
  /** Of het veld `antwoord` ook echt vergeleken kon worden. */
  antwoordGecontroleerd: boolean;
  /** Reden waarom er niet gecontroleerd kon worden (alleen ter uitleg). */
  reden: string | null;
};

type Operator = "+" | "-" | "×" | "÷";

const OPERATOREN: Record<string, Operator> = {
  "+": "+",
  "-": "-",
  "−": "-",
  "–": "-",
  "×": "×",
  x: "×",
  X: "×",
  "*": "×",
  "·": "×",
  "÷": "÷",
  "/": "÷",
  ":": "÷",
};

const GETAL = String.raw`\d+(?:[.,]\d+)?`;
const BEREKENING_PATROON = new RegExp(
  String.raw`^\s*(${GETAL})\s*([+\-−–×xX*·÷/:])\s*(${GETAL})\s*=\s*(${GETAL})\s*$`,
);

/** Eén los getal in een verder vrije tekst, bijvoorbeeld "Afl. 12,50". */
const LOS_GETAL_PATROON = new RegExp(GETAL, "g");

/**
 * Zet "12,5" of "12.5" om naar een getal. Geeft null bij vormen die we niet
 * zeker kunnen lezen, zoals "1.500" (duizendtal of decimaal?) of "1.2.3".
 */
export function leesGetal(tekst: string): number | null {
  const geknipt = tekst.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(geknipt)) return null;

  const scheidingsteken = geknipt.match(/[.,]/);
  if (scheidingsteken) {
    const decimalen = geknipt.split(/[.,]/)[1] ?? "";
    // Precies drie cijfers achter een punt of komma is te vaak een duizendtal.
    if (decimalen.length === 3) return null;
  }

  const genormaliseerd = geknipt.replace(",", ".");
  const waarde = Number(genormaliseerd);
  return Number.isFinite(waarde) ? waarde : null;
}

export type GeleZenBerekening = {
  links: number;
  operator: Operator;
  rechts: number;
  opgegeven: number;
  uitkomst: number;
};

/** Leest een eenvoudige berekening als "6 × 4 = 24"; null als dat niet veilig kan. */
export function leesBerekening(tekst: string): GeleZenBerekening | null {
  const treffer = BEREKENING_PATROON.exec(tekst);
  if (!treffer) return null;

  const links = leesGetal(treffer[1]);
  const rechts = leesGetal(treffer[3]);
  const opgegeven = leesGetal(treffer[4]);
  const operator = OPERATOREN[treffer[2]];

  if (links === null || rechts === null || opgegeven === null || !operator) return null;
  if (operator === "÷" && rechts === 0) return null;

  const uitkomst =
    operator === "+"
      ? links + rechts
      : operator === "-"
        ? links - rechts
        : operator === "×"
          ? links * rechts
          : links / rechts;

  return { links, operator, rechts, opgegeven, uitkomst };
}

/** Aantal decimalen in de opgeschreven waarde, voor de afrondingsmarge. */
function decimalen(tekst: string): number {
  return tekst.split(/[.,]/)[1]?.length ?? 0;
}

const EXACTE_MARGE = 1e-9;

function isGelijk(a: number, b: number): boolean {
  return Math.abs(a - b) < EXACTE_MARGE;
}

/**
 * Haalt precies één getal uit een antwoord als dat ondubbelzinnig kan:
 * "24", "Afl. 24", "Cg 24" en "24 mango's" wel, "18 of 19" niet.
 */
export function leesAntwoordGetal(antwoord: string): number | null {
  const treffers = antwoord.match(LOS_GETAL_PATROON);
  if (!treffers || treffers.length !== 1) return null;
  return leesGetal(treffers[0]);
}

const NIET_CONTROLEERBAAR = (reden: string): Rekencontrole => ({
  status: "niet_controleerbaar",
  meldingen: [],
  uitkomst: null,
  antwoordGecontroleerd: false,
  reden,
});

/**
 * Controleert de berekening van één opgave en, waar dat ondubbelzinnig kan, ook
 * het antwoord. Bij twijfel keuren we niets af: dan is het resultaat
 * 'niet_controleerbaar'.
 */
export function controleerOpgave(
  opgave: Pick<Opgave, "berekening" | "antwoord">,
): Rekencontrole {
  const berekening = opgave.berekening?.trim();
  if (!berekening) return NIET_CONTROLEERBAAR("geen berekening aanwezig");

  const gelezen = leesBerekening(berekening);
  if (!gelezen) return NIET_CONTROLEERBAAR("berekening niet herkend als eenvoudige som");

  if (!isGelijk(gelezen.uitkomst, gelezen.opgegeven)) {
    // Een deling als "10 ÷ 3 = 3,33" is afgerond, niet fout.
    const marge = 0.5 * Math.pow(10, -decimalen(String(gelezen.opgegeven)));
    const isAfronding =
      gelezen.operator === "÷" && Math.abs(gelezen.uitkomst - gelezen.opgegeven) <= marge;

    if (isAfronding) return NIET_CONTROLEERBAAR("uitkomst lijkt afgerond");

    return {
      status: "fout",
      meldingen: [`bevat een onjuiste berekening: ${berekening}.`],
      uitkomst: gelezen.uitkomst,
      antwoordGecontroleerd: false,
      reden: null,
    };
  }

  const antwoordGetal = leesAntwoordGetal(opgave.antwoord);

  if (antwoordGetal === null) {
    return {
      status: "correct",
      meldingen: [],
      uitkomst: gelezen.uitkomst,
      antwoordGecontroleerd: false,
      reden: "antwoord bevat geen ondubbelzinnig getal",
    };
  }

  if (!isGelijk(antwoordGetal, gelezen.uitkomst)) {
    return {
      status: "fout",
      meldingen: [
        `heeft antwoord "${opgave.antwoord}" terwijl de berekening ${berekening} uitkomt op ${gelezen.uitkomst}.`,
      ],
      uitkomst: gelezen.uitkomst,
      antwoordGecontroleerd: true,
      reden: null,
    };
  }

  return {
    status: "correct",
    meldingen: [],
    uitkomst: gelezen.uitkomst,
    antwoordGecontroleerd: true,
    reden: null,
  };
}

export const REKENSTATUS_LABEL: Record<RekenStatus, string> = {
  correct: "gecontroleerd en correct",
  fout: "gecontroleerd en fout",
  niet_controleerbaar: "niet automatisch controleerbaar",
};
