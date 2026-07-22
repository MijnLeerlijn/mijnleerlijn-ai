import { maakArtikel } from "@/lib/data/factory";

const categorie = "documenten-media";

export const documentenMediaArtikelen = [
  maakArtikel({
    slug: "document-toevoegen-aan-leerling",
    titel: "Voeg een document toe aan een leerling",
    categorie,
    laatstBijgewerkt: "2026-04-07",
    tags: ["document", "leerlingprofiel", "upload"],
    secties: [
      {
        titel: "Welke documenten je kunt toevoegen",
        blokken: [
          "In het leerlingprofiel kun je documenten bewaren die bij de ontwikkeling van de leerling horen: handelingsplannen, verslagen van externe onderzoeken, overdrachtsformulieren of correspondentie met ouders.",
        ],
      },
      {
        titel: "Een document uploaden",
        blokken: [
          { stap: "Open het leerlingprofiel en ga naar het tabblad 'Documenten'." },
          { stap: "Klik op 'Document toevoegen'." },
          { stap: "Selecteer het bestand op je apparaat (pdf, Word of afbeelding)." },
          {
            stap: "Geef het document een herkenbare titel en kies een categorie, bijvoorbeeld 'Handelingsplan' of 'Extern onderzoek'.",
          },
          { stap: "Sla het document op." },
          {
            waarschuwing:
              "Upload nooit documenten met gevoelige persoonsgegevens van andere leerlingen dan degene bij wie je het document toevoegt.",
          },
          {
            tip: "Gebruik een vaste naamgeving, bijvoorbeeld 'Handelingsplan - schooljaar - naam', zodat documenten later makkelijk terug te vinden zijn.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "documenten-organiseren-met-categorieen",
    titel: "Documenten organiseren met categorieën",
    categorie,
    laatstBijgewerkt: "2026-04-09",
    tags: ["document", "categorie"],
    secties: [
      {
        titel: "Waarom categorieën gebruiken",
        blokken: [
          "Bij een leerling met een langer dossier lopen documenten snel op. Categorieën houden het tabblad 'Documenten' overzichtelijk en maken het makkelijker om tijdens een overdracht snel het juiste document te vinden.",
        ],
      },
      {
        titel: "Een categorie toevoegen of aanpassen",
        blokken: [
          { stap: "Open een document in het leerlingprofiel." },
          { stap: "Klik op 'Categorie wijzigen'." },
          { stap: "Kies een bestaande categorie of maak een nieuwe aan." },
          {
            tip: "Spreek als team een vaste set categorieën af, zodat documenten van verschillende leerkrachten consistent geordend zijn.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "document-delen-met-collega",
    titel: "Een document delen met een collega",
    categorie,
    laatstBijgewerkt: "2026-02-11",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Documenten in het leerlingprofiel zijn zichtbaar voor alle leerkrachten die aan de groep van de leerling gekoppeld zijn. Een apart deelmechanisme is daarom niet nodig — koppel de collega eventueel aan de groep om toegang te geven.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "document-verwijderen",
    titel: "Een document verwijderen uit een leerlingprofiel",
    categorie,
    laatstBijgewerkt: "2026-01-19",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Open het document in het leerlingprofiel en kies 'Verwijderen'.",
          {
            waarschuwing:
              "Verwijderde documenten zijn niet terug te halen. Overweeg bij twijfel of het document niet beter gearchiveerd kan blijven.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "afbeeldingen-toevoegen-aan-notitie",
    titel: "Een afbeelding toevoegen aan een notitie",
    categorie,
    laatstBijgewerkt: "2026-03-15",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Bij het aanmaken van een notitie kun je via het paperclip-icoon een afbeelding toevoegen, bijvoorbeeld een foto van gemaakt werk. Zie de categorie Notities voor de volledige uitleg over notities.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "ondersteunde-bestandsformaten",
    titel: "Welke bestandsformaten worden ondersteund?",
    categorie,
    laatstBijgewerkt: "2026-02-02",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "MijnLeerlijn ondersteunt pdf, Word-documenten (.doc/.docx) en gangbare afbeeldingsformaten (.jpg, .png). Video's worden niet ondersteund als los document, maar kunnen wel als link worden toegevoegd.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "documenten-terugvinden-via-zoeken",
    titel: "Documenten terugvinden via de zoekfunctie",
    categorie,
    laatstBijgewerkt: "2026-03-21",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Gebruik de zoekfunctie binnen het tabblad 'Documenten' van een leerlingprofiel om te filteren op titel of categorie, handig bij een leerling met een langer dossier.",
        ],
      },
    ],
  }),
] as const;
