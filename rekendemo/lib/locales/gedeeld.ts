/**
 * Regels die voor alle eilanden gelden. Staan los van de eilandprofielen zodat
 * ze op één plek uitgebreid kunnen worden.
 */

/** Nederlandse standaardcontext die niet vanzelf gebruikt mag worden. */
export const NEDERLANDSE_CONTEXT_VERMIJDEN = [
  "euro's en eurotekens",
  "Nederlandse treinen en de NS",
  "Nederlandse supermarktketens (bijvoorbeeld Albert Heijn of Jumbo)",
  "grachten",
  "typisch Nederlandse rijtjeshuizen",
  "flats als vanzelfsprekende wooncontext",
  "sneeuw, ijs en schaatsen",
  "herfstbladeren als standaarddecor",
  "Nederlandse plaatsnamen (bijvoorbeeld Amsterdam of Utrecht)",
  "Nederlandse feestdagen (bijvoorbeeld Sinterklaas of Koningsdag)",
  "Nederlandse merken",
];

/** Toeristische clichés die de context geforceerd of stereotiep maken. */
export const CLICHES_VERMIJDEN = [
  "palmbomen als standaarddecor",
  "toeristische stranden in bijna elke opgave",
  "flamingo's",
  "carnaval als standaardthema",
  "cruiseschepen en toeristen",
];

/**
 * Termen die in de validatie als "duidelijk Nederlandse context" gelden. Alleen
 * toegestaan als de leerkracht ze zelf in het rekendoel gebruikt.
 */
export const VERBODEN_TERMEN = [
  "NS",
  "Albert Heijn",
  "Jumbo",
  "Amsterdam",
  "Rotterdam",
  "Utrecht",
  "Den Haag",
  "Sinterklaas",
  "Koningsdag",
  "euro",
  "euro's",
  "euros",
  "eurocent",
  "€",
];
