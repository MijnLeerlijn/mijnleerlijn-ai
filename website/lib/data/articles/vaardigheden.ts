import { maakArtikel } from "@/lib/data/factory";

const categorie = "vaardigheden";

export const vaardighedenArtikelen = [
  maakArtikel({
    slug: "vaardighedenset-aanmaken",
    titel: "Vaardighedenset aanmaken",
    categorie,
    laatstBijgewerkt: "2026-04-11",
    tags: ["vaardigheden", "vaardighedenset"],
    secties: [
      {
        titel: "Wat een vaardighedenset is",
        blokken: [
          "Naast leerdoelen kun je in MijnLeerlijn ook vaardigheden volgen: sociale, motorische of executieve vaardigheden die niet één-op-één aan een vak gekoppeld zijn. Een vaardighedenset bundelt een reeks samenhangende vaardigheden, bijvoorbeeld rond samenwerken of zelfstandigheid.",
        ],
      },
      {
        titel: "Een vaardighedenset opbouwen",
        blokken: [
          { stap: "Ga naar Doelenplanner > Vaardigheden." },
          { stap: "Klik op 'Nieuwe vaardighedenset'." },
          { stap: "Geef de set een naam en kies het ontwikkelingsgebied." },
          {
            stap: "Voeg de afzonderlijke vaardigheden toe, met eventueel een korte omschrijving per vaardigheid.",
          },
          { stap: "Sla de set op." },
          {
            tip: "Houd vaardigheden compact en observeerbaar geformuleerd, bijvoorbeeld 'werkt een taak zelfstandig af' in plaats van een brede, moeilijk te beoordelen omschrijving.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "vaardigheden-koppelen-aan-leerlingen",
    titel: "Vaardigheden koppelen aan leerlingen",
    categorie,
    laatstBijgewerkt: "2026-04-15",
    tags: ["vaardigheden", "koppelen"],
    secties: [
      {
        titel: "Koppelen aan een groep of leerling",
        blokken: [
          { stap: "Open de groep of het leerlingprofiel." },
          { stap: "Ga naar het tabblad 'Vaardigheden'." },
          { stap: "Kies 'Vaardighedenset toevoegen' en selecteer de gewenste set." },
          {
            waarschuwing:
              "Vaardigheden worden, anders dan leerdoelen, niet automatisch aan nieuwe leerlingen in de groep gekoppeld — controleer dit bij elke nieuwe leerling apart.",
          },
        ],
      },
      {
        titel: "Voortgang bijhouden",
        blokken: [
          "Vaardigheden worden periodiek beoordeeld in plaats van als losse afvinkbare stap, zodat je ontwikkeling over tijd kunt volgen.",
          {
            stap: "Open de vaardigheid in het leerlingprofiel en voeg een observatie toe met datum en toelichting.",
          },
          {
            tip: "Korte, concrete observaties zijn later waardevoller bij een overdracht of oudergesprek dan een enkel cijfer.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "vaardigheden-versus-leerdoelen",
    titel: "Het verschil tussen vaardigheden en leerdoelen",
    categorie,
    laatstBijgewerkt: "2026-02-19",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Leerdoelen zijn vakgebonden en volgen meestal een vaste opbouw per periode. Vaardigheden zijn breder en vakoverstijgend, zoals samenwerken of doorzettingsvermogen, en worden periodiek geobserveerd in plaats van afgevinkt.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "vaardighedenoverzicht-groep",
    titel: "Het vaardighedenoverzicht van een groep bekijken",
    categorie,
    laatstBijgewerkt: "2026-03-08",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Ga naar de groep > tabblad 'Vaardigheden' voor een overzicht van alle gekoppelde vaardigheden en de laatste observaties per leerling.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "vaardigheid-observatie-toevoegen",
    titel: "Een observatie toevoegen bij een vaardigheid",
    categorie,
    laatstBijgewerkt: "2026-03-29",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Open de vaardigheid in het leerlingprofiel en kies 'Observatie toevoegen'. Vul de datum en een korte toelichting in en sla op.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "vaardighedenset-delen-met-collega",
    titel: "Een vaardighedenset delen met een collega",
    categorie,
    laatstBijgewerkt: "2026-01-26",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Vaardighedensets zijn standaard schoolbreed beschikbaar. Een collega hoeft de set dus niet apart gedeeld te krijgen, maar kan deze direct koppelen via Doelenplanner > Vaardigheden.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "vaardigheden-rapporteren",
    titel: "Vaardigheden meenemen in een rapport",
    categorie,
    laatstBijgewerkt: "2026-05-20",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Vaardigheden en hun observaties kunnen worden meegenomen in de rapportage-export. Zie de categorie Analyse & Rapportage voor de volledige uitleg over rapportages samenstellen.",
        ],
      },
    ],
  }),
] as const;
