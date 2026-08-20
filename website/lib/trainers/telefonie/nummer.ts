import { parsePhoneNumberWithError, ParseError } from "libphonenumber-js";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — telefoonnummernormalisatie
// (spec §2): "gebruik een bestaande bewezen telefoonnummerlibrary als dat
// veiliger is dan eigen parsing." libphonenumber-js is een actief
// onderhouden JS-port van Google's libphonenumber (dezelfde library die
// Android/Chrome gebruiken) — ruwe eigen regex-parsing van Nederlandse
// nummervarianten (06.../0031.../+31.../spaties/streepjes) is precies het
// soort randgevalrijke logica waar een bewezen library veiliger is dan zelf
// bouwen. `defaultCountry: "NL"` zorgt dat een kaal "06..."-nummer (geen
// landcode) correct als Nederlands wordt geïnterpreteerd — buitenlandse
// nummers die zelf al met "+" beginnen blijven gewoon werken (de
// library negeert defaultCountry zodra de invoer al een expliciete
// landcode/plusteken bevat).
//
// Retourneert ALTIJD hetzelfde E.164-formaat (bv. "+31612345678") als de
// invoer een geldig, herkenbaar telefoonnummer is — dit is de ENIGE vorm
// die ergens opgeslagen (trainer-accounts.mobielNummer) of vergeleken mag
// worden. Nooit fuzzy matchen op een andere representatie (spec §2: "geen
// fuzzy matching").
export function normaliseerNederlandsNummer(ruw: string): string | null {
  const getrimd = ruw.trim();
  if (!getrimd) return null;
  try {
    const geparsed = parsePhoneNumberWithError(getrimd, { defaultCountry: "NL" });
    if (!geparsed.isValid()) return null;
    return geparsed.number; // PhoneNumber#number is altijd de E.164-vorm.
  } catch (error) {
    // ParseError = herkenbaar "geen geldig nummer" (bv. te kort, ongeldige
    // tekens) — nooit een crash voor iets dat een trainer/beheerder gewoon
    // fout kan typen. Een onverwachte, ANDERE foutklasse gooien we door: dat
    // zou op een echte bug in de aanroep wijzen, geen gebruikersinvoerfout.
    if (error instanceof ParseError) return null;
    throw error;
  }
}

/** Puur voor weergave (bv. Profiel/admin) — geen normalisatie, geen vergelijking. */
export function isGeldigE164(waarde: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(waarde);
}
