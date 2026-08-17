import { voegDagenToe } from "@/lib/sales/format-datum";

// Mijn Werk V1 (2026-08-17) — deterministische parser voor de taak-quick-add
// ("+ Wat wil je doen?", SalesDashboardPaneel.tsx). Puur, geen Payload-/
// AI-afhankelijkheid — zelfde "pure functie, client- en server-bruikbaar"-
// patroon als lib/sales/vandaag.ts/aandacht-nodig.ts.
//
// BEWUST GEEN AI-call: elk voorbeeld en testscenario uit de opdracht is
// volledig deterministisch parseerbaar (datum-/tijd-trefwoorden +
// schoolnaam-substring), en de opdracht vraagt zelf expliciet om onnodige
// LLM-calls te voorkomen. Bovendien heeft geen enkel ingelogd AI-endpoint in
// deze app vandaag rate limiting (zie het Mijn Werk-voorstel §K) — een
// nieuw, arbeidsintensief AI-pad hier zou dat gat vergroten in plaats van
// verkleinen. Vindt de parser geen datumtrefwoord, dan is datum: null — een
// taak zonder datum is een volwaardige, verwachte uitkomst (amendement 1 bij
// goedkeuring), geen foutgeval dat een fallback nodig heeft.
const WEEKDAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

export interface QuickAddSchoolOptie {
  id: number;
  schoolName: string;
}

export interface QuickAddVoorstel {
  titel: string;
  datum: string | null;
  tijd: string | null;
  schoolId: number | null;
  schoolName: string | null;
}

/** Kalenderdag van `doelDag` (0=zondag..6=zaterdag), eerstvolgende óók-vandaag. */
function weekdagDatum(vandaag: string, doelDag: number): string {
  const [jaar, maand, dag] = vandaag.split("-").map(Number) as [number, number, number];
  const huidigeDag = new Date(jaar, maand - 1, dag).getDay();
  const verschil = (doelDag - huidigeDag + 7) % 7;
  return voegDagenToe(vandaag, verschil);
}

interface Match {
  waarde: string;
  matchTekst: string;
}

function vindDatum(tekst: string, vandaag: string): Match | null {
  const lower = tekst.toLowerCase();

  // "overmorgen" vóór "morgen" checken — "morgen" is een substring ervan.
  if (lower.includes("overmorgen")) return { waarde: voegDagenToe(vandaag, 2), matchTekst: "overmorgen" };
  if (lower.includes("vandaag")) return { waarde: vandaag, matchTekst: "vandaag" };
  if (lower.includes("morgen")) return { waarde: voegDagenToe(vandaag, 1), matchTekst: "morgen" };

  for (let i = 0; i < WEEKDAGEN.length; i++) {
    const naam = WEEKDAGEN[i]!;
    if (lower.includes(naam)) return { waarde: weekdagDatum(vandaag, i), matchTekst: naam };
  }

  const overMatch = lower.match(/\bover (\d+|een) (dag|dagen|week|weken)\b/);
  if (overMatch) {
    const aantalRuw = overMatch[1]!;
    const aantal = aantalRuw === "een" ? 1 : parseInt(aantalRuw, 10);
    const dagen = overMatch[2]!.startsWith("week") ? aantal * 7 : aantal;
    return { waarde: voegDagenToe(vandaag, dagen), matchTekst: overMatch[0] };
  }

  // "24 augustus" / "24 augustus 2026"
  const dMaandMatch = lower.match(new RegExp(`\\b(\\d{1,2})\\s+(${MAANDEN.join("|")})(?:\\s+(\\d{4}))?\\b`));
  if (dMaandMatch) {
    const dag = parseInt(dMaandMatch[1]!, 10);
    const maandIndex = MAANDEN.indexOf(dMaandMatch[2]!);
    return { waarde: bepaalJaarEnFormatteer(vandaag, dag, maandIndex + 1, dMaandMatch[3]), matchTekst: dMaandMatch[0] };
  }

  // "24-08" / "24/08" / "24-08-2026"
  const cijferMatch = lower.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{4}))?\b/);
  if (cijferMatch) {
    const dag = parseInt(cijferMatch[1]!, 10);
    const maand = parseInt(cijferMatch[2]!, 10);
    if (maand >= 1 && maand <= 12 && dag >= 1 && dag <= 31) {
      return { waarde: bepaalJaarEnFormatteer(vandaag, dag, maand, cijferMatch[3]), matchTekst: cijferMatch[0] };
    }
  }

  return null;
}

