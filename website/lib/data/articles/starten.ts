import { maakArtikel } from "@/lib/data/factory";

const categorie = "starten";

export const startenArtikelen = [
  maakArtikel({
    slug: "hoe-maak-je-een-hoofdprofiel-aan",
    titel: "Hoe maak je een hoofdprofiel aan",
    categorie,
    laatstBijgewerkt: "2026-04-02",
    tags: ["hoofdprofiel", "onboarding", "school"],
    secties: [
      {
        titel: "Waarom een hoofdprofiel nodig is",
        blokken: [
          "Het hoofdprofiel is het startpunt van jullie MijnLeerlijn-omgeving. Hierin leg je de basisgegevens van de school vast: naam, onderwijstype en de periode-indeling die jullie hanteren. Alle groepen, leerlingen en doelensets die je later toevoegt, hangen onder dit hoofdprofiel.",
          "Meestal richt een schoolbeheerder het hoofdprofiel één keer in bij de start. Daarna raadpleeg je het vooral om instellingen te controleren of aan te passen.",
        ],
      },
      {
        titel: "Een hoofdprofiel aanmaken",
        blokken: [
          { stap: "Log in als beheerder en ga naar Beheer > Hoofdprofiel." },
          { stap: "Klik op 'Nieuw hoofdprofiel aanmaken'." },
          { stap: "Vul de schoolnaam, het onderwijstype en het huidige schooljaar in." },
          { stap: "Stel de periode-indeling in (bijvoorbeeld per kwartaal of per half jaar)." },
          {
            stap: "Sla het profiel op. Je kunt de gegevens later altijd aanpassen via Beheer > Hoofdprofiel.",
          },
          {
            waarschuwing:
              "Wijzig de periode-indeling niet meer zodra er doelensets aan lopende periodes gekoppeld zijn — bestaande koppelingen kunnen dan inconsistent worden.",
          },
          {
            tip: "Vul het onderwijstype zo specifiek mogelijk in. Dit bepaalt welke standaardterminologie MijnLeerlijn gebruikt in de rest van de omgeving.",
          },
        ],
      },
      {
        titel: "Wat je hierna kunt doen",
        blokken: [
          "Zodra het hoofdprofiel klaarstaat, kun je groepen aanmaken en leerkrachten en leerlingen toevoegen. Zie de categorie Leerlingen & Groepen voor de vervolgstappen.",
          {
            contact: "Kom je er niet uit bij het inrichten van het hoofdprofiel?",
            onderwerp: "Vraag over hoofdprofiel",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "starten-vanuit-de-methode-of-vanuit-doelen",
    titel: "Aan de slag met MijnLeerlijn: starten vanuit de methode of vanuit doelen",
    categorie,
    laatstBijgewerkt: "2026-03-18",
    tags: ["onboarding", "methode", "doelen"],
    secties: [
      {
        titel: "Twee manieren om te starten",
        blokken: [
          "Er zijn twee manieren om MijnLeerlijn in te richten: starten vanuit de methode die jullie al gebruiken, of starten vanuit jullie eigen leerdoelen. Beide routes leiden tot hetzelfde resultaat — een werkende Doelenplanner — maar de eerste stappen verschillen.",
          "Werk je met een vaste methode (bijvoorbeeld voor rekenen of taal), dan importeert MijnLeerlijn de bijbehorende doelenstructuur. Werk je liever vanuit een eigen leerlijn of een combinatie van methodes, dan bouw je de doelensets zelf op.",
        ],
      },
      {
        titel: "Starten vanuit de methode",
        blokken: [
          { stap: "Ga naar Doelenplanner > Methode koppelen." },
          { stap: "Selecteer de methode die jullie school gebruikt uit de lijst." },
          { stap: "Controleer de voorgestelde doelenstructuur en pas aan waar nodig." },
          { stap: "Koppel de doelenset aan de betreffende groepen." },
          {
            tip: "Ontbreekt jullie methode in de lijst? Neem contact op — we breiden de lijst regelmatig uit.",
          },
        ],
      },
      {
        titel: "Starten vanuit eigen doelen",
        blokken: [
          { stap: "Ga naar Doelenplanner > Doelensets > Nieuwe doelenset." },
          { stap: "Bouw de doelenset handmatig op, eventueel per vak of ontwikkelingsgebied." },
          { stap: "Koppel de doelenset aan een groep of aan individuele leerlingen." },
          {
            waarschuwing:
              "Een handmatig opgebouwde doelenset vraagt meer voorbereidingstijd dan een methode-koppeling. Plan hier voldoende tijd voor in bij de start van het schooljaar.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "eerste-groep-aanmaken",
    titel: "Je eerste groep aanmaken",
    categorie,
    laatstBijgewerkt: "2026-02-20",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Na het inrichten van het hoofdprofiel maak je de eerste groep aan via Groepen > Nieuwe groep. Geef de groep een naam, koppel een leerkracht en voeg leerlingen toe. Zie de categorie Leerlingen & Groepen voor de volledige uitleg.",
          { stap: "Ga naar Groepen > Nieuwe groep en volg de stappen op het scherm." },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "schooljaar-overzetten",
    titel: "Een nieuw schooljaar starten in MijnLeerlijn",
    categorie,
    laatstBijgewerkt: "2026-06-01",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Bij de start van een nieuw schooljaar werk je de periode-indeling in het hoofdprofiel bij en controleer je of groepen correct zijn doorgeschoven. Leerlingen die van groep wisselen, verplaats je via het leerlingprofiel.",
          {
            tip: "Doe deze controle bij voorkeur in de laatste schoolweek, zodat alles bij de start van het nieuwe jaar klopt.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "rondleiding-dashboard",
    titel: "Een rondleiding langs het dashboard",
    categorie,
    laatstBijgewerkt: "2026-01-15",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Het dashboard geeft na het inloggen direct een overzicht van je groepen, recente activiteit en openstaande acties. Gebruik de navigatie bovenin om naar Doelenplanner, Groepen, Analyse of Beheer te gaan.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "rollen-en-rechten-uitleg",
    titel: "Welke rollen en rechten bestaan er in MijnLeerlijn?",
    categorie,
    laatstBijgewerkt: "2026-02-05",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "MijnLeerlijn kent onder andere de rollen leerkracht, intern begeleider, kwaliteitscoördinator, schoolleider en schoolbeheerder. Elke rol heeft eigen rechten, bijvoorbeeld voor het inzien van groepsoverstijgende analyses. Zie Beheer & Instellingen voor het toewijzen van rollen.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "wachtwoord-en-inloggen",
    titel: "Inloggen en je wachtwoord wijzigen",
    categorie,
    laatstBijgewerkt: "2026-01-08",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Log in via mijnleerlijn.nl met je schoolaccount. Een wachtwoord wijzig je via Instellingen > Account > Wachtwoord wijzigen. Ben je je wachtwoord kwijt, gebruik dan 'Wachtwoord vergeten' op het inlogscherm.",
          {
            waarschuwing:
              "Deel nooit je inloggegevens met collega's — vraag in plaats daarvan een eigen account aan bij je schoolbeheerder.",
          },
        ],
      },
    ],
  }),
] as const;
