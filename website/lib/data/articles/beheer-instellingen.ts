import { maakArtikel } from "@/lib/data/factory";

const categorie = "beheer-instellingen";

export const beheerInstellingenArtikelen = [
  maakArtikel({
    slug: "admin-statussets-beheren",
    titel: "Statussets beheren",
    categorie,
    laatstBijgewerkt: "2026-04-30",
    tags: ["statussets", "beheer"],
    secties: [
      {
        titel: "Wat een statusset is",
        blokken: [
          "Een statusset bepaalt welke statussen beschikbaar zijn bij het bijwerken van een doel, bijvoorbeeld 'nog niet gestart', 'in ontwikkeling' en 'behaald'. Standaard biedt MijnLeerlijn een basisset, maar als beheerder kun je deze aanpassen aan de werkwijze van je school.",
        ],
      },
      {
        titel: "Een statusset aanpassen",
        blokken: [
          { stap: "Ga naar Beheer > Statussets." },
          { stap: "Open de statusset die je wilt aanpassen, of maak een nieuwe aan." },
          { stap: "Voeg statussen toe, wijzig de naam of pas de kleur aan." },
          { stap: "Sla de statusset op." },
          {
            waarschuwing:
              "Het verwijderen van een status die al bij leerlingen in gebruik is, kan bestaande voortgangsgegevens onleesbaar maken. Archiveer een status liever dan dat je hem verwijdert.",
          },
          {
            tip: "Beperk het aantal statussen tot wat echt onderscheidend is — een set met te veel tussenstappen maakt het overzicht juist onduidelijker.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "rollen-en-rechten-toewijzen",
    titel: "Rollen en rechten toewijzen aan teamleden",
    categorie,
    laatstBijgewerkt: "2026-05-06",
    tags: ["rollen", "rechten", "gebruikersbeheer"],
    secties: [
      {
        titel: "Beschikbare rollen",
        blokken: [
          "MijnLeerlijn kent de rollen leerkracht, intern begeleider, kwaliteitscoördinator, schoolleider en schoolbeheerder. Elke rol bepaalt onder andere welke groepen en analyses een gebruiker kan inzien.",
        ],
      },
      {
        titel: "Een rol toewijzen",
        blokken: [
          { stap: "Ga naar Beheer > Gebruikers." },
          { stap: "Zoek het teamlid op of nodig een nieuw account uit." },
          { stap: "Kies de gewenste rol in het dropdown-menu." },
          { stap: "Bevestig de wijziging." },
          {
            tip: "Ken de rol 'schoolbeheerder' spaarzaam toe — deze rol kan schoolbrede instellingen wijzigen, inclusief statussets en het hoofdprofiel.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "schoolgegevens-beheren",
    titel: "Schoolgegevens beheren",
    categorie,
    laatstBijgewerkt: "2026-02-13",
    tags: ["schoolgegevens", "hoofdprofiel"],
    secties: [
      {
        titel: "Welke gegevens je kunt aanpassen",
        blokken: [
          "Onder Beheer > Schoolgegevens vind je de basisinformatie van je school: naam, adres, contactpersoon en het onderwijstype dat bij het hoofdprofiel is ingesteld.",
          { stap: "Ga naar Beheer > Schoolgegevens." },
          { stap: "Pas de gewenste velden aan." },
          { stap: "Sla de wijzigingen op." },
          {
            waarschuwing:
              "Het wijzigen van het onderwijstype kan de standaardterminologie in de hele omgeving beïnvloeden. Overleg dit bij twijfel eerst met je team.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "gebruiker-uitnodigen",
    titel: "Een nieuwe gebruiker uitnodigen",
    categorie,
    laatstBijgewerkt: "2026-01-24",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Ga naar Beheer > Gebruikers > Nieuwe gebruiker uitnodigen, vul het e-mailadres en de rol in en verstuur de uitnodiging. De collega ontvangt een e-mail om zelf een wachtwoord in te stellen.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "gebruiker-deactiveren",
    titel: "Een gebruiker deactiveren",
    categorie,
    laatstBijgewerkt: "2026-03-05",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Ga naar Beheer > Gebruikers, open het account en kies 'Deactiveren'. De gegevens van de gebruiker blijven bewaard, maar de gebruiker kan niet meer inloggen.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "periode-indeling-wijzigen",
    titel: "De periode-indeling van de school wijzigen",
    categorie,
    laatstBijgewerkt: "2026-06-18",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Ga naar Beheer > Hoofdprofiel > Periode-indeling om te wijzigen tussen bijvoorbeeld kwartalen en halfjaren.",
          {
            waarschuwing:
              "Wijzig dit niet tijdens een lopend schooljaar met actieve doelenkoppelingen — zie het artikel over het hoofdprofiel voor de volledige toelichting.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "notificatie-instellingen-beheren",
    titel: "Notificatie-instellingen beheren",
    categorie,
    laatstBijgewerkt: "2026-02-28",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Elk teamlid stelt de eigen notificatievoorkeuren in via Instellingen > Notificaties. Een schoolbeheerder kan onder Beheer > Notificaties schoolbrede standaardinstellingen vastleggen.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "audit-log-inzien",
    titel: "Wijzigingen terugvinden via het overzicht van recente activiteit",
    categorie,
    laatstBijgewerkt: "2026-05-16",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "Als schoolbeheerder vind je onder Beheer > Activiteit een overzicht van belangrijke wijzigingen, zoals aangepaste statussets of gewijzigde rollen, met datum en uitvoerende gebruiker.",
        ],
      },
    ],
  }),
] as const;
