import { bronnen, type Bron } from "./sources";

export interface PopulaireVraag {
  vraag: string;
  antwoord: string;
  bronnen: Bron[];
  /** Bij een ambigue vraag: "Bedoelde je ook…"-suggesties. */
  suggesties?: string[];
}

function bron(artikelSlug: string, sectie: string): Bron {
  const gevonden = bronnen.find((b) => b.artikelSlug === artikelSlug && b.sectie === sectie);
  if (!gevonden) throw new Error(`Bron niet gevonden: ${artikelSlug} — ${sectie}`);
  return gevonden;
}

// 8 populaire vragen met kant-en-klaar, redactioneel geschreven antwoord —
// dit is de dataset die de zoeksimulatie (lib/search/simulate.ts) doorzoekt.
// Zie docs/HOMEPAGE-SPEC.md: "redactioneel gecureerd, niet automatisch
// getoond" en docs/AI-KNOWLEDGE-STRATEGY.md voor de vorm van een antwoord.
export const populaireVragen: PopulaireVraag[] = [
  {
    vraag: "Hoe maak ik een hoofdprofiel aan?",
    antwoord:
      "Log in als beheerder en ga naar Beheer > Hoofdprofiel > Nieuw hoofdprofiel aanmaken. Vul de schoolnaam, het onderwijstype en het huidige schooljaar in, stel de periode-indeling in en sla het profiel op.",
    bronnen: [bron("hoe-maak-je-een-hoofdprofiel-aan", "Een hoofdprofiel aanmaken")],
  },
  {
    vraag: "Hoe koppel ik een doelenset aan een groep?",
    antwoord:
      "Open de groep waar je de doelenset aan wilt koppelen, kies in het groepsmenu voor 'Doelenset toevoegen' en selecteer de gewenste set. De doelen worden direct zichtbaar voor alle leerlingen in de groep, tenzij je kiest voor een individuele koppeling per leerling.",
    bronnen: [bron("doelenset-koppelen-aan-leerlingen", "Een doelenset aan een groep koppelen")],
  },
  {
    vraag: "Hoe zorg ik dat nieuwe leerlingen automatisch de juiste doelen krijgen?",
    antwoord:
      "Stel automatische koppeling in bij de doelenset zelf: nieuwe leerlingen die aan de groep worden toegevoegd, krijgen dan direct dezelfde doelenset. Dit werkt op basis van het niveau en de periode die je bij de doelenset hebt ingesteld, en kan altijd per leerling handmatig worden aangepast.",
    bronnen: [
      bron("automatisch-doelen-koppelen-aan-leerlingen", "Automatische koppeling instellen"),
      bron("doelenset-koppelen-aan-leerlingen", "Een doelenset aan een groep koppelen"),
    ],
  },
  {
    vraag: "Hoe voeg ik een leerling toe aan een groep?",
    antwoord:
      "Open de groep en ga naar het tabblad 'Leerlingen'. Klik op 'Leerling toevoegen', vul de naam en geboortedatum in of zoek een bestaand leerlingprofiel op, en bevestig om de leerling aan de groep te koppelen.",
    bronnen: [bron("leerkrachten-en-leerlingen-toevoegen-aan-een-groep", "Een leerling toevoegen")],
  },
  {
    vraag: "Hoe genereer ik acties voor een leerling?",
    antwoord:
      "Open het doelenoverzicht van een groep of leerling en klik bij een doel met achterstand op 'Actie genereren'. Bekijk het voorstel, pas de tekst aan waar nodig en bevestig om de actie toe te voegen aan het actieoverzicht.",
    bronnen: [bron("acties-genereren", "Acties genereren")],
  },
  {
    vraag: "Wat is het verschil tussen een doelenset en een vaardighedenset?",
    antwoord:
      "Een doelenset bundelt vakgebonden leerdoelen die je in één keer aan een groep of leerling koppelt. Een vaardighedenset bundelt vakoverstijgende vaardigheden, zoals samenwerken of zelfstandigheid, die periodiek geobserveerd worden in plaats van afgevinkt.",
    bronnen: [
      bron("doelenset-aanmaken", "Een nieuwe doelenset starten"),
      bron("vaardighedenset-aanmaken", "Een vaardighedenset opbouwen"),
    ],
  },
  {
    vraag: "Hoe verwijder ik doelen bij een leerling of groep?",
    antwoord:
      "Ga naar het leerlingprofiel of het groepsoverzicht, open het doelenoverzicht en kies bij het betreffende doel voor 'Verwijderen'. Dit is niet terug te draaien, dus controleer eerst of het echt het juiste doel is.",
    bronnen: [bron("leerling-verwijderen-uit-groep", "Een doel verwijderen")],
    suggesties: [
      "Een document verwijderen uit een leerlingprofiel",
      "Een leerling uit een groep verwijderen",
    ],
  },
  {
    vraag: "Wie kan welke analyses inzien?",
    antwoord:
      "Leerkrachten zien standaard alleen analyses van hun eigen groepen. Intern begeleiders, kwaliteitscoördinatoren en schoolleiders kunnen groepsoverstijgend inzien. Rollen worden ingesteld via Beheer & Instellingen.",
    bronnen: [bron("admin-statussets-beheren", "Een statusset aanpassen")],
  },
];

export const voorbeeldvragen: string[] = populaireVragen.slice(0, 3).map((v) => v.vraag);

// Een vraag waarvoor bewust geen betrouwbaar antwoord bestaat — nooit een
// gegokt antwoord tonen, zie docs/HOMEPAGE-SPEC.md §Gebruiker vindt niets.
export const nietGevondenVoorbeeld = {
  vraag: "Kan ik een leerling tijdelijk pauzeren in de rapportage?",
  gerelateerd: ["Rapportage-instellingen", "Een individueel leerlingrapport samenstellen"],
};
