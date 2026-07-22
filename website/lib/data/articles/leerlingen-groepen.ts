import { maakArtikel } from "@/lib/data/factory";

const categorie = "leerlingen-groepen";

export const leerlingenGroepenArtikelen = [
  maakArtikel({
    slug: "leerkrachten-en-leerlingen-toevoegen-aan-een-groep",
    titel: "Leerkrachten en leerlingen toevoegen aan een groep",
    categorie,
    laatstBijgewerkt: "2026-04-28",
    tags: ["groep", "leerling", "leerkracht"],
    secties: [
      {
        titel: "Een leerkracht toevoegen",
        blokken: [
          "Elke groep heeft minimaal één leerkracht nodig om zichtbaar te zijn in het overzicht van die leerkracht. Je kunt meerdere leerkrachten aan dezelfde groep koppelen, bijvoorbeeld bij duo-banen.",
          { stap: "Open de groep en ga naar het tabblad 'Team'." },
          { stap: "Klik op 'Leerkracht toevoegen'." },
          { stap: "Zoek de collega op naam of e-mailadres en bevestig." },
        ],
      },
      {
        titel: "Een leerling toevoegen",
        blokken: [
          { stap: "Open de groep en ga naar het tabblad 'Leerlingen'." },
          { stap: "Klik op 'Leerling toevoegen'." },
          {
            stap: "Vul de naam en geboortedatum van de leerling in, of zoek een bestaand leerlingprofiel op.",
          },
          { stap: "Bevestig om de leerling aan de groep te koppelen." },
          {
            tip: "Bestaat het leerlingprofiel al (bijvoorbeeld na een groepswissel), koppel dan het bestaande profiel in plaats van een nieuw profiel aan te maken — zo blijft de voortgangshistorie behouden.",
          },
        ],
      },
      {
        titel: "Meerdere leerlingen tegelijk toevoegen",
        blokken: [
          "Bij de start van het schooljaar wil je vaak een hele klas in één keer toevoegen.",
          { stap: "Ga naar het tabblad 'Leerlingen' en kies 'Meerdere toevoegen'." },
          { stap: "Upload een lijst met namen en geboortedata, of vul de tabel handmatig in." },
          { stap: "Controleer de lijst en bevestig." },
          {
            waarschuwing:
              "Controleer geboortedata zorgvuldig vóór het bevestigen — dit veld is na het aanmaken niet meer via een bulkactie te wijzigen.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "leerling-verwijderen-uit-groep",
    titel: "Verwijder doelen bij een leerling of groep",
    categorie,
    laatstBijgewerkt: "2026-04-03",
    tags: ["verwijderen", "leerling", "groep"],
    secties: [
      {
        titel: "Een doel verwijderen",
        blokken: [
          "Soms is een gekoppeld doel niet meer relevant voor een leerling of groep, bijvoorbeeld na een tussentijdse aanpassing van het traject.",
          { stap: "Ga naar het leerlingprofiel of het groepsoverzicht." },
          { stap: "Open het doelenoverzicht." },
          { stap: "Kies bij het betreffende doel voor 'Verwijderen'." },
          {
            waarschuwing:
              "Dit is niet terug te draaien. Controleer eerst of het echt het juiste doel is voordat je bevestigt.",
          },
        ],
      },
      {
        titel: "Een leerling uit een groep verwijderen",
        blokken: [
          { stap: "Open de groep en ga naar het tabblad 'Leerlingen'." },
          { stap: "Kies bij de leerling voor 'Uit groep verwijderen'." },
          {
            tip: "Het leerlingprofiel zelf blijft bestaan — je verwijdert alleen de koppeling met deze groep. Zo kun je de leerling later aan een andere groep koppelen zonder gegevens te verliezen.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "leerlingprofiel-bekijken-en-bewerken",
    titel: "Een leerlingprofiel bekijken en bewerken",
    categorie,
    laatstBijgewerkt: "2026-03-12",
    tags: ["leerlingprofiel"],
    secties: [
      {
        titel: "Wat staat er in een leerlingprofiel",
        blokken: [
          "Het leerlingprofiel bevat de basisgegevens, gekoppelde doelen, notities, documenten en de voortgang van een leerling in één overzicht.",
          { stap: "Ga naar Groepen, open de groep en klik op de naam van de leerling." },
          {
            stap: "Gebruik de tabbladen boven in het profiel om te schakelen tussen Doelen, Notities, Documenten en Voortgang.",
          },
        ],
      },
      {
        titel: "Gegevens bewerken",
        blokken: [
          { stap: "Klik in het leerlingprofiel op 'Bewerken'." },
          { stap: "Pas de gewenste gegevens aan en sla op." },
          {
            tip: "Wijzigingen in basisgegevens zijn direct zichtbaar voor alle leerkrachten die aan deze groep gekoppeld zijn.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "groep-aanmaken",
    titel: "Een nieuwe groep aanmaken",
    categorie,
    laatstBijgewerkt: "2026-02-08",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Ga naar Groepen > Nieuwe groep, geef de groep een naam en koppel een leerkracht. Daarna voeg je leerlingen toe via het tabblad 'Leerlingen'.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "leerling-tussentijds-instromen",
    titel: "Een leerling die tussentijds instroomt toevoegen",
    categorie,
    laatstBijgewerkt: "2026-05-02",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Voeg een instromende leerling toe zoals gebruikelijk via Groepen > Leerlingen > Leerling toevoegen. Controleer daarna of de automatische doelenkoppeling (indien ingesteld) de juiste doelenset heeft toegepast.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "groepswissel-tussen-schooljaren",
    titel: "Leerlingen doorschuiven naar een nieuwe groep",
    categorie,
    laatstBijgewerkt: "2026-06-05",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Bij de jaarovergang verplaats je leerlingen naar hun nieuwe groep via het leerlingprofiel > Groep wijzigen. De voortgangshistorie van de leerling blijft daarbij behouden.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "meerdere-leerkrachten-op-een-groep",
    titel: "Werken met meerdere leerkrachten op één groep",
    categorie,
    laatstBijgewerkt: "2026-01-22",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Bij duo-banen of onderwijsassistenten koppel je meerdere teamleden aan dezelfde groep via het tabblad 'Team'. Iedereen ziet dezelfde groepsgegevens en kan wijzigingen aanbrengen.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "leerling-zoeken-in-mijnleerlijn",
    titel: "Een leerling snel terugvinden",
    categorie,
    laatstBijgewerkt: "2026-02-27",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Gebruik de zoekfunctie bovenin het scherm om direct een leerling op naam te vinden, ook als je niet weet in welke groep de leerling zit.",
        ],
      },
    ],
  }),
] as const;
