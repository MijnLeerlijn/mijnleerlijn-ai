import { maakArtikel } from "@/lib/data/factory";

const categorie = "notities";

export const notitiesArtikelen = [
  maakArtikel({
    slug: "notities-binnen-mijnleerlijn",
    titel: "Notities binnen MijnLeerlijn",
    categorie,
    laatstBijgewerkt: "2026-03-20",
    tags: ["notities", "leerlingprofiel"],
    secties: [
      {
        titel: "Waarvoor je notities gebruikt",
        blokken: [
          "Notities zijn bedoeld voor korte, losse observaties die niet direct bij een doel of vaardigheid horen: een gesprek met een ouder, een bijzonderheid tijdens de les, of een herinnering voor jezelf. Ze vormen samen een tijdlijn per leerling.",
        ],
      },
      {
        titel: "Een notitie toevoegen",
        blokken: [
          { stap: "Open het leerlingprofiel en ga naar het tabblad 'Notities'." },
          { stap: "Klik op 'Nieuwe notitie'." },
          { stap: "Schrijf de notitie en voeg eventueel een afbeelding toe via het paperclip-icoon." },
          { stap: "Kies of de notitie alleen voor jezelf zichtbaar is of voor het hele team." },
          { stap: "Sla de notitie op." },
          {
            tip: "Gebruik korte, feitelijke notities. Beschrijf wat je waarneemt in plaats van een interpretatie, zodat de notitie later voor iedereen bruikbaar blijft.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "notitie-zichtbaarheid-instellen",
    titel: "Zichtbaarheid van een notitie instellen",
    categorie,
    laatstBijgewerkt: "2026-03-24",
    tags: ["notities", "zichtbaarheid", "privacy"],
    secties: [
      {
        titel: "Persoonlijk of gedeeld",
        blokken: [
          "Elke notitie heeft een zichtbaarheid: persoonlijk (alleen voor jou) of gedeeld (voor alle leerkrachten van de groep). Dit onderscheid helpt om werkaantekeningen te scheiden van informatie die het hele team nodig heeft.",
          { stap: "Open de notitie en klik op het zichtbaarheids-icoon." },
          { stap: "Kies 'Persoonlijk' of 'Gedeeld met team'." },
          {
            waarschuwing:
              "Persoonlijke notities zijn niet zichtbaar voor collega's, ook niet voor een intern begeleider — gebruik 'Gedeeld met team' voor informatie die relevant is bij een overdracht.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "notitie-bewerken-of-verwijderen",
    titel: "Een notitie bewerken of verwijderen",
    categorie,
    laatstBijgewerkt: "2026-01-29",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Open de notitie in het leerlingprofiel en kies 'Bewerken' of 'Verwijderen'. Alleen de maker van een persoonlijke notitie kan deze aanpassen; gedeelde notities kunnen door elk teamlid bewerkt worden.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "notities-filteren-op-datum",
    titel: "Notities filteren op datum of periode",
    categorie,
    laatstBijgewerkt: "2026-02-16",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Gebruik het datumfilter boven de notitietijdlijn om notities uit een specifieke periode terug te vinden, bijvoorbeeld ter voorbereiding op een oudergesprek.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "notitie-koppelen-aan-doel",
    titel: "Een notitie koppelen aan een leerdoel",
    categorie,
    laatstBijgewerkt: "2026-04-24",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Bij het aanmaken van een notitie kun je onder 'Koppelen aan' een leerdoel selecteren. De notitie verschijnt dan ook in de context van dat doel in het doelenoverzicht.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "notities-in-rapportage-meenemen",
    titel: "Notities meenemen in een rapportage",
    categorie,
    laatstBijgewerkt: "2026-05-30",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Bij het exporteren van een rapportage kun je aangeven of gedeelde notities worden meegenomen. Persoonlijke notities worden nooit in een export opgenomen. Zie de categorie Analyse & Rapportage voor de volledige exportstappen.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "notitie-toevoegen-vanaf-mobiel",
    titel: "Een notitie toevoegen vanaf je telefoon",
    categorie,
    laatstBijgewerkt: "2026-06-09",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "MijnLeerlijn werkt ook in de mobiele browser. Open het leerlingprofiel op je telefoon en gebruik dezelfde 'Nieuwe notitie'-knop als op desktop.",
        ],
      },
    ],
  }),
] as const;
