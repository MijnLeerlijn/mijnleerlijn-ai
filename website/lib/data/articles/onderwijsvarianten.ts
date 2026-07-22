import { maakArtikel } from "@/lib/data/factory";

const categorie = "onderwijsvarianten";

export const onderwijsvariantenArtikelen = [
  maakArtikel({
    slug: "wat-is-een-onderwijsvariant",
    titel: "Wat is een onderwijsvariant?",
    categorie,
    laatstBijgewerkt: "2026-05-01",
    tags: ["variant", "montessori", "dalton"],
    secties: [
      {
        titel: "Eén platform, verschillende onderwijsvormen",
        blokken: [
          "MijnLeerlijn wordt naast de algemene versie ook aangeboden in varianten die aansluiten bij een specifieke onderwijsvorm, zoals montessori- of daltononderwijs. De kern van het platform is voor iedereen gelijk; een variant past vooral terminologie en enkele werkwijzen aan zodat de omgeving aansluit bij hoe jullie school werkt.",
          "Werk je bijvoorbeeld met montessorionderwijs, dan spreekt de omgeving over 'ontwikkelingsdoelen' in plaats van 'leerdoelen' — de onderliggende functionaliteit blijft hetzelfde.",
        ],
      },
      {
        titel: "Wat verandert er in een variant",
        blokken: [
          {
            stap: "Terminologie: bepaalde begrippen worden schoolbreed vervangen door de term die bij jullie onderwijsvorm past.",
          },
          { stap: "Merkweergave: logo en naam kunnen afwijken van de standaard MijnLeerlijn-uitstraling." },
          {
            stap: "Een aantal handleidingen bevat een variant-specifieke aanvulling naast de algemene uitleg.",
          },
          {
            tip: "De functionaliteit zelf — doelen, groepen, analyse — werkt in elke variant op dezelfde manier. Alleen de taal en presentatie sluiten aan bij jullie onderwijsvorm.",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "overstappen-naar-een-andere-variant",
    titel: "Overstappen naar een andere onderwijsvariant",
    categorie,
    laatstBijgewerkt: "2026-05-03",
    tags: ["variant", "overstappen"],
    secties: [
      {
        titel: "Wanneer dit relevant is",
        blokken: [
          "Sommige scholen starten met de algemene MijnLeerlijn-omgeving en stappen later over op een variant die beter aansluit bij hun onderwijsconcept, bijvoorbeeld na een schoolbrede keuze voor montessori- of daltononderwijs.",
        ],
      },
      {
        titel: "De overstap aanvragen",
        blokken: [
          { stap: "Neem contact op via het contactformulier met de wens om over te stappen." },
          { stap: "Geef aan naar welke variant je wilt overstappen." },
          { stap: "Na bevestiging wordt de terminologie en merkweergave voor jullie omgeving aangepast." },
          {
            waarschuwing:
              "Bestaande doelen, groepen en leerlingen blijven bij een overstap volledig behouden — alleen de weergave verandert.",
          },
          {
            contact: "Wil je overstappen naar een andere onderwijsvariant?",
            onderwerp: "Overstappen naar andere variant",
          },
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "montessori-terminologie-in-mijnleerlijn",
    titel: "Montessori-terminologie in MijnLeerlijn",
    categorie,
    laatstBijgewerkt: "2026-04-01",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "In de montessorivariant wordt 'leerdoel' vervangen door 'ontwikkelingsdoel' en sluit de indeling van doelensets aan bij de montessori-ontwikkelingsgebieden.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "dalton-terminologie-in-mijnleerlijn",
    titel: "Dalton-terminologie in MijnLeerlijn",
    categorie,
    laatstBijgewerkt: "2026-05-19",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "In de daltonvariant wordt 'groep' vervangen door 'stamgroep', passend bij de gangbare daltonterminologie.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "welke-varianten-zijn-beschikbaar",
    titel: "Welke onderwijsvarianten zijn beschikbaar?",
    categorie,
    laatstBijgewerkt: "2026-06-14",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "MijnLeerlijn is beschikbaar in de algemene versie en als montessorivariant. Een daltonvariant is in ontwikkeling. Neem contact op als je onderwijsvorm hier nog niet bij staat.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "variant-branding-uitleg",
    titel: "Hoe herken je welke variant je gebruikt?",
    categorie,
    laatstBijgewerkt: "2026-02-09",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "De naam en het logo linksboven in de omgeving tonen welke variant je gebruikt. Bij twijfel kun je dit ook navragen bij je schoolbeheerder.",
        ],
      },
    ],
  }),
  maakArtikel({
    slug: "handleidingen-per-variant",
    titel: "Zijn handleidingen hetzelfde voor elke variant?",
    categorie,
    laatstBijgewerkt: "2026-03-27",
    secties: [
      {
        titel: "In het kort",
        blokken: [
          "De meeste handleidingen zijn identiek, met alleen aangepaste terminologie. Sommige handleidingen bevatten een extra alinea die specifiek is voor jullie onderwijsvorm — deze is dan duidelijk als aanvulling herkenbaar.",
        ],
      },
    ],
  }),
] as const;
