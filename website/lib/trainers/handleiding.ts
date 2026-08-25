// Traineromgeving V2 — Handleiding (2026-08-25). Inhoud 1-op-1 overgenomen
// uit het door Michel goedgekeurde handleiding-artifact (14 hoofdstukken) —
// bewust NIET opnieuw geformuleerd. Platte Markdown, gerenderd door de al
// bestaande KennisMarkdown/KennisReader (app/(trainers)/trainers/(portal)/
// kennis/[id]/) — zelfde hergebruikprincipe als de rest van deze portal
// (géén tweede navigatie-/renderingsysteem naast wat er al staat voor
// Kennis/Basiskennis).
//
// Koppenniveaus volgen KennisMarkdown se afspraak (kennis-markdown.tsx):
// markdown "#" -> h2 op de pagina (elk van de 14 hoofdstukken), "##" -> h3
// (tussenkopjes). De paginatitel zelf (KennisReader se `titel`-prop) is de
// enige h1 — zie handleiding/page.tsx.
//
// Hoofdstuktitels zijn bewust GEEN "1. ..."/"2. ..." in de brontekst zelf:
// lib/content/markdown-headings.ts se slugifyHeading() zou een cijferprefix
// meenemen in de anchor (bv. "1-welkom-in-de-traineromgeving" i.p.v. het
// door Michel expliciet gevraagde "#een-verslag-maken-en-afronden"). Nummering
// in de inhoudsopgave komt uit de rendervolgorde (index + 1), niet uit de tekst.
//
// Tabellen/gekleurde kaders/pil-badges uit het artifact bestaan hier niet 1-
// op-1 na: KennisMarkdown se allowedElements (bewuste veiligheids-allowlist,
// zie aldaar) kent geen table/blockquote/custom-componenten. Content dus
// vertaald naar opsommingen (voor tabellen) en vetgedrukte labels als
// "Let op:"/"Tip:"/"Daarna:" (voor de kaders) — de INHOUD/betekenis is
// ongewijzigd, alleen het opmaakmiddel past bij de bestaande renderer.
//
// 📸-markeringen zijn letterlijke, zichtbare placeholders (geen verzonnen
// screenshots, opdrachtseis) — zodra er een echte afbeelding is, wordt zo'n
// regel simpelweg vervangen door standaard Markdown-afbeeldingssyntax
// (![...](...)), die KennisMarkdown al rendert (img toegevoegd aan de
// allowlist, zie kennis-markdown.tsx).
//
// Onderwerpen uit het opleverrapport se "Nog te verifiëren"-lijst zijn NIET
// als feit ingevuld — zie met name hoofdstuk 8 (telefoonnummer): expliciete
// placeholdertekst, geen verzonnen nummer.

export const HANDLEIDING_TITEL = "Handleiding Trainerportal";

