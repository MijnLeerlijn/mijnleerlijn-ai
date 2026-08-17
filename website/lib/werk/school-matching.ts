// Mijn Werk Fase 2 (2026-08-17) — gedeelde schoolherkenning, geëxtraheerd uit
// lib/werk/quick-add-parser.ts (was daar `vindSchool`, ongewijzigd gedrag)
// zodat de nieuwe agenda-schoolmatching (lib/werk/voorbereiding.ts) dezelfde
// kern hergebruikt, zonder een tweede, losstaande implementatie van "komt
// deze schoolnaam voor in deze tekst" te laten ontstaan.
//
// TWEE functies met verschillende risicohouding, bewust niet één:
// - vindBesteSchoolMatch: "beste gok" (langste match wint) — geschikt voor
//   quick-add, waar de gebruiker het resultaat altijd nog bevestigt/aanpast
//   vóór opslaan (lage inzet, zie SalesDashboardPaneel.tsx se
//   bevestigingsstap).
// - matchSchoolBetrouwbaar: "match-of-niets" — geschikt voor agenda-events,
//   die ONGEVRAAGD schoolcontext aan een AI-prompt kunnen voeden (hogere
//   inzet, geen bevestigingsstap vooraf). Bij twijfel (2+ verschillende
//   scholen matchen — bv. "De Horizon" én "Montessorischool De Horizon"
//   komen allebei letterlijk voor) GEEN automatische koppeling: de
//   aanroeper toont dan "School koppelen" i.p.v. te gokken (opdrachtseis:
//   "geen verkeerde schoolcontext naar AI sturen").
//
// Geen fuzzy/edit-distance-matching — de opdracht noemt dat uitdrukkelijk als
// "eventueel" (optioneel), en fuzzy matching vergroot juist het risico op
// precies de foute koppeling die hierboven verboden is. Uitsluitend exacte,
// genormaliseerde (diakritischtekens/hoofdletterongevoelig) substring-match.
export interface SchoolOptie {
  id: number;
  schoolName: string;
}

const COMBINING_DIACRITICAL_MARKS = /[\u0300-\u036f]/g;

/** Kleine kaal-maak-stap: NFD-decompositie ("é" → "e" + U+0301) + strippen van de losse accenttekens + kleine letters. */
function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(COMBINING_DIACRITICAL_MARKS, "").toLowerCase();
}

/** Alle scholen wiens (genormaliseerde) naam als substring voorkomt — ondergrens van 3 tekens voorkomt dat een toevallige korte naam (bv. "IJ") matcht. */
function vindAlleSchoolKandidaten(tekst: string, scholen: SchoolOptie[]): SchoolOptie[] {
  const genormaliseerd = normaliseer(tekst);
  return scholen.filter((school) => {
    const naam = normaliseer(school.schoolName);
    return naam.length >= 3 && genormaliseerd.includes(naam);
  });
}

/** "Beste gok": bij meerdere matches wint de langste (meest specifieke) naam. Nooit null bij ≥1 kandidaat. */
export function vindBesteSchoolMatch(tekst: string, scholen: SchoolOptie[]): SchoolOptie | null {
  const kandidaten = vindAlleSchoolKandidaten(tekst, scholen);
  if (kandidaten.length === 0) return null;
  return kandidaten.reduce((beste, huidige) => (huidige.schoolName.length > beste.schoolName.length ? huidige : beste));
}

export interface SchoolMatchResultaat {
  /** Uitsluitend gezet bij precies één kandidaat — anders null, ook bij 2+ (twijfel). */
  school: SchoolOptie | null;
  /** Alle scholen wiens naam voorkwam — leeg bij geen match, 2+ bij twijfel. */
  kandidaten: SchoolOptie[];
}

/** "Match-of-niets": zie de moduletoelichting hierboven voor waarom dit een aparte, strengere functie is dan vindBesteSchoolMatch. */
export function matchSchoolBetrouwbaar(tekst: string, scholen: SchoolOptie[]): SchoolMatchResultaat {
  const kandidaten = vindAlleSchoolKandidaten(tekst, scholen);
  return { school: kandidaten.length === 1 ? kandidaten[0]! : null, kandidaten };
}
