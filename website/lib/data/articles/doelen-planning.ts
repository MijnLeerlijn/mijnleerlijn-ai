import { maakArtikel } from "@/lib/data/factory";

const categorie = "doelen-planning";

export const doelenPlanningArtikelen = [
  maakArtikel({
    slug: "doelenset-aanmaken",
    titel: "Doelenset aanmaken",
    categorie,
    laatstBijgewerkt: "2026-05-10",
    tags: ["doelenset", "doelenplanner"],
    secties: [
      {
        titel: "Een nieuwe doelenset starten",
        blokken: [
          "Een doelenset is een samenhangende reeks leerdoelen die je in één keer aan een groep of leerling koppelt. Je maakt een doelenset aan wanneer je een nieuw vak, thema of ontwikkelingsgebied wilt volgen.",
          { stap: "Ga naar Doelenplanner > Doelensets." },
          { stap: "Klik op 'Nieuwe doelenset'." },
          { stap: "Kies het niveau en de periode waarvoor de set geldt." },
          { stap: "Voeg de leerdoelen toe, los of per categorie." },
          { stap: "Sla de doelenset op." },
          {
            tip: "Gebruik een duidelijke naam met vak én periode, bijvoorbeeld 'Rekenen groep 5 — blok 2', zodat collega's de set snel herkennen.",
          },
        ],
      },
      {
        titel: "Een doelenset bewerken",
        blokken: [
          "Je kunt een bestaande doelenset op elk moment aanpassen. Wijzigingen gelden vanaf het moment van opslaan voor alle leerlingen die aan de set gekoppeld zijn.",
          { stap: "Open de doelenset via Doelenplanner > Doelensets." },
          { stap: "Klik op 'Bewerken', pas de doelen aan en sla op." },
          {
            waarschuwing:
              "Het verwijderen van een leerdoel uit een set kan bestaande voortgangsgegevens van leerlingen beïnvloeden. Overweeg een doel te archiveren in plaats van te verwijderen.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "doelenset-koppelen-aan-leerlingen",
    titel: "Doelenset koppelen aan leerlingen",
    categorie,
    laatstBijgewerkt: "2026-05-14",
    tags: ["doelenset", "koppelen", "groep"],
    secties: [
      {
        titel: "Een doelenset aan een groep koppelen",
        blokken: [
          "Met een doelenset koppel je in één keer een samenhangende reeks leerdoelen aan een hele groep. Dit is de snelste manier om te starten wanneer alle leerlingen in de groep hetzelfde uitgangsniveau hebben.",
          { stap: "Open de groep waar je de doelenset aan wilt koppelen." },
          { stap: "Kies in het groepsmenu voor 'Doelenset toevoegen'." },
          { stap: "Selecteer de gewenste doelenset uit de lijst en bevestig." },
          {
            waarschuwing:
              "Een doelenset koppelen aan een groep overschrijft geen bestaande individuele koppelingen — die blijven behouden naast de nieuwe groepskoppeling.",
          },
          {
            tip: "Wil je liever per leerling een andere doelenset? Gebruik dan de individuele koppeling in het leerlingprofiel in plaats van de groepskoppeling.",
          },
        ],
      },
      {
        titel: "De koppeling controleren",
        blokken: [
          "Na het koppelen zie je de nieuwe doelen direct terug in het doelenoverzicht van elke leerling in de groep. Controleer dit voordat je verdergaat.",
          { stap: "Ga naar het doelenoverzicht van de groep." },
          { stap: "Controleer of de doelen bij elke leerling zichtbaar zijn." },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "automatisch-doelen-koppelen-aan-leerlingen",
    titel: "Automatisch doelen koppelen aan leerlingen",
    categorie,
    laatstBijgewerkt: "2026-05-14",
    tags: ["automatisering", "doelenset", "nieuwe leerling"],
    secties: [
      {
        titel: "Waarom automatische koppeling handig is",
        blokken: [
          "Zonder automatische koppeling moet je bij elke nieuwe leerling in een groep opnieuw handmatig de juiste doelenset toevoegen. Met automatische koppeling gebeurt dit vanzelf, op basis van het niveau en de periode die je bij de doelenset hebt ingesteld.",
        ],
      },
      {
        titel: "Automatische koppeling instellen",
        blokken: [
          { stap: "Open de doelenset via Doelenplanner > Doelensets." },
          { stap: "Ga naar het tabblad 'Automatisering'." },
          { stap: "Zet 'Automatisch koppelen aan nieuwe leerlingen' aan." },
          { stap: "Bevestig de instelling." },
          {
            tip: "Automatische koppeling kan altijd per leerling handmatig worden aangepast — het is een startpunt, geen vaste regel.",
          },
          {
            waarschuwing:
              "Automatische koppeling werkt alleen voor leerlingen die na het inschakelen aan de groep worden toegevoegd, niet met terugwerkende kracht.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "handmatig-leerdoelen-toevoegen",
    titel: "Handmatig leerdoelen toevoegen aan leerlingen",
    categorie,
    laatstBijgewerkt: "2026-04-22",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Naast doelensets kun je losse leerdoelen handmatig aan een individuele leerling toevoegen. Ga naar het leerlingprofiel > Doelen > Doel toevoegen en kies het gewenste leerdoel.",
          {
            tip: "Gebruik dit voor leerlingen die een aangepast traject volgen, los van de groepsdoelenset.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "leerdoelen-tags-gebruiken",
    titel: "Leerdoelen taggen voor snel filteren",
    categorie,
    laatstBijgewerkt: "2026-03-01",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Met tags label je leerdoelen op thema, vak of vaardigheid. Zo filter je snel het doelenoverzicht, bijvoorbeeld op alle doelen die met 'begrijpend lezen' te maken hebben.",
          { stap: "Open een leerdoel en voeg bij 'Tags' een of meer labels toe." },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "doelenplanner-overzicht",
    titel: "De Doelenplanner: een overzicht",
    categorie,
    laatstBijgewerkt: "2026-02-14",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "De Doelenplanner is het onderdeel waar je doelensets aanmaakt, koppelt en beheert. Vanuit hier heb je ook toegang tot de automatische koppeling en de leerdoelen-tags.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "doelen-per-periode-plannen",
    titel: "Doelen plannen per periode",
    categorie,
    laatstBijgewerkt: "2026-03-25",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Koppel een doelenset aan een specifieke periode uit het hoofdprofiel, zodat de voortgang per periode inzichtelijk blijft. Dit sluit aan bij de periode-indeling die je bij het hoofdprofiel hebt ingesteld.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "doelenset-kopieren",
    titel: "Een doelenset kopiëren naar een andere groep",
    categorie,
    laatstBijgewerkt: "2026-01-30",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Wil je een bestaande doelenset ook voor een andere groep gebruiken? Kopieer de set via Doelenplanner > Doelensets > Kopiëren, in plaats van deze opnieuw op te bouwen.",
        ],
      },
    ],
  }),
] as const;