/** Zonder expliciet jaar: als de datum dit kalenderjaar al voorbij is, bedoel je waarschijnlijk volgend jaar. */
function bepaalJaarEnFormatteer(vandaag: string, dag: number, maand: number, jaarRuw: string | undefined): string {
  const huidigJaar = parseInt(vandaag.slice(0, 4), 10);
  let jaar = jaarRuw ? parseInt(jaarRuw, 10) : huidigJaar;
  let kandidaat = `${jaar}-${String(maand).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
  if (!jaarRuw && kandidaat < vandaag) {
    jaar += 1;
    kandidaat = `${jaar}-${String(maand).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
  }
  return kandidaat;
}

function vindTijd(tekst: string): Match | null {
  const lower = tekst.toLowerCase();

  const omHhMm = lower.match(/\bom\s+(\d{1,2})[:.uh](\d{2})\b/);
  if (omHhMm) return { waarde: `${omHhMm[1]!.padStart(2, "0")}:${omHhMm[2]}`, matchTekst: omHhMm[0] };

  const hhMm = lower.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hhMm) return { waarde: `${hhMm[1]!.padStart(2, "0")}:${hhMm[2]}`, matchTekst: hhMm[0] };

  const omHUur = lower.match(/\bom\s+(\d{1,2})\s*uur\b/);
  if (omHUur) return { waarde: `${omHUur[1]!.padStart(2, "0")}:00`, matchTekst: omHUur[0] };

  const hUur = lower.match(/\b(\d{1,2})\s*uur\b/);
  if (hUur) return { waarde: `${hUur[1]!.padStart(2, "0")}:00`, matchTekst: hUur[0] };

  return null;
}

function verwijderMatch(tekst: string, matchTekst: string): string {
  const idx = tekst.toLowerCase().indexOf(matchTekst.toLowerCase());
  if (idx === -1) return tekst;
  return (tekst.slice(0, idx) + tekst.slice(idx + matchTekst.length)).replace(/\s{2,}/g, " ").trim();
}

/** Langste matchende schoolnaam als substring — voorkomt dat een korte, toevallige naam (bv. "IJ") onterecht matcht. */
function vindSchool(tekst: string, scholen: QuickAddSchoolOptie[]): QuickAddSchoolOptie | null {
  const lower = tekst.toLowerCase();
  let beste: QuickAddSchoolOptie | null = null;
  for (const school of scholen) {
    const naam = school.schoolName.toLowerCase();
    if (naam.length >= 3 && lower.includes(naam) && (!beste || school.schoolName.length > beste.schoolName.length)) {
      beste = school;
    }
  }
  return beste;
}

function kapitaliseer(tekst: string): string {
  return tekst.length === 0 ? tekst : tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

/**
 * Herkent uit vrije tekst een datum (optioneel), tijd (optioneel) en school
 * (optioneel, "indien betrouwbaar herkend" — puur substring-match, geen gok).
 * Nooit een lege titel: als er na het strippen van de datum-/tijdfrase niets
 * overblijft (de invoer WAS uitsluitend zo'n frase, bv. enkel "vrijdag"),
 * blijft de oorspronkelijke tekst de titel — nooit een AI-call om een titel
 * te verzinnen voor een gedegenereerde invoer.
 */
export function parseQuickAdd(ruweTekst: string, vandaag: string, scholen: QuickAddSchoolOptie[] = []): QuickAddVoorstel {
  const invoer = ruweTekst.trim();
  const datumMatch = vindDatum(invoer, vandaag);
  const tijdMatch = vindTijd(invoer);

  let restTekst = invoer;
  if (datumMatch) restTekst = verwijderMatch(restTekst, datumMatch.matchTekst);
  if (tijdMatch) restTekst = verwijderMatch(restTekst, tijdMatch.matchTekst);
  restTekst = restTekst.trim();

  const school = vindSchool(invoer, scholen);

  return {
    titel: kapitaliseer(restTekst.length > 0 ? restTekst : invoer),
    datum: datumMatch?.waarde ?? null,
    tijd: tijdMatch?.waarde ?? null,
    schoolId: school?.id ?? null,
    schoolName: school?.schoolName ?? null,
  };
}