export const HANDLEIDING_MARKDOWN = `
# Welkom in de traineromgeving

Je persoonlijke werkplek als MijnLeerlijn-trainer: je scholen, je trainingen, je verslagen en de kennis die je nodig hebt — allemaal op één plek, ook op je telefoon.

De traineromgeving is de plek waar jij als trainer bijhoudt welke trainingen je hebt, bij welke scholen, en waar je na afloop een verslag achterlaat. Je hoeft niets te weten van hoe het systeem daarachter werkt — je logt in, ziet wat er speelt, en werkt je taken af.

## Navigeren door de omgeving

Bovenin elke pagina zie je een vaste balk met acht onderdelen. Op je telefoon zie je alleen de icoontjes; op een groter scherm ook de tekst ernaast.

- **Dashboard** — je startpagina: wat speelt er vandaag, wat moet je nog afronden
- **Trainingen** — al je trainingen op een rij, chronologisch
- **Logboek** — tijdlijn van je verslagen en eigen aantekeningen
- **Scholen** — je scholen, met per school alle details
- **Kennis** — basiskennis over MijnLeerlijn en de kennisassistent
- **Bestanden** — je eigen documenten, en wat met je gedeeld is
- **Handleiding** — deze handleiding
- **Profiel** — je accountgegevens en wachtwoord

Rechtsboven in de balk staat ook altijd een **Uitloggen**-knop.

**Tip:** je kunt de traineromgeving net zo goed op je telefoon gebruiken als op een laptop — alle schermen zijn daarvoor gemaakt.

📸 *Screenshot: topnavigatie, desktop + mobiel*

# Inloggen en je profiel

Je account wordt voor je klaargezet door MijnLeerlijn. Hier lees je hoe je inlogt, wat je in je profiel ziet, en hoe je je wachtwoord wijzigt.

## Inloggen

Gebruik je vaste MijnLeerlijn-inlogadres. Je logt in met het e-mailadres en wachtwoord dat je van MijnLeerlijn hebt gekregen.

1. Vul je e-mailadres in.
2. Vul je wachtwoord in.
3. Klik op **Inloggen**.

**Daarna:** je komt direct op je dashboard terecht.

**Let op:** na een aantal mislukte inlogpogingen wordt je account tijdelijk geblokkeerd. Wacht een paar minuten en probeer het dan opnieuw.

## Je profiel

Onder **Profiel** zie je je eigen accountgegevens: je naam, je e-mailadres en — als dat bekend is — je mobiele nummer. Als je nummer gekoppeld is, zie je daar ook of het al actief staat voor telefonisch verslagen inspreken (zie hoofdstuk 8).

Deze gegevens kun je hier alleen bekijken, niet zelf wijzigen. Klopt je naam, e-mailadres of telefoonnummer niet (meer), neem dan contact op met MijnLeerlijn.

📸 *Screenshot: profielpagina met accountkaart*

## Wachtwoord wijzigen

Dit kun je wel altijd zelf doen, onderaan je profielpagina.

1. Vul je **huidige wachtwoord** in.
2. Vul je **nieuwe wachtwoord** in.
3. Typ het nieuwe wachtwoord nogmaals ter bevestiging.
4. Klik op **Wachtwoord wijzigen**.

**Daarna:** je ziet de melding "Je wachtwoord is gewijzigd." Je blijft gewoon ingelogd — een nieuwe keer inloggen is niet nodig.

Komen je nieuwe wachtwoord en de bevestiging niet overeen, dan krijg je daarvan direct een duidelijke melding en wordt er niets opgeslagen.

## Uitloggen

Klik rechtsboven op **Uitloggen**. Je komt terug op het inlogscherm.

# Je dashboard

Je startpagina na het inloggen. Bedoeld om in één oogopslag te zien wat er vandaag speelt en wat er nog moet gebeuren. Het dashboard staat altijd in dezelfde volgorde, van boven naar beneden — ook op je telefoon.

## Vandaag

Een lijst van je trainingen van vandaag. Staat er niets gepland, dan zie je "Geen trainingen gepland voor vandaag." Bij elke training van vandaag zie je meteen ook de status van het verslag en een knop om verder te gaan: nog geen verslag ("Maak verslag"), concept gestart ("Verslag afmaken"), ingesproken ("Controleren"), wordt afgerond ("Verslag afronden") of verslag klaar ("Verslag bekijken").

## Komende trainingen

Je eerstvolgende trainingen, met datum. Klik op een regel om naar de bijbehorende school te gaan. Staan er meer trainingen klaar dan hier passen, dan zie je een link **Bekijk alle trainingen** die je naar het volledige overzicht stuurt (hoofdstuk 4).

## To do

Deze sectie verschijnt alleen als er daadwerkelijk iets voor je openstaat — is er niets, dan zie je dit blok simpelweg niet. Hier verzamelt MijnLeerlijn alles wat aandacht nodig heeft, over al je scholen heen:

- **Ingesproken op [datum] → Controleren** — je hebt een verslag telefonisch ingesproken; het staat klaar om te controleren en op te slaan
- **Concept gestart op [datum] → Verslag afmaken** — je bent begonnen aan een verslag maar hebt het nog niet afgerond
- **Training was op [datum] → Verslag maken** — een training is al geweest, maar er is nog helemaal geen verslag voor
- **Nog niet volledig afgerond → Verslag afronden** — je verslagtekst is al opgeslagen, maar het laatste opslagstapje is nog niet gelukt; probeer het opnieuw vanaf de verslagpagina

Klik op de knop achter een item om er direct mee verder te gaan.

## Recente activiteit

Een tijdlijn van je laatste verslagen en logboekaantekeningen, met een gekleurd label per soort (Training, Telefonisch, Helpdesk, Overleg, Notitie, Overig). Rechtsboven deze sectie staat een knop **Logboekitem** om direct een nieuwe aantekening toe te voegen (zie hoofdstuk 9).

## Statistieken

Drie kleine tellers onderaan: het totaal aantal trainingen, het aantal scholen (klik erop voor je scholenoverzicht), en het aantal verslagen dat je hebt afgerond.

## Vraag

Helemaal onderaan staat een vraagblok waarmee je een vraag kunt stellen over je eigen scholen en trainingen — bijvoorbeeld "wat staat er deze week nog open?" Je kunt kiezen of je vraag over al je scholen gaat, of over één specifieke school.

**Let op: dit is niet de kennisassistent.** Dit vraagblok kijkt uitsluitend naar jóuw scholen en trainingen — het geeft geen antwoord op algemene vragen over MijnLeerlijn en verwijst niet naar kennisartikelen. Voor dat laatste ga je naar Kennis (hoofdstuk 13). Ook onthoudt dit blok het gesprek niet: elke vraag begint opnieuw.

1. Kies eventueel eerst een school uit de lijst (of laat "Alle scholen" staan).
2. Typ je vraag.
3. Klik op **Vraag**.

**Daarna:** het antwoord verschijnt eronder. Klik op **Nieuwe vraag stellen** om opnieuw te beginnen.

📸 *Screenshot: volledig dashboard, met To do-sectie gevuld*

# Werken met je trainingen

Eén overzicht met al je trainingen bij elkaar, ongeacht bij welke school. Handig als je niet per school wilt zoeken, maar gewoon wilt zien wat er allemaal loopt.

Ga naar **Trainingen** in de bovenbalk. Je ziet je trainingen verdeeld over kopjes, in deze volgorde:

1. **Verslag nog invullen** — trainingen die aandacht nodig hebben
2. **Vandaag**
3. **Gepland** — trainingen met een toekomstige datum
4. **Nieuw** — nog geen datum gepland
5. **Gedaan**
6. **Geannuleerd**

Alleen kopjes met trainingen erin worden getoond. Klik op een kopje om die groep in- of uit te klappen — de urgente groepen (Verslag nog invullen, Vandaag, Gepland) staan standaard open, de rest staat standaard dicht zodat de pagina overzichtelijk blijft.

Klik op een training om naar de bijbehorende school te gaan — vanaf daar kun je verder (zie hoofdstuk 5 en 6).

📸 *Screenshot: trainingenoverzicht met een paar opengeklapte secties*

# Werken met scholen

Elke school waar je traint heeft een eigen dossier: trainingen, logboek, bestanden en een eigen vraagassistent.

## Mijn scholen

Ga naar **Scholen** voor een overzicht van al je scholen als kaarten, met een zoekbalk erboven. Elke kaart toont de schoolnaam, onderwijstype en plaats, hoeveel trainingen er open, gepland en gedaan zijn, en je eerstvolgende training bij die school, indien bekend. Klik op een kaart om naar het schooldossier te gaan.

**Let op:** staat er onderaan een blok met scholen die "mogelijk ook van jou" zijn? Dat zijn scholen die niet met zekerheid aan jouw account gekoppeld konden worden. Ze zijn niet aanklikbaar. Klopt zo'n school, vraag dit dan na bij de administratie.

## Het schooldossier

Bovenaan zie je de schoolnaam met onderwijstype, plaats en eventueel de fase waarin de school zit. Rechtsboven staat een knop **Logboekitem** om snel een aantekening voor déze school toe te voegen (hoofdstuk 9).

Heb je recent een verslag telefonisch ingesproken voor een training bij deze school, dan zie je daaronder een apart, opvallend blok **Ingesproken verslag controleren** — klik op **Controleren** om het af te ronden.

De pagina zelf toont standaard je **trainingen bij deze school**, ingedeeld op dezelfde manier als in hoofdstuk 4 (Verslag nog invullen / Vandaag / Gepland / Nieuw / Gedaan / Geannuleerd). Daarboven vind je nog vier tabbladen met aanvullende informatie:

- **Vraag aan AI** — dezelfde vraagassistent als op je dashboard (hoofdstuk 3), maar dan automatisch gericht op déze school — bijvoorbeeld "wat moet ik bij de volgende training weten?"
- **Logboek** — eerdere notities en berichten die bij deze school horen. Dit is alleen-lezen en is iets anders dan je eigen Logboek in de bovenbalk — zie hieronder
- **Bestanden** — documenten bij deze school — zie hoofdstuk 10
- **Contactpersoon** — de contactpersoon van de school, indien bekend

**Let op: twee dingen heten "Logboek".** Het Logboek-tabblad in een schooldossier is een alleen-lezen overzicht van eerdere aantekeningen bij die school — je kunt er zelf niets aan toevoegen of wijzigen. Je eigen Logboek in de bovenbalk (hoofdstuk 9) is iets anders: dat is jóuw persoonlijke tijdlijn van verslagen en notities, en daar kun je wel zelf items aan toevoegen.

📸 *Screenshot: schooldossier met tabbladen, en los de "Ingesproken verslag controleren"-banner*

# Een training voorbereiden

Bij elke training in een schooldossier kun je zelf de status en de datum bijhouden — handig om je planning actueel te houden. Dit doe je rechtstreeks in de trainingsrij, in het schooldossier (hoofdstuk 5) — je hoeft er geen apart scherm voor te openen.

## Status wijzigen

1. Klik op het gekleurde statuslabel achter de training.
2. Kies een status: Nieuw, Gepland, Gedaan of Geannuleerd.

**Daarna:** je ziet kort "Bezig met opslaan…" en daarna een bevestiging. Is het gelukt, dan sluit het venstertje vanzelf.

## Datum plannen of wijzigen

1. Klik op de datum achter de training (of op **Datum plannen** als er nog geen datum is).
2. Kies een datum in de kalender.

**Daarna:** de datum wordt opgeslagen. Kies je een datum voor een training die nog geen status had, dan zet het systeem de status er automatisch bij op Gepland.

Een datum weer verwijderen kan met de link **Datum verwijderen** onderin hetzelfde venstertje.

**Let op:** is een wijziging tegelijk door iemand anders gedaan, dan krijg je dat duidelijk te zien: wat er nu geldt, en wat jij probeerde te wijzigen. Lukt het opslaan niet, dan verschijnt een knop om het opnieuw te proberen — je wijziging gaat niet verloren.

Deze knoppen zijn niet bij elke training beschikbaar. Zie je in plaats daarvan alleen platte tekst (geen klikbare datum/status), dan kan deze specifieke training niet vanuit de portal bewerkt worden.

📸 *Screenshot: statuskeuze-venster open, en los het datumkeuze-venster*

# Een verslag maken en afronden

Na een training leg je vast wat er is gebeurd. Dit gaat in drie stappen: aantekeningen typen, het voorstel controleren, en definitief opslaan.

## Een verslag starten

Open de training waarvoor je een verslag wilt maken (via je dashboard, Trainingen, of het schooldossier) en klik op **Verslag maken**. Je komt op de verslagpagina met drie stappen bovenaan: 1. Aantekeningen → 2. Voorstel controleren → 3. Opslaan.

## Stap 1 — Jouw aantekeningen

1. Typ in het tekstvak kort wat er tijdens de training is gebeurd. Er staan een paar denkvragen onder het vak als geheugensteun (wat heb je behandeld, welke keuzes zijn gemaakt, wat ging goed, enzovoort).
2. Klik op **Maak verslag**.

**Daarna:** MijnLeerlijn structureert je aantekeningen automatisch tot een nette verslagtekst. Je gaat door naar stap 2. Je aantekeningen worden trouwens ook al automatisch tussentijds opgeslagen terwijl je typt — onderin het vak zie je "Concept opgeslagen".

## Stap 2 — Voorstel controleren

Je ziet nu de opgestelde verslagtekst in een tekstvak. Pas hem vrij aan — dit wordt de definitieve tekst.

- **Opnieuw AI laten structureren** — genereert de tekst opnieuw op basis van je aantekeningen
- **Terug naar oorspronkelijke invoer** — ga terug naar stap 1 om je aantekeningen aan te passen

Tevreden? Klik op **Definitief opslaan**.

**Daarna:** het verslag wordt opgeslagen bij zowel de training als in het schoollogboek. Je ziet een groene bevestiging: "Verslag ingevuld — opgeslagen bij de training en in het schoollogboek."

**Let op: definitief is definitief.** Zodra je op Definitief opslaan hebt geklikt, kun je de tekst niet meer aanpassen. Controleer je tekst dus goed voordat je deze stap zet.

## Als het opslaan niet in één keer helemaal lukt

Soms lukt het opslaan bij de training of bij de school niet meteen (bijvoorbeeld door een tijdelijke storing). Dan zie je een melding met de status per onderdeel en een knop **Opnieuw proberen**. Je verslagtekst zelf ben je nooit kwijt — die staat al vast.

## Een verslag bekijken dat al klaar is

Is een verslag al eerder afgerond, dan opent dezelfde pagina meteen in alleen-lezen weergave met de definitieve tekst.

## Een concept verwijderen

Ben je ergens onderweg in stap 1 of 2 en wil je helemaal opnieuw beginnen (of wil je het concept niet meer)? Klik op **Concept verwijderen** onderaan. Je krijgt eerst een bevestigingsvraag. Dit kan alleen zolang het verslag nog niet definitief is opgeslagen.

📸 *Screenshot: alle drie stappen van de verslag-editor, en los de groene "klaar"-melding*

# Een verslag telefonisch inspreken

Geen zin of tijd om te typen? Als telefonisch inspreken voor jouw account beschikbaar is, kun je een verslag ook gewoon inbellen.

**Let op: nog niet voor iedereen.** Deze functie is beschikbaar per trainer. Staat er op je profielpagina niets over telefonisch inspreken, of hoor je aan de telefoon dat het "nog niet beschikbaar" is voor je account, neem dan contact op met MijnLeerlijn.

## Zo werkt het

1. Bel met het mobiele nummer dat bij je account bekend is naar **[telefoonnummer nog aan te vullen door MijnLeerlijn]**. Je wordt automatisch herkend aan je telefoonnummer; je hoeft niets in te typen om jezelf bekend te maken.
2. Je hoort een begroeting met je voornaam, gevolgd door je meest recente training(en). Bij één training: "Is dit de training waarvoor je een verslag wilt inspreken? Druk 1 voor ja, druk 2 voor nee." Bij meerdere: je hoort per training een cijfer om te drukken.
3. Bevestig de juiste training met de toetsen van je telefoon.
4. Je hoort: "Spreek je verslag in na de piep. Sluit af met een hekje (#)." Spreek daarna gewoon je verslag in, net zoals je het zou vertellen.
5. Sluit af door op het hekje (#) te drukken.

**Daarna:** je hoort "Bedankt. Je verslag wordt verwerkt en staat straks voor je klaar om te controleren." Je kunt ophangen.

## Opnieuw beginnen tijdens het gesprek

Nog niet tevreden over je opname en wil je opnieuw? Druk op het sterretje (*) vóórdat je ophangt. Dit kan één keer per gesprek.

## Je ingesproken verslag terugvinden en afronden

Je telefonische opname wordt automatisch omgezet naar een geschreven concept. Dit vind je op drie plekken terug: bovenaan je dashboard bij de training van vandaag (herkenbaar aan het telefoonicoon en de tekst "Ingesproken"), in het blok To do op je dashboard, en bovenaan het schooldossier van de betreffende school, in het blok "Ingesproken verslag controleren".

Klik op **Controleren**. Je komt in dezelfde verslagpagina als bij een getypt verslag terecht (hoofdstuk 7), met bovenaan een label **Bron: telefonisch ingesproken**. Je AI-voorstel staat al klaar in stap 2 — lees het na, pas aan waar nodig, en klik op **Definitief opslaan**. Wil je precies teruglezen wat je hebt ingesproken, klik dan op **Transcript bekijken**.

**Tip:** ook een telefonisch ingesproken concept kun je, zolang het nog niet definitief is opgeslagen, verwijderen met **Concept verwijderen** op de verslagpagina.

📸 *Screenshot: het "Ingesproken verslag controleren"-blok op dashboard en schooldossier*

# Het logboek gebruiken

Je persoonlijke tijdlijn: al je verslagen en losse aantekeningen, chronologisch op een rij.

## De tijdlijn bekijken

Ga naar **Logboek** in de bovenbalk. Je ziet al je activiteit op volgorde van datum, met een gekleurd label per soort: Training, Telefonisch, Helpdesk, Overleg, Notitie of Overig. Klik op een regel om ernaartoe te gaan (bijvoorbeeld naar het bijbehorende verslag).

## Een nieuw logboekitem toevoegen

Gebruik dit voor contactmomenten of aantekeningen die los staan van een trainingsverslag — bijvoorbeeld een telefoontje met een school, of een overleg.

1. Klik op **+ Logboekitem** (op de Logboekpagina, je dashboard, of vanuit een schooldossier).
2. Kies de **school** waar het bij hoort.
3. Kies het **type contact**: Telefonisch, Helpdesk, Overleg, Notitie of Overig.
4. Vul **datum en tijd** in.
5. Schrijf je **notitie** (maximaal 4000 tekens — je ziet de teller onder het vak).
6. Klik op **Logboekitem opslaan**.

**Daarna:** ben je vanaf een school begonnen, dan kom je terug in dat schooldossier. Anders kom je terug op de Logboekpagina, met je nieuwe item bovenaan.

**Let op:** je kunt een logboekitem dat je hebt toegevoegd, zelf niet meer aanpassen of verwijderen. Staat er een fout in, neem dan contact op met MijnLeerlijn.

📸 *Screenshot: logboektijdlijn en het "nieuw logboekitem"-formulier*

# Bestanden bij een school

Documenten die specifiek bij één school horen, bewaar je in het tabblad Bestanden van dat schooldossier.

## Een bestand bekijken en downloaden

Ga naar het schooldossier van de school en open het tabblad **Bestanden**. Filter eventueel op categorie met het uitklapmenu bovenaan. Klik op **Download** achter een bestand om het te openen of op te slaan.

## Een bestand uploaden

1. Klik op **Bestand uploaden**.
2. Kies het bestand van je apparaat.
3. Geef het een **titel**.
4. Kies een **categorie**: Curriculum, Presentatie, Trainingsmateriaal, Werkdocument, Export, Schooldocument of Overig.
5. Koppel er optioneel een **training** aan.
6. Voeg optioneel een korte **omschrijving** toe.
7. Klik op **Uploaden**.

**Daarna:** het bestand verschijnt meteen bovenaan de lijst, zichtbaar voor iedereen die dit schooldossier kan zien.

Ondersteund: de gangbare documenttypen zoals PDF, Word, Excel en PowerPoint. Een bestand mag maximaal 25 MB groot zijn.

## Een bestand verwijderen

Je kunt alleen bestanden verwijderen die je zelf hebt geüpload — herkenbaar aan het prullenbakicoontje dat alleen bij jouw eigen bestanden verschijnt. Klik erop om het bestand te verwijderen.

📸 *Screenshot: bestandenlijst in een schooldossier, met het uploadformulier open*

# Je eigen bestanden en bestanden delen

Voor algemeen trainingsmateriaal dat niet bij één specifieke school hoort. Ga naar **Bestanden** in de bovenbalk. Je ziet twee lijsten: **Mijn bestanden** (wat jij hebt geüpload) en **Met mij gedeeld** (wat anderen met jou gedeeld hebben).

## Een bestand uploaden

1. Klik op **Bestand uploaden**.
2. Kies het bestand, geef een **titel** en kies een **categorie** (zelfde categorieën als bij schoolbestanden).
3. Voeg optioneel een **omschrijving** toe.
4. Kies bij **Zichtbaarheid**: Alleen voor mij, of Delen met groep(en).
5. Kies bij delen met een groep welke van jouw groep(en) het bestand mogen zien (zie hieronder).
6. Klik op **Uploaden**.

**Daarna:** het bestand staat direct bovenaan Mijn bestanden, met een regel die toont of het privé is of met welke groep het gedeeld is.

**Let op:** je kunt alleen delen met groepen waar je zelf al lid van bent — die worden automatisch aangeboden bij het uploadformulier. Zit je nog in geen enkele groep, dan staat die keuze uitgeschakeld. Groepen zelf stel je niet zelf samen; neem daarvoor contact op met MijnLeerlijn.

## Downloaden en verwijderen

Downloaden kan bij elk bestand met de knop **Download**. Verwijderen kan alleen bij bestanden die je zelf hebt geüpload — bestanden die met jou gedeeld zijn kun je downloaden, maar niet verwijderen.

📸 *Screenshot: "Bestanden"-pagina met beide secties, en het uploadformulier met zichtbaarheidskeuze*

# Kennis gebruiken

Basiskennis over MijnLeerlijn en onze werkwijze, geschreven speciaal voor trainers. Ga naar **Kennis** in de bovenbalk. Onderaan de pagina (onder het vraagblok uit hoofdstuk 13) staat **Basiskennis**: een doorzoekbare lijst met artikelen.

## Een artikel zoeken en lezen

1. Typ een zoekterm in de zoekbalk. Er wordt zowel op documenttitels als op hoofdstuktitels gezocht.
2. Klik op een resultaat om het artikel te openen.

In een artikel zie je op een groter scherm een inhoudsopgave naast de tekst; het hoofdstuk waar je op dat moment leest wordt daarin gemarkeerd terwijl je scrolt. Op je telefoon opent een knop **Inhoud** bovenaan hetzelfde menu als uitklapmenu.

📸 *Screenshot: basiskennislijst met zoekresultaat, en een geopend artikel met inhoudsopgave*

# Vragen stellen aan de kennisassistent

Bovenaan de Kennis-pagina staat een apart vraagblok: "Stel een vraag over MijnLeerlijn en onze werkwijze." Dit is de kennisassistent.

**Tip: het verschil met "Vraag aan AI".** De kennisassistent hier beantwoordt algemene vragen over MijnLeerlijn en onze werkwijze, gebaseerd op de basiskennisartikelen — en verwijst je naar het artikel waar het antwoord vandaan komt. Het vraagblok op je dashboard/schooldossier (hoofdstuk 3) doet het omgekeerde: dat kijkt naar jóuw eigen scholen en trainingen, en verwijst nergens naar. Gebruik ze dus voor verschillende dingen.

1. Typ je vraag, bijvoorbeeld "hoe begeleid ik een school bij het voorbereiden van een periode?"
2. Klik op **Vraag**.

**Daarna:** je krijgt een antwoord, en eronder — als dat van toepassing is — een lijst **Gebruikte kennisartikelen**. Klik op **Bekijk hoofdstuk** of **Bekijk artikel** om direct naar de bron te springen.

Klik op **Nieuwe vraag stellen** om opnieuw te beginnen. Ook hier: er wordt geen gespreksgeschiedenis onthouden, elke vraag staat op zichzelf.

📸 *Screenshot: kennisassistent met een beantwoorde vraag inclusief bronverwijzing*

# Veelgestelde vragen en problemen

Loop je ergens tegenaan? Kijk eerst hier — de meeste vragen zijn hieronder al beantwoord.

## Ik kan niet inloggen

Controleer of je je vaste MijnLeerlijn-e-mailadres en wachtwoord gebruikt. Na een aantal mislukte pogingen wordt je account tijdelijk geblokkeerd — wacht een paar minuten en probeer opnieuw. Blijft het mislukken, neem dan contact op met MijnLeerlijn.

## Ik krijg een melding dat mijn account gedeactiveerd is

Dan is je account tijdelijk buiten gebruik gesteld. Neem contact op met de beheerder bij MijnLeerlijn.

## Ik zie een school niet die wel van mij is

Neem contact op met de administratie — zij kunnen de koppeling tussen jou en de school controleren en herstellen.

## De pagina kan mijn gegevens niet laden

Je ziet dan een rustige melding "Er ging iets mis" met een knop **Probeer opnieuw**. Dit komt meestal door een tijdelijke verbindingsstoring. Klik op de knop; lukt het na een paar keer nog steeds niet, neem dan contact op met MijnLeerlijn.

## Ik wil mijn naam, e-mailadres of telefoonnummer wijzigen

Dat kan niet zelf via de portal. Neem contact op met MijnLeerlijn — zij passen dit voor je aan.

## Ik ben een concept verslag kwijt / wil het niet meer

Zolang een verslag nog niet definitief is opgeslagen, kun je het zelf verwijderen met **Concept verwijderen** op de verslagpagina (zie hoofdstuk 7).

## Ik heb een fout logboekitem toegevoegd

Logboekitems kun je zelf niet meer wijzigen of verwijderen na het opslaan. Neem contact op met MijnLeerlijn.

## Telefonisch inspreken werkt niet voor mij

Deze functie staat niet standaard voor iedereen aan. Neem contact op met MijnLeerlijn om te vragen of dit voor jouw account geactiveerd kan worden.

## Nog steeds vastgelopen?

Stel je vraag aan de kennisassistent (hoofdstuk 13) — mogelijk staat het antwoord al in de basiskennis. Kom je er niet uit, neem dan gewoon contact op met MijnLeerlijn.
`.trim();
