import { maakArtikel } from "@/lib/data/factory";

const categorie = "analyse-rapportage";

export const analyseRapportageArtikelen = [
  maakArtikel({
    slug: "analyse-overzicht-gebruiken",
    titel: "Analyse: een overzicht",
    categorie,
    laatstBijgewerkt: "2026-05-05",
    tags: ["analyse", "voortgang"],
    secties: [
      {
        titel: "Wat je in Analyse ziet",
        blokken: [
          "Analyse geeft een groepsoverstijgend beeld van de voortgang op doelen en vaardigheden. Je gebruikt dit onderdeel om trends te signaleren, bijvoorbeeld welke doelen binnen een leerjaar achterblijven, of om een groep te vergelijken met het schoolgemiddelde.",
          { stap: "Ga naar Analyse in het hoofdmenu." },
          { stap: "Kies het niveau waarop je wilt analyseren: groep, leerjaar of school." },
          { stap: "Selecteer de periode waarover je wilt rapporteren." },
        ],
      },
      {
        titel: "Filteren en verdiepen",
        blokken: [
          { stap: "Gebruik de filters bovenin om te filteren op vak, doelencategorie of doelenset." },
          { stap: "Klik op een doel in de grafiek om de onderliggende leerlingscores te bekijken." },
          {
            tip: "Vergelijk periodes naast elkaar om te zien of een interventie daadwerkelijk effect heeft gehad.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "doelenoverzicht-lezen",
    titel: "Het doelenoverzicht lezen en interpreteren",
    categorie,
    laatstBijgewerkt: "2026-05-08",
    tags: ["doelenoverzicht", "voortgang"],
    secties: [
      {
        titel: "Opbouw van het doelenoverzicht",
        blokken: [
          "Het doelenoverzicht toont per leerling of groep welke doelen zijn behaald, in ontwikkeling of nog niet gestart zijn. Kleurcodes geven in één oogopslag de status weer.",
          { stap: "Open het doelenoverzicht via Analyse > Doelenoverzicht of via het leerlingprofiel." },
          { stap: "Gebruik de legenda linksboven om de kleurcodes te herkennen." },
        ],
      },
      {
        titel: "Een doel bijwerken vanuit het overzicht",
        blokken: [
          { stap: "Klik op de status van een doel om deze direct te wijzigen." },
          { stap: "Voeg eventueel een korte toelichting toe bij de statuswijziging." },
          {
            waarschuwing:
              "Een statuswijziging vanuit het doelenoverzicht geldt alleen voor de geselecteerde leerling, niet voor de hele groep.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "rapportage-exporteren",
    titel: "Een rapportage exporteren",
    categorie,
    laatstBijgewerkt: "2026-06-12",
    tags: ["export", "rapportage"],
    secties: [
      {
        titel: "Een rapportage samenstellen",
        blokken: [
          { stap: "Ga naar Analyse > Rapportage." },
          { stap: "Kies de groep of leerling en de gewenste periode." },
          { stap: "Selecteer welke onderdelen worden meegenomen: doelen, vaardigheden en/of notities." },
          { stap: "Klik op 'Exporteren' en kies het bestandsformaat (pdf of Excel)." },
          {
            tip: "Gebruik de pdf-export voor oudergesprekken en de Excel-export wanneer je de gegevens verder wilt bewerken of combineren.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "groepsvergelijking-maken",
    titel: "Twee groepen met elkaar vergelijken",
    categorie,
    laatstBijgewerkt: "2026-02-24",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Ga naar Analyse > Groepsvergelijking, selecteer twee groepen en een gezamenlijk vak of doelencategorie om de voortgang naast elkaar te zien.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "individueel-leerlingrapport-maken",
    titel: "Een individueel leerlingrapport samenstellen",
    categorie,
    laatstBijgewerkt: "2026-03-30",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Open het leerlingprofiel en kies 'Rapport samenstellen' om een overzicht van doelen, vaardigheden en notities voor deze ene leerling te exporteren.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "trends-signaleren-in-analyse",
    titel: "Trends signaleren met de Analyse-module",
    categorie,
    laatstBijgewerkt: "2026-04-18",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Vergelijk periodes in Analyse om te zien of de voortgang op een doel structureel achterblijft, in plaats van een momentopname te beoordelen.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "analyse-rechten-per-rol",
    titel: "Wie kan welke analyses inzien?",
    categorie,
    laatstBijgewerkt: "2026-01-11",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Leerkrachten zien standaard alleen analyses van hun eigen groepen. Intern begeleiders, kwaliteitscoördinatoren en schoolleiders kunnen groepsoverstijgend inzien. Rollen worden ingesteld via Beheer & Instellingen.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "doelenoverzicht-filteren-op-status",
    titel: "Het doelenoverzicht filteren op status",
    categorie,
    laatstBijgewerkt: "2026-05-27",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Gebruik het statusfilter boven het doelenoverzicht om snel alleen 'nog niet gestart' of 'in ontwikkeling' doelen te tonen, handig bij het voorbereiden van een groepsbespreking.",
        ],
      },
    ],
  }),
] as const;
