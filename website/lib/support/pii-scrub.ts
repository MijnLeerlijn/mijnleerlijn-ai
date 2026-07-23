// Laatste veiligheidsnet tegen persoonsgegevens in AI-gegenereerde
// conceptteksten — de systeemprompt (lib/support/analyze.ts) instrueert het
// model al nadrukkelijk om nooit namen, schoolnamen, e-mailadressen of
// telefoonnummers over te nemen, maar taalmodel-instructies zijn geen harde
// garantie. E-mailadressen en telefoonnummers zijn mechanisch herkenbaar
// (regex); namen/schoolnamen zijn dat niet betrouwbaar — daarvoor blijft de
// promptinstructie + menselijke beoordeling (customerSpecificInformationFound)
// de enige waarborg.

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// NL-telefoonnummers: 06-12345678, 020-1234567, +31 6 12345678, met vrije
// spaties/streepjes — bewust ruim, liever een false positive weghalen dan
// een echt nummer missen.
const PHONE_PATTERN = /(?:\+31|0031|0)[\s-]?\(?0?\)?[\s-]?\d(?:[\s-]?\d){7,9}/g;

export function scrubPotentialPii(tekst: string): string {
  if (!tekst) return tekst;
  return tekst
    .replace(EMAIL_PATTERN, "[e-mailadres verwijderd]")
    .replace(PHONE_PATTERN, "[telefoonnummer verwijderd]");
}
