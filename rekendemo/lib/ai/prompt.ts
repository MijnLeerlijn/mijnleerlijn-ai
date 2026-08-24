import { profielVoorEiland } from "@/lib/locales";
import { CLICHES_VERMIJDEN, NEDERLANDSE_CONTEXT_VERMIJDEN } from "@/lib/locales/gedeeld";
import type { LokaalProfiel } from "@/lib/locales/types";
import type { AantalOpgaven, OpgaveTypeId, WerkbladInstellingen } from "@/lib/werkblad";

export type Verdeling = { kaal: number; verhaal: number };

/**
 * Bij een combinatie is de verdeling ongeveer half om half; bij een oneven
 * aantal krijgt het verhaaltype de extra opgave.
 */
export function verdeling(type: OpgaveTypeId, aantal: AantalOpgaven): Verdeling {
  if (type === "kaal") return { kaal: aantal, verhaal: 0 };
  if (type === "verhaal") return { kaal: 0, verhaal: aantal };

  const kaal = Math.floor(aantal / 2);
  return { kaal, verhaal: aantal - kaal };
}

function lijst(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function taalinstructie(instellingen: WerkbladInstellingen, profiel: LokaalProfiel): string {
  if (instellingen.taal === "nederlands") {
    return [
      "Schrijf alle opgaven in helder, eenvoudig Nederlands voor basisschoolleerlingen.",
      `Nederlands als taal betekent NIET Nederlandse situaties: de context blijft ${profiel.eilandNaam}s.`,
      "Gebruik geen Papiamentse zinnen; losse lokale woorden voor eten of plaatsen mogen wel.",
    ].join("\n");
  }

  return [
    `Schrijf alle opgaven in ${profiel.taal.naam}.`,
    profiel.taal.schrijfwijze,
    "Schrijf eenvoudig en kindgericht.",
    "Geef geen Nederlandse vertaling tussen haakjes.",
  ].join("\n");
}

const DIDACTISCHE_REGELS = [
  "Het rekendoel is leidend: iedere opgave oefent dat doel.",
  "Voeg geen rekenvaardigheden toe die niet nodig zijn voor het doel.",
  "Houd de getallen passend bij het leerjaar en bij het doel.",
  "Gebruik geen ingewikkeld taalgebruik als dat niet nodig is.",
  "Een verhaalsom moet daadwerkelijk door rekenen opgelost worden.",
  "Vermijd informatie die niet nodig is om de opgave op te lossen.",
  "Zorg voor variatie in context: herhaal niet steeds hetzelfde verhaal met andere getallen.",
  "Gebruik geld alleen als dat bij het doel of de context past.",
  "Antwoorden moeten eenduidig zijn; er mag maar één goed antwoord mogelijk zijn.",
  "De leerling moet genoeg informatie hebben om de opgave op te lossen.",
  "Controleer iedere som zelf na: het antwoord moet rekenkundig kloppen.",
];

export function bouwSysteemPrompt(): string {
  return [
    "Je maakt rekenmateriaal voor leerkrachten in het basisonderwijs op Aruba en Curaçao.",
    "Je levert uitsluitend JSON volgens het meegegeven schema.",
    "",
    "Didactische regels:",
    lijst(DIDACTISCHE_REGELS),
    "",
    "Werk zorgvuldig: liever eenvoudige, kloppende opgaven dan originele opgaven die rekenkundig rammelen.",
  ].join("\n");
}

export function bouwGebruikersPrompt(instellingen: WerkbladInstellingen): string {
  const profiel = profielVoorEiland(instellingen.eiland);
  const aantallen = verdeling(instellingen.opgaveType, instellingen.aantalOpgaven);

  const delen: string[] = [
    "# Opdracht",
    `Maak een werkblad met precies ${instellingen.aantalOpgaven} opgaven voor leerjaar ${instellingen.leerjaar} op ${profiel.eilandNaam}.`,
    "",
    "# Rekendoel van de leerkracht",
    instellingen.rekendoel.trim(),
    "",
    "# Verdeling",
    `- kale sommen: ${aantallen.kaal}`,
    `- verhaalsommen: ${aantallen.verhaal}`,
    "Wissel de volgorde van kale sommen en verhaalsommen af; zet ze niet allemaal op een rij.",
    "",
    "# Taal",
    taalinstructie(instellingen, profiel),
    "",
    "# Geld en valuta",
    `De valuta op ${profiel.eilandNaam} is de ${profiel.valuta.naam} (${profiel.valuta.code}).`,
    `Schrijf geldbedragen als "${profiel.valuta.notatie}", bijvoorbeeld ${profiel.valuta.voorbeeld}.`,
    "Gebruik nooit euro's of eurotekens.",
    `Gebruik nooit de valuta van het andere eiland.`,
    "",
    "# Lokale context",
    "Kies situaties uit het dagelijks leven van kinderen op het eiland. Varieer over de categorieën hieronder.",
    `## Dagelijkse situaties\n${lijst(profiel.contexten.dagelijks)}`,
    `## Locaties\n${lijst(profiel.contexten.locaties)}`,
    `## Eten en producten\n${lijst(profiel.contexten.etenEnProducten)}`,
    `## Vervoer\n${lijst(profiel.contexten.vervoer)}`,
    `## Sport en vrije tijd\n${lijst(profiel.contexten.sportEnVrijeTijd)}`,
    `## Natuur en omgeving\n${lijst(profiel.contexten.natuurEnOmgeving)}`,
    `## Wonen\n${lijst(profiel.contexten.wonen)}`,
    `## School\n${lijst(profiel.contexten.school)}`,
    `## Voornamen die je kunt gebruiken\n${lijst(profiel.voornamen)}`,
    "",
    "# Niet gebruiken",
    "Nederlandse standaardcontext, tenzij het rekendoel daar letterlijk om vraagt:",
    lijst(NEDERLANDSE_CONTEXT_VERMIJDEN),
    "Ook niet gebruiken, omdat het geforceerd of stereotiep wordt:",
    lijst(CLICHES_VERMIJDEN),
    `Specifiek voor ${profiel.eilandNaam}:`,
    lijst(profiel.vermijden),
    "",
    "# Velden",
    `- eiland: "${instellingen.eiland}"`,
    `- leerjaar: ${instellingen.leerjaar}`,
    `- taal: de naam van de taal waarin je schrijft`,
    "- titel en doel: in dezelfde taal als de opgaven; doel is het rekendoel kindvriendelijk opgeschreven",
    '- id: "opgave-1", "opgave-2", ... in volgorde',
    "- vraag: de opgave zoals de leerling die leest; kale sommen eindigen op '=' zonder het antwoord",
    "- antwoord: alleen het antwoord, zonder uitleg",
    "- berekening: de kale som met uitkomst, bijvoorbeeld '3 x 6 = 18'",
    "- context: bij verhaalsommen één of twee woorden voor de gebruikte situatie (bijvoorbeeld 'markt'); null bij kale sommen",
    "- illustrationDescription: bij verhaalsommen een korte, feitelijke beschrijving van een eenvoudige educatieve tekening die bij de som past en de getallen uit de som laat zien; null bij kale sommen",
  ];

  const tekenwens = instellingen.tekenwens.trim();
  if (tekenwens.length > 0 && aantallen.verhaal > 0) {
    delen.push(
      "",
      "# Wens van de leerkracht voor de tekeningen",
      tekenwens,
      "Verwerk deze wens in illustrationDescription waar dat logisch past, zonder de som ingewikkelder te maken.",
    );
  }

  return delen.join("\n");
}

/** Extra instructie na een mislukte poging, zodat de AI gericht kan corrigeren. */
export function bouwCorrectiePrompt(fouten: string[]): string {
  return [
    "",
    "# Correctie",
    "Je vorige antwoord voldeed niet aan de eisen. Los deze punten op en houd de rest gelijk:",
    lijst(fouten),
  ].join("\n");
}
