// Content voor de import in ./index.ts — zie de toelichting daar. Alles
// hieronder beschrijft uitsluitend functionaliteit die daadwerkelijk in
// Curriculum Werkplaats bestaat (geen verzonnen features), gebaseerd op de
// applicatie zoals gebouwd (zie de opleverrapporten in die repository).

export type RawBlock =
  | { type: "tekst"; body: string }
  | { type: "genummerde_stap"; body: string }
  | { type: "waarschuwing"; body: string }
  | { type: "tip"; body: string };

export interface RawSection {
  title: string;
  blocks: RawBlock[];
}

export interface RawArticle {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  sections: RawSection[];
}

const tekst = (body: string): RawBlock => ({ type: "tekst", body });
const stap = (body: string): RawBlock => ({ type: "genummerde_stap", body });
const tip = (body: string): RawBlock => ({ type: "tip", body });
const waarschuwing = (body: string): RawBlock => ({ type: "waarschuwing", body });

// ---------------------------------------------------------------------------
// De volledige handleiding — één samenhangend artikel met alle onderwerpen,
// in de volgorde waarin een school ze in de praktijk tegenkomt.
// ---------------------------------------------------------------------------

export const handleiding: RawArticle = {
  slug: "curriculum-werkplaats-volledige-handleiding",
  title: "Curriculum Werkplaats — de volledige handleiding",
  summary:
    "Alles over Curriculum Werkplaats: een omgeving aanmaken, samen curriculum bewerken, exporteren naar MijnLeerlijn en weer synchroniseren.",
  tags: ["curriculum werkplaats", "handleiding", "curriculum", "export", "import"],
  sections: [
    {
      title: "1. Wat is Curriculum Werkplaats?",
      blocks: [
        tekst(
          "Curriculum Werkplaats is een apart platform van MijnLeerlijn (op curriculum.mijnleerlijn.chat) waarin een schoolteam gezamenlijk aan het schoolcurriculum werkt: leerdoelen aanpassen, nieuwe doelen toevoegen, doelen splitsen of verwijderen. Je begint met een export uit MijnLeerlijn, werkt die gezamenlijk bij, en maakt er aan het eind weer een importbestand van voor MijnLeerlijn."
        ),
        tekst(
          "Curriculum Werkplaats is dus geen vervanging van MijnLeerlijn, maar een tussenstap: een rustige, gedeelde werkplek voor het voorbereidende werk, los van de dagelijkse MijnLeerlijn-omgeving."
        ),
      ],
    },
    {
      title: "2. Een omgeving aanmaken voor je school",
      blocks: [
        tekst(
          'Ga naar de startpagina van Curriculum Werkplaats en kies "Maak een omgeving voor je school". Vul de schoolnaam, een projectnaam (bijvoorbeeld "Curriculum 2026-2027"), optioneel het schooljaar, een wachtwoord en de naam of initialen van de eerste gebruiker in.'
        ),
        waarschuwing(
          "Bewaar de omgevingslink en het wachtwoord goed na het aanmaken: het wachtwoord kan niet worden teruggehaald (alleen gereset, zie sectie 28) en zonder de link of projectcode kun je de omgeving niet terugvinden."
        ),
        tekst(
          "Meteen bij het aanmaken krijgt de omgeving ook een korte projectcode (zoals \"KLV4-2026\") — zie sectie 28 voor wat je daarmee kunt."
        ),
      ],
    },
    {
      title: "3. Inloggen: wachtwoord en 'Wie ben je?'",
      blocks: [
        tekst(
          "Inloggen gaat in twee stappen. Eerst het projectwachtwoord van je school — dit is voor iedereen in het team hetzelfde wachtwoord, geen persoonlijk account. Daarna kies je wie je bent uit de lijst met teamleden, of voeg je jezelf toe als je er nog niet bij staat."
        ),
        stap("Vul het projectwachtwoord in op het inlogscherm."),
        stap('Kies je eigen naam bij "Wie ben je?", of kies "Gebruiker toevoegen" als je nog niet in de lijst staat.'),
        tekst(
          "Na vijf onjuiste wachtwoordpogingen wordt verder proberen tijdelijk geblokkeerd, om de omgeving tegen gokken te beschermen."
        ),
      ],
    },
    {
      title: "4. Het dashboard: Actief, Wacht op ML en Archief",
      blocks: [
        tekst(
          "Het dashboard is je startpunt na het inloggen en toont drie duidelijke groepen: Hoofdgebieden waar nog aan gewerkt kan worden (Actief), Hoofdgebieden die net geëxporteerd zijn en op een nieuwe MijnLeerlijn-export wachten (Wacht op ML), en afgesloten bewerkingsrondes (Archief)."
        ),
        tekst("Zo zie je in één oogopslag waar het team nu staat, zonder tussen schermen te hoeven zoeken."),
      ],
    },
    {
      title: "5. Het hoofdmenu en de vaste header",
      blocks: [
        tekst(
          "Bovenaan elk scherm binnen een omgeving staat een vaste balk met het MijnLeerlijn-logo, de schoolnaam en projectnaam, en het hoofdmenu: Dashboard, Werkplaats, Wijzigingen, Rapporten en Leraren."
        ),
        tekst(
          'Rechtsboven zie je "Je werkt als: [jouw naam]" — via dat menu kun je wisselen van gebruiker, een nieuwe gebruiker toevoegen, naar Projectinstellingen gaan of uitloggen. Ernaast staat een subtiele "Hulp nodig?"-link die rechtstreeks naar deze Helpdesk opent.'
        ),
      ],
    },
    {
      title: "6. Curriculum importeren vanuit MijnLeerlijn (eerste keer)",
      blocks: [
        tekst(
          "De eerste stap in een nieuwe omgeving is het uploaden van een Excel-export vanuit MijnLeerlijn. Curriculum Werkplaats leest het bestand, herkent de Hoofdgebieden, Deelgebieden en doelen, en laat je vooraf zien wat er gevonden is."
        ),
        stap('Ga naar "Importeren" en kies het Excel-bestand vanuit MijnLeerlijn.'),
        stap("Controleer het overzicht van gevonden Hoofdgebieden en het aantal doelen per Hoofdgebied."),
        stap('Vink de Hoofdgebieden aan die je wilt importeren (standaard staan alle nieuwe Hoofdgebieden al aan) en kies "Doorgaan".'),
        tip('Gebruik "Alles selecteren" of "Alles deselecteren" om snel te schakelen als je maar een deel van het bestand wilt importeren.'),
      ],
    },
    {
      title: "7. De Werkplaats: Hoofdgebieden, Deelgebieden en doelen",
      blocks: [
        tekst(
          "In de Werkplaats zie je het curriculum opgebouwd als een boom: Hoofdgebied (bijvoorbeeld Rekenen) → Deelgebied (bijvoorbeeld Getalbegrip) → losse leerdoelen. Filters boven het overzicht laten je snel inzoomen op een specifiek Hoofdgebied, Deelgebied of status."
        ),
        tekst(
          "Een statusbalk bovenaan toont meteen hoeveel doelen nieuw, gewijzigd, gesplitst of verwijderd zijn in de huidige bewerkingsronde."
        ),
      ],
    },
    {
      title: "8. Een doel bekijken en bewerken",
      blocks: [
        tekst("Klik op een doel om het zijpaneel te openen met alle details: leerdoel, inhoud, leerjaar, periode en eventueel een stappenplan."),
        stap('Klik op een doel in de Werkplaats, of kies de knop "Bewerken" in het zijpaneel.'),
        stap("Pas de gewenste velden aan."),
        stap("Sla op — de wijziging wordt meteen zichtbaar in de statusbalk en op de Wijzigingen-tab."),
      ],
    },
    {
      title: "9. Een nieuw doel toevoegen",
      blocks: [
        tekst(
          "Naast het bewerken van bestaande doelen kun je binnen een bewerkbaar Hoofdgebied ook volledig nieuwe doelen toevoegen, bijvoorbeeld om een gat in het curriculum op te vullen."
        ),
        stap('Kies "Nieuw doel" binnen het gewenste Hoofdgebied/Deelgebied.'),
        stap("Vul leerdoel, inhoud, leerjaar en periode in."),
        stap("Sla op — het nieuwe doel krijgt de status 'Nieuw' totdat het geëxporteerd wordt."),
      ],
    },
    {
      title: "10. Een doel splitsen",
      blocks: [
        tekst(
          "Splitsen is bedoeld voor een doel dat eigenlijk twee (of meer) losse leerdoelen combineert. Je splitst het op in meerdere resultaten, en kiest welk van de nieuwe doelen het bestaande ML-ID van het origineel behoudt."
        ),
        stap('Open het doel en kies "Splitsen".'),
        stap("Pas de velden van elk resulterend doel aan; voeg zo nodig extra doelen toe met 'Nog een doel toevoegen'."),
        stap("Kies bij precies één van de resultaten dat het het bestaande ML-ID behoudt."),
        stap('Bevestig met "Splits doelen".'),
        tekst(
          "Alle andere resultaten worden bij de eerstvolgende export als nieuwe doelen behandeld — dat is bewust zo, om verwarring in MijnLeerlijn te voorkomen over welk doel welk oorspronkelijk doel 'is'."
        ),
      ],
    },
    {
      title: "11. Een doel verwijderen en herstellen",
      blocks: [
        tekst("Verwijderen zet een doel op 'gemarkeerd voor verwijdering' — het verdwijnt niet meteen, maar wordt bij de eerstvolgende export als te verwijderen doorgegeven aan MijnLeerlijn."),
        stap('Open het doel en kies "Verwijderen".'),
        tekst("Zolang de bewerkingsronde nog open is, kun je een verwijderd doel via de Historie weer herstellen."),
      ],
    },
    {
      title: "12. Doelen bulksgewijs verplaatsen tussen Deelgebieden",
      blocks: [
        tekst(
          "Wil je meerdere doelen tegelijk naar een ander Deelgebied verplaatsen (bijvoorbeeld na een herindeling), dan hoeft dat niet één voor één. Selecteer de doelen in het overzicht en kies de verplaats-actie."
        ),
        tekst("De Wijzigingen-tab groepeert zo'n bulkverplaatsing overzichtelijk tot één regel, in plaats van tientallen losse meldingen."),
      ],
    },
    {
      title: "13. Een nieuw Deelgebied aanmaken",
      blocks: [
        tekst("Binnen een bewerkbaar Hoofdgebied kun je ook een compleet nieuw Deelgebied toevoegen, bijvoorbeeld om een nieuw onderdeel van de leerlijn te introduceren."),
        stap("Ga naar het Hoofdgebied waarbinnen je een Deelgebied wilt toevoegen."),
        stap('Kies "Nieuw Deelgebied" en geef het een naam.'),
        waarschuwing("Een Deelgebiednaam moet uniek zijn binnen het Hoofdgebied — een dubbele naam wordt geweigerd."),
      ],
    },
    {
      title: "14. De Wijzigingen-tab: wat is er dit rondje veranderd?",
      blocks: [
        tekst(
          "De Wijzigingen-tab geeft een leesbaar overzicht van alles wat er in de huidige bewerkingsronde is aangepast: nieuwe doelen, wijzigingen, splitsingen, verwijderingen en bulkverplaatsingen — gegroepeerd per soort wijziging, niet als een kale technische log."
        ),
      ],
    },
    {
      title: "15. Historie van een doel en 'Deze versie herstellen'",
      blocks: [
        tekst(
          "Elk doel heeft een eigen historie met alle eerdere versies binnen de huidige bewerkingsronde. Bij elke historie-regel kun je kiezen 'Deze versie herstellen' om exact naar die eerdere staat terug te gaan."
        ),
        stap('Open het doel en kies het tabblad "Historie".'),
        stap('Kies bij de gewenste eerdere versie "Deze versie herstellen".'),
      ],
    },
    {
      title: "16. Terug naar de rondestart",
      blocks: [
        tekst(
          "Wil je in één keer alle wijzigingen van de huidige bewerkingsronde voor een doel ongedaan maken (niet alleen de laatste), dan kun je het doel terugzetten naar de staat bij het begin van deze ronde — dus naar het moment van de laatste import of hersync."
        ),
      ],
    },
    {
      title: "17. Hoofdgebiedstatus: Bewerkbaar vs. Wacht op nieuwe ML-export",
      blocks: [
        tekst(
          "Een Hoofdgebied heeft altijd één van twee statussen. 'Bewerkbaar' betekent: het team kan er nog aan werken. 'Wacht op nieuwe ML-export' betekent: dit Hoofdgebied is al geëxporteerd naar MijnLeerlijn en is vergrendeld totdat de school een nieuwe export uit MijnLeerlijn terug uploadt (zie sectie 20)."
        ),
        waarschuwing("Een vergrendeld Hoofdgebied kan niet bewerkt worden — dat voorkomt dat iemand per ongeluk wijzigingen maakt die MijnLeerlijn nog niet kent."),
      ],
    },
    {
      title: "18. Exporteren naar MijnLeerlijn",
      blocks: [
        tekst("Als een Hoofdgebied klaar is, exporteer je het als Excel-bestand dat je in MijnLeerlijn kunt importeren. Exporteren gebeurt per Hoofdgebied, nooit voor de hele omgeving in één keer."),
        stap('Ga naar de Werkplaats en kies "Exporteren".'),
        stap("Kies het Hoofdgebied dat je wilt exporteren."),
        stap("Controleer het overzicht van wat er meegaat."),
        stap('Kies "Excel voor MijnLeerlijn maken" om het bestand te downloaden.'),
        tekst("Na een geslaagde export wordt het Hoofdgebied automatisch vergrendeld (zie sectie 17) en de lopende bewerkingsronde gesloten."),
      ],
    },
    {
      title: "19. Terug importeren in MijnLeerlijn",
      blocks: [
        tekst("Het gedownloade exportbestand upload je vervolgens in MijnLeerlijn zelf, op de plek waar je normaal een curriculumbestand importeert. Dit gebeurt buiten Curriculum Werkplaats, in MijnLeerlijn."),
      ],
    },
    {
      title: "20. Een nieuwe ML-export maken en opnieuw uploaden (hersync)",
      blocks: [
        tekst(
          "Zodra het Hoofdgebied verwerkt is in MijnLeerlijn, maak je daar een nieuwe, complete export van (met de definitieve ML-ID's) en upload je die opnieuw in Curriculum Werkplaats — dit heet hersynchroniseren."
        ),
        stap("Maak in MijnLeerlijn een nieuwe export van het betreffende Hoofdgebied."),
        stap('Upload dat bestand in Curriculum Werkplaats via "Importeren" — een Hoofdgebied dat op ML wacht, krijgt automatisch de hersync-optie aangeboden in plaats van een gewone import.'),
        stap("Controleer het matchingoverzicht (zie sectie 21) en bevestig."),
        tekst("Na een geslaagde hersync is het Hoofdgebied weer 'Bewerkbaar' en start er een nieuwe, schone bewerkingsronde (zie sectie 22)."),
      ],
    },
    {
      title: "21. Hoe matching bij een hersync werkt",
      blocks: [
        tekst(
          "Bij een hersync probeert Curriculum Werkplaats elk doel uit het nieuwe MijnLeerlijn-bestand te koppelen aan het bijbehorende doel in de Werkplaats, zodat de definitieve ML-ID's correct terugkomen. Twijfelgevallen worden voorgelegd voor handmatige bevestiging in plaats van geraden."
        ),
      ],
    },
    {
      title: "22. Een nieuwe, schone bewerkingsronde",
      blocks: [
        tekst(
          "Na een succesvolle hersync begint automatisch een nieuwe bewerkingsronde: de Wijzigingen-tab en statusbalk beginnen weer op nul, en de zojuist binnengehaalde MijnLeerlijn-versie is de nieuwe basislijn (rondestart) om eventueel weer naar terug te kunnen."
        ),
      ],
    },
    {
      title: "23. Rapporten: wijzigingsoverzicht per ronde",
      blocks: [
        tekst("De Rapporten-pagina toont per afgeronde bewerkingsronde een leesbaar, inhoudelijk overzicht van wat er in die ronde is gewijzigd — handig om terug te kijken of om met het team te delen wat er is aangepast."),
      ],
    },
    {
      title: "24. Het archief van afgesloten rondes",
      blocks: [
        tekst("Elke afgesloten bewerkingsronde blijft zichtbaar in het Archief op het dashboard, met een eigen detailpagina. Gearchiveerde rondes zijn niet meer te bewerken — dat is met opzet, zodat het archief een betrouwbare, onveranderlijke geschiedenis blijft."),
      ],
    },
    {
      title: "25. Leraren: gebruikers toevoegen",
      blocks: [
        tekst("Op de Leraren-pagina beheer je wie er toegang heeft tot de omgeving. In tegenstelling tot het lichtgewicht 'Wie ben je?'-scherm zijn hier initialen verplicht en uniek per project."),
        stap('Ga naar "Leraren" in het hoofdmenu.'),
        stap('Kies "Leraar toevoegen" en vul naam en initialen in.'),
      ],
    },
    {
      title: "26. Leraren: deactiveren en reactiveren",
      blocks: [
        tekst("Een teamlid dat niet meer meewerkt, deactiveer je in plaats van te verwijderen — zo blijft de historie (wie heeft wat gewijzigd) volledig intact. Deactiveren kan altijd ongedaan gemaakt worden."),
        stap("Ga naar Leraren en kies bij de betreffende persoon 'Deactiveren' (of 'Activeren' om terug te draaien)."),
      ],
    },
    {
      title: "27. Laatst actief / nog nooit ingelogd",
      blocks: [
        tekst("Bij elke leraar zie je wanneer diegene voor het laatst actief is geweest, of 'Nog nooit' als iemand nog niet als gebruiker gekozen is sinds toevoegen."),
      ],
    },
    {
      title: "28. Projectinstellingen: schoolnaam, projectcode en projectlink",
      blocks: [
        tekst(
          "Via het gebruikersmenu rechtsboven kom je bij Projectinstellingen, met het blok 'Toegang tot deze omgeving': schoolnaam, projectcode en de volledige omgevingslink, elk met een kopieerknop."
        ),
        waarschuwing("Het wachtwoord van de omgeving staat hier bewust nooit bij — dat is en blijft alleen als versleutelde hash opgeslagen, ook voor MijnLeerlijn zelf niet leesbaar."),
        tekst("Ben je het wachtwoord kwijt, dan verwijst dit scherm je door naar deze Helpdesk om contact op te nemen met MijnLeerlijn voor een reset."),
      ],
    },
    {
      title: "29. Een bestaande omgeving openen (link of projectcode)",
      blocks: [
        tekst(
          "Op de startpagina van Curriculum Werkplaats kun je een bestaande omgeving op twee manieren openen: door de volledige omgevingslink te plakken, of door de korte projectcode van je school in te vullen (te vinden bij Projectinstellingen)."
        ),
        tekst("De projectcode geeft op zichzelf geen toegang — na het invullen vraagt het scherm gewoon nog om het projectwachtwoord, precies zoals bij de volledige link."),
      ],
    },
    {
      title: "30. Hulp nodig? Doorverwijzing naar de Helpdesk",
      blocks: [
        tekst(
          "Kom je er zelf niet uit, dan staat er in de vaste bovenbalk van Curriculum Werkplaats altijd een 'Hulp nodig?'-link naar deze Helpdesk. Vanuit specifieke schermen (zoals splitsen en exporteren) staat er bovendien een directe link naar het bijbehorende onderwerp hier."
        ),
      ],
    },
    {
      title: "31. De volledige cyclus in één overzicht",
      blocks: [
        tekst("Samengevat doorloopt een school steeds dezelfde cyclus:"),
        stap("Exporteer het curriculum vanuit MijnLeerlijn."),
        stap("Upload dat bestand in Curriculum Werkplaats (import)."),
        stap("Werk samen aan de doelen in de Werkplaats."),
        stap("Exporteer het bijgewerkte Hoofdgebied vanuit Curriculum Werkplaats."),
        stap("Het Hoofdgebied krijgt de status 'Wacht op nieuwe ML-export' en wordt vergrendeld."),
        stap("Importeer het exportbestand in MijnLeerlijn."),
        stap("Maak in MijnLeerlijn een nieuwe, definitieve export van hetzelfde Hoofdgebied."),
        stap("Upload die nieuwe export terug in Curriculum Werkplaats (hersync/synchroniseren)."),
        stap("Het Hoofdgebied wordt weer 'Bewerkbaar' en er begint een nieuwe, schone bewerkingsronde."),
        tip("Deze cyclus geldt per Hoofdgebied — verschillende Hoofdgebieden kunnen dus prima in verschillende stappen van de cyclus zitten."),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// 18 losse kennisartikelen — kortere, gerichte vraag-en-antwoord-achtige
// aanvullingen op de handleiding hierboven.
// ---------------------------------------------------------------------------

export const kennisartikelen: RawArticle[] = [
  {
    slug: "curriculum-werkplaats-versus-mijnleerlijn",
    title: "Wat is het verschil tussen Curriculum Werkplaats en MijnLeerlijn?",
    summary: "Curriculum Werkplaats is de voorbereidende werkplek voor het curriculum; MijnLeerlijn blijft het systeem waarin je dagelijks werkt.",
    tags: ["curriculum werkplaats", "mijnleerlijn", "verschil"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "MijnLeerlijn is het leerlingvolgsysteem waarin je dagelijks werkt: leerlingen, groepen, doelensets, voortgang. Curriculum Werkplaats is een apart, los platform waarin een team gezamenlijk het schoolcurriculum zelf voorbereidt en bewerkt, vóórdat het weer terug de school in gaat via een import in MijnLeerlijn."
          ),
          tekst("De twee systemen zijn technisch onafhankelijk van elkaar: een eigen inlog, eigen data, eigen beheer — verbonden via export- en importbestanden, niet via een directe koppeling."),
        ],
      },
    ],
  },
  {
    slug: "wat-is-een-projectcode",
    title: "Wat is een projectcode en waarvoor gebruik ik die?",
    summary: "Een korte, niet-geheime code om je schoolomgeving makkelijk terug te vinden — geen vervanging van het wachtwoord.",
    tags: ["projectcode", "inloggen", "omgeving openen"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Elke schoolomgeving krijgt een korte, herkenbare projectcode, zoals \"KLV4-2026\" — een afkorting van de schoolnaam plus het jaartal. Je vindt hem bij Projectinstellingen."
          ),
          tekst(
            "De code is bedoeld om je omgeving makkelijk terug te vinden of aan iemand door te geven, bijvoorbeeld telefonisch. Hij geeft op zichzelf geen toegang: na het invullen van de code op de startpagina vraagt het scherm alsnog gewoon om het projectwachtwoord."
          ),
        ],
      },
    ],
  },
  {
    slug: "omgevingslink-kwijt",
    title: "Ik ben de omgevingslink kwijt — wat nu?",
    summary: "Gebruik de projectcode van je school op de startpagina, of vraag de link na bij een collega die al toegang heeft.",
    tags: ["omgevingslink", "inloggen", "projectcode"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          stap('Ga naar de startpagina van Curriculum Werkplaats en vul bij "Open bestaande omgeving" de projectcode van je school in (te vinden bij een collega die al is ingelogd, via Projectinstellingen).'),
          stap("Vul daarna het projectwachtwoord in zoals gewoonlijk."),
          tip("Weet niemand in het team de projectcode meer, neem dan contact op met MijnLeerlijn via deze Helpdesk."),
        ],
      },
    ],
  },
  {
    slug: "wat-betekent-wacht-op-nieuwe-ml-export",
    title: "Wat betekent 'Wacht op nieuwe ML-export' bij een Hoofdgebied?",
    summary: "Het Hoofdgebied is al geëxporteerd naar MijnLeerlijn en tijdelijk vergrendeld, totdat er een nieuwe export wordt teruggehaald.",
    tags: ["hoofdgebiedstatus", "export", "vergrendeld"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Zodra een Hoofdgebied in Curriculum Werkplaats geëxporteerd is naar MijnLeerlijn, krijgt het de status 'Wacht op nieuwe ML-export' en wordt het vergrendeld voor verdere bewerking."
          ),
          tekst(
            "Dat voorkomt dat het team blijft doorwerken op een versie die MijnLeerlijn al niet meer als actueel beschouwt. Het Hoofdgebied wordt pas weer bewerkbaar zodra de definitieve, nieuwe export uit MijnLeerlijn is teruggeüpload (hersynchroniseren)."
          ),
        ],
      },
    ],
  },
  {
    slug: "hoofdgebied-bewerken-na-export",
    title: "Kan ik een Hoofdgebied nog bewerken nadat het geëxporteerd is?",
    summary: "Nee — een geëxporteerd Hoofdgebied is vergrendeld totdat een nieuwe MijnLeerlijn-export is teruggehaald.",
    tags: ["hoofdgebiedstatus", "vergrendeld", "bewerken"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Nee, niet direct. Zodra een Hoofdgebied de status 'Wacht op nieuwe ML-export' heeft, staan de bewerkingsmogelijkheden (bewerken, splitsen, verwijderen, nieuw doel) voor dat Hoofdgebied uit."
          ),
          tekst("Zodra je een nieuwe, definitieve export uit MijnLeerlijn terugbrengt via een hersync, wordt het Hoofdgebied weer volledig bewerkbaar."),
        ],
      },
    ],
  },
  {
    slug: "wijzigingen-bij-opnieuw-importeren",
    title: "Wat gebeurt er met mijn wijzigingen als ik opnieuw importeer (hersync)?",
    summary: "Je eigen wijzigingen blijven behouden; de hersync koppelt ze aan de definitieve ML-ID's uit de nieuwe MijnLeerlijn-export.",
    tags: ["hersync", "import", "wijzigingen"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Je wijzigingen gaan niet verloren. Een hersync koppelt (matcht) de doelen uit de nieuwe MijnLeerlijn-export aan de doelen die je in Curriculum Werkplaats had staan, zodat de juiste, definitieve ML-ID's erbij komen."
          ),
          tekst("Na een geslaagde hersync begint een nieuwe, schone bewerkingsronde met deze versie als nieuwe basislijn."),
        ],
      },
    ],
  },
  {
    slug: "hoe-werkt-matching-bij-hersync",
    title: "Hoe worden doelen bij een hersync gematcht met bestaande doelen?",
    summary: "Curriculum Werkplaats probeert elk doel automatisch te koppelen; onduidelijke gevallen worden voorgelegd voor bevestiging.",
    tags: ["hersync", "matching", "ml-id"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Bij een hersync probeert Curriculum Werkplaats elk doel uit de nieuwe MijnLeerlijn-export te matchen met het bijbehorende doel dat al in de Werkplaats stond, zodat het juiste, definitieve ML-ID gekoppeld wordt."
          ),
          tekst("Gevallen waarin de match niet vanzelfsprekend is, worden niet automatisch geraden — die krijg je voorgelegd om zelf te bevestigen, voordat de hersync wordt afgerond."),
        ],
      },
    ],
  },
  {
    slug: "doel-kwijtgeraakt-terugzetten",
    title: "Ik ben per ongeluk een doel kwijtgeraakt — kan ik het terugzetten?",
    summary: "Ja: via de Historie van het doel ('Deze versie herstellen') of door de hele ronde terug te zetten naar de rondestart.",
    tags: ["historie", "herstellen", "verwijderen"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Ja. Zolang de bewerkingsronde nog open is (het Hoofdgebied dus nog niet geëxporteerd is), kun je een verwijderd doel terugzetten via de Historie van dat doel."
          ),
          stap('Open het doel (of zoek het op via de Wijzigingen-tab) en ga naar het tabblad "Historie".'),
          stap('Kies bij de versie van vóór de verwijdering "Deze versie herstellen".'),
        ],
      },
    ],
  },
  {
    slug: "verschil-rondestart-en-versie-herstellen",
    title: "Wat is het verschil tussen 'Herstellen naar rondestart' en 'Deze versie herstellen'?",
    summary: "Rondestart zet alle wijzigingen van de hele ronde terug; 'Deze versie herstellen' zet één doel terug naar één specifiek eerder moment.",
    tags: ["historie", "herstellen", "rondestart"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "'Herstellen naar rondestart' zet een doel in één keer terug naar de staat bij het begin van de huidige bewerkingsronde (dus naar de laatste import of hersync) — alle wijzigingen in deze ronde voor dat doel worden ongedaan gemaakt."
          ),
          tekst(
            "'Deze versie herstellen' (bij een specifieke regel in de Historie) is preciezer: dat zet het doel terug naar precies die ene gekozen tussenversie, ook als er daarna nog andere wijzigingen zijn geweest."
          ),
        ],
      },
    ],
  },
  {
    slug: "dubbele-deelgebiednaam",
    title: "Waarom kan ik geen twee Deelgebieden met dezelfde naam aanmaken?",
    summary: "Een Deelgebiednaam moet uniek zijn binnen het Hoofdgebied, om verwarring en dubbele indeling te voorkomen.",
    tags: ["deelgebied", "aanmaken", "uniek"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Binnen één Hoofdgebied moet elke Deelgebiednaam uniek zijn. Dat voorkomt dat er onbedoeld twee verschillende Deelgebieden met dezelfde naam naast elkaar ontstaan, wat bij het exporteren naar MijnLeerlijn tot verwarring zou leiden."
          ),
          tekst("Kies bij het aanmaken een naam die nog niet bestaat binnen dat Hoofdgebied, of gebruik het bestaande Deelgebied als dat inhoudelijk al past."),
        ],
      },
    ],
  },
  {
    slug: "ml-id-bij-splitsen",
    title: "Wat gebeurt er met het ML-ID als ik een doel splits?",
    summary: "Precies één resultaat mag het bestaande ML-ID behouden; de andere resultaten worden als nieuwe doelen behandeld.",
    tags: ["splitsen", "ml-id", "doel"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Bij het splitsen van een doel kies je zelf welk van de resulterende doelen het bestaande ML-ID van het origineel behoudt — dat doel wordt bij export gezien als 'hetzelfde' doel, alleen aangepast."
          ),
          tekst("De overige resultaten van de splitsing krijgen bij de eerstvolgende export geen bestaand ML-ID mee en worden dus als nieuwe doelen aan MijnLeerlijn doorgegeven."),
        ],
      },
    ],
  },
  {
    slug: "meerdere-leraren-tegelijk",
    title: "Kan ik meerdere leraren tegelijk in dezelfde omgeving laten werken?",
    summary: "Ja, dat is precies waar Curriculum Werkplaats voor bedoeld is — meerdere teamleden werken in dezelfde, gedeelde omgeving.",
    tags: ["leraren", "samenwerken", "gebruikers"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Ja. Curriculum Werkplaats is bedoeld voor gezamenlijk werken: alle teamleden loggen in met hetzelfde projectwachtwoord en kiezen daarna wie ze zijn. Wijzigingen van iedereen komen samen in dezelfde Werkplaats en dezelfde Wijzigingen-tab."
          ),
          tekst("Beheer wie er kan inloggen via de Leraren-pagina."),
        ],
      },
    ],
  },
  {
    slug: "collega-kan-niet-inloggen-deactiveren",
    title: "Een collega kan niet meer inloggen — hoe deactiveer of reactiveer ik iemand?",
    summary: "Ga naar Leraren en kies Deactiveren of Activeren bij de betreffende persoon — de historie blijft altijd bewaard.",
    tags: ["leraren", "deactiveren", "gebruikers"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          stap('Ga naar "Leraren" in het hoofdmenu.'),
          stap("Kies bij de betreffende persoon 'Deactiveren' om de toegang te stoppen, of 'Activeren' om die weer terug te geven."),
          tip("Deactiveren verwijdert niemand: alle eerdere wijzigingen van die persoon blijven gewoon zichtbaar in de historie en rapporten."),
        ],
      },
    ],
  },
  {
    slug: "wat-staat-er-op-rapporten-pagina",
    title: "Wat zie ik op de Rapporten-pagina precies?",
    summary: "Een leesbaar, inhoudelijk overzicht per afgeronde bewerkingsronde van alles wat er in die ronde is gewijzigd.",
    tags: ["rapporten", "wijzigingsoverzicht", "bewerkingsronde"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "De Rapporten-pagina toont per afgesloten bewerkingsronde (dus na een export/hersync) een overzicht van wat er in die ronde inhoudelijk is gebeurd: nieuwe, gewijzigde, gesplitste en verwijderde doelen, gegroepeerd en leesbaar geschreven."
          ),
          tekst("Dat maakt het makkelijk om achteraf, of met het team, terug te kijken wat er in een bepaalde ronde precies is aangepast."),
        ],
      },
    ],
  },
  {
    slug: "omgeving-gearchiveerd-wat-nu",
    title: "Wat gebeurt er als onze schoolomgeving wordt gearchiveerd?",
    summary: "Een gearchiveerde omgeving is niet meer te openen; neem contact op met MijnLeerlijn als dit onverwacht is.",
    tags: ["archief", "projectstatus", "beheer"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Een gearchiveerde omgeving kan (net als een geblokkeerde) tijdelijk niet meer geopend worden door het schoolteam — dit is een beheeractie die alleen via MijnLeerlijn wordt uitgevoerd, bijvoorbeeld aan het einde van een schooljaar."
          ),
          tekst("Denk je dat dit per ongeluk is gebeurd of wil je de omgeving weer geopend hebben, neem dan contact op met MijnLeerlijn via deze Helpdesk."),
        ],
      },
    ],
  },
  {
    slug: "wachtwoord-vergeten-curriculum-werkplaats",
    title: "Ik weet mijn wachtwoord niet meer — wat moet ik doen?",
    summary: "Het wachtwoord is bij niemand terug te vinden of te zien; neem contact op met MijnLeerlijn voor een reset.",
    tags: ["wachtwoord", "vergeten", "reset"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Het projectwachtwoord van je omgeving wordt uitsluitend versleuteld opgeslagen — ook MijnLeerlijn kan het bestaande wachtwoord niet opzoeken of laten zien, alleen resetten naar een nieuw wachtwoord."
          ),
          stap("Ga naar Projectinstellingen in Curriculum Werkplaats (als je nog ingelogd bent) voor de contactverwijzing, of neem rechtstreeks contact op met MijnLeerlijn via deze Helpdesk."),
          stap("Na een reset moet iedereen in het team opnieuw inloggen met het nieuwe wachtwoord."),
        ],
      },
    ],
  },
  {
    slug: "waarom-vijf-items-in-hoofdmenu",
    title: "Waarom staat er een hoofdmenu met maar vijf items, en waar is 'Activiteit' gebleven?",
    summary: "Het hoofdmenu is bewust beperkt tot de vijf belangrijkste onderdelen; het activiteitenlog bestaat nog en is bereikbaar via Rapporten.",
    tags: ["hoofdmenu", "navigatie", "activiteit"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Het hoofdmenu van Curriculum Werkplaats toont bewust maar vijf onderdelen: Dashboard, Werkplaats, Wijzigingen, Rapporten en Leraren — dat zijn de schermen die een schoolteam in de praktijk het vaakst nodig heeft."
          ),
          tekst(
            "Het kale, chronologische activiteitenlog is niet verdwenen: die route bestaat nog gewoon en is bereikbaar via een link op de Rapporten-pagina, alleen niet meer als los item in het hoofdmenu zelf."
          ),
        ],
      },
    ],
  },
  {
    slug: "hulp-krijgen-curriculum-werkplaats",
    title: "Hoe krijg ik hulp als ik er zelf niet uitkom?",
    summary: "Gebruik de 'Hulp nodig?'-link in de vaste header van Curriculum Werkplaats — die opent deze Helpdesk in een nieuw tabblad.",
    tags: ["hulp", "helpdesk", "contact"],
    sections: [
      {
        title: "Antwoord",
        blocks: [
          tekst(
            "Bovenin elk scherm van Curriculum Werkplaats staat een subtiele 'Hulp nodig?'-link. Die opent deze Helpdesk in een nieuw tabblad, zodat je werk in de Werkplaats niet verloren gaat."
          ),
          tekst(
            "Bij specifieke onderdelen (zoals doelen splitsen of exporteren naar MijnLeerlijn) staat er bovendien een directe link naar het bijbehorende onderwerp hier in de Helpdesk."
          ),
        ],
      },
    ],
  },
];
