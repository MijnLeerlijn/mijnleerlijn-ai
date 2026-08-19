// Traineromgeving V1, Ronde 2 afronding (2026-08-19) — pure, testbare
// sorteerlogica voor de trainingslijst op schooldetail. Los van de
// bestaande bucket-indeling (training-weergave.ts se groepeerOpWeergaveStatus)
// — sorteert uitsluitend BINNEN een al bepaalde categorie, verandert nooit
// welke training in welke sectie hoort. Zelfde vorm/precedent als
// lib/sales/scholen-sortering.ts.
//
// { sensitivity: "accent" } is bewust geen kale localeCompare(...,"nl"):
// zonder die optie telt hoofdletterverschil nog altijd mee als (zwakke)
// tiebreaker, waardoor "Training" en "training" nooit als gelijk gezien
// worden en de datum als tweede criterium nooit aan bod komt — met
// sensitivity "accent" tellen alleen letter-/accentverschillen mee, nooit
// hoofdlettergebruik, dus twee namen die alleen in hoofdletters verschillen
// zijn ECHT gelijk en vallen door naar de datumvergelijking hieronder
// (opdrachtseis: "hoofdletters mogen de volgorde niet verstoren" +
// "binnen gelijke namen mag datum als tweede sorteercriterium").
//
// Nulls sorteren als "" (leeg eerst bij oplopend) — zelfde conventie als
// lib/sales/scholen-sortering.ts se vergelijkDatum.
export interface SorteerbareTraining {
  naam: string;
  datum: string | null;
}

export function sorteerTrainingenAlfabetisch<T extends SorteerbareTraining>(trainingen: T[]): T[] {
  return [...trainingen].sort((a, b) => {
    const naamVergelijk = a.naam.localeCompare(b.naam, "nl", { sensitivity: "accent" });
    if (naamVergelijk !== 0) return naamVergelijk;
    return (a.datum ?? "").localeCompare(b.datum ?? "");
  });
}
