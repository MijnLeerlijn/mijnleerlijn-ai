import { maakArtikel } from "@/lib/data/factory";

const categorie = "acties-downloads";

export const actiesDownloadsArtikelen = [
  maakArtikel({
    slug: "acties-genereren",
    titel: "Acties automatisch genereren vanuit doelen",
    categorie,
    laatstBijgewerkt: "2026-04-13",
    tags: ["acties", "doelenplanner"],
    secties: [
      {
        titel: "Wat gegenereerde acties zijn",
        blokken: [
          "MijnLeerlijn kan op basis van de status van een leerdoel automatisch een concrete actie voorstellen, bijvoorbeeld een extra oefenmoment wanneer een doel achterblijft. Dit bespaart tijd bij het opstellen van een aanpak per leerling.",
        ],
      },
      {
        titel: "Acties genereren",
        blokken: [
          { stap: "Open het doelenoverzicht van een groep of leerling." },
          { stap: "Klik bij een doel met achterstand op 'Actie genereren'." },
          { stap: "Bekijk het voorstel en pas de tekst aan waar nodig." },
          { stap: "Bevestig om de actie toe te voegen aan het actieoverzicht." },
          {
            tip: "Gebruik gegenereerde acties als startpunt, niet als eindresultaat — pas de toon en aanpak altijd aan op de specifieke leerling.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "actie-handmatig-toevoegen",
    titel: "Een actie handmatig toevoegen",
    categorie,
    laatstBijgewerkt: "2026-04-16",
    tags: ["acties"],
    secties: [
      {
        titel: "Een eigen actie opstellen",
        blokken: [
          { stap: "Ga naar het leerlingprofiel of het groepsoverzicht en open 'Acties'." },
          { stap: "Klik op 'Actie toevoegen'." },
          { stap: "Beschrijf de actie, koppel eventueel een leerdoel en stel een streefdatum in." },
          { stap: "Sla de actie op." },
          {
            waarschuwing:
              "Een actie zonder streefdatum blijft in het overzicht staan zonder herinnering — stel bij voorkeur altijd een datum in.",
          },
        ],
      },
      {
        titel: "Een actie afronden",
        blokken: [
          { stap: "Open de actie en klik op 'Afronden'." },
          { stap: "Voeg eventueel een korte toelichting toe over het resultaat." },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "acties-downloaden-en-exporteren",
    titel: "Acties downloaden en exporteren",
    categorie,
    laatstBijgewerkt: "2026-05-21",
    tags: ["acties", "export", "download"],
    secties: [
      {
        titel: "Een actieoverzicht downloaden",
        blokken: [
          { stap: "Ga naar Acties en filter op groep, leerling of periode." },
          { stap: "Klik op 'Downloaden' rechtsboven." },
          { stap: "Kies het gewenste bestandsformaat (pdf of Excel)." },
          { download: "voorbeeld-actieoverzicht.pdf", label: "Voorbeeld: actieoverzicht (pdf)" },
          {
            tip: "Gebruik de pdf-versie voor een overdracht en de Excel-versie wanneer je acties van meerdere groepen wilt combineren.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "feature-ondersteuning-overzicht",
    titel: "Welke functies worden ondersteund per abonnement?",
    categorie,
    laatstBijgewerkt: "2026-02-06",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Niet elke functie is in elk abonnement beschikbaar. Bekijk het overzicht van ondersteunde functies via Beheer > Abonnement, of neem contact op voor een actueel overzicht.",
          {
            contact: "Wil je weten welke functies bij jullie abonnement horen?",
            onderwerp: "Vraag over functie-ondersteuning",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "actie-koppelen-aan-meerdere-leerlingen",
    titel: "Eén actie koppelen aan meerdere leerlingen",
    categorie,
    laatstBijgewerkt: "2026-03-17",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Ga naar Acties > Actie toevoegen en selecteer bij 'Betrokken leerlingen' meerdere namen tegelijk om dezelfde actie voor een kleine groep leerlingen te registreren.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "acties-filteren-op-status",
    titel: "Acties filteren op status",
    categorie,
    laatstBijgewerkt: "2026-01-13",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Gebruik het statusfilter boven het actieoverzicht om te schakelen tussen 'openstaand', 'afgerond' en 'verlopen'.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "downloadgeschiedenis-bekijken",
    titel: "Eerdere downloads terugvinden",
    categorie,
    laatstBijgewerkt: "2026-06-22",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Ga naar Beheer > Downloads voor een overzicht van eerder gegenereerde exports, inclusief de datum waarop ze zijn gemaakt.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "acties-herinnering-instellen",
    titel: "Een herinnering instellen bij een actie",
    categorie,
    laatstBijgewerkt: "2026-04-27",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Open een actie met een streefdatum en zet 'Herinnering' aan om enkele dagen van tevoren een melding te ontvangen.",
        ],
      },
    ],
  }),
] as const;
