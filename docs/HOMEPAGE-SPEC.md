# HOMEPAGE-SPEC.md — Functionele specificatie homepage kennisplatform

> Definitieve productbeslissingen voor het ontwikkelteam. Geen wireframe, geen code. Gebaseerd op Concept B (Ontdekken & begeleiden) met de dominante zoekbalk uit Concept A, en de kritische bijstellingen uit de UX-doorloop. Gebruikt [DATA-MODEL.md](DATA-MODEL.md), [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md), [UI-DESIGN.md](UI-DESIGN.md) en [UX-DESIGN.md](UX-DESIGN.md) als onderliggende bronnen. Nergens de woorden AI, AI-assistent of chatbot in gebruikersgerichte tekst.
>
> Elke keuze in dit document is definitief voor de MVP. Waar eerder twijfel bestond, is die hier opgelost — niet met meerdere opties, maar met één beslissing en de reden erbij.

---

## Definitieve volgorde van alle secties

1. Header (persistent/sticky)
2. Hero met zoekveld
3. Verder waar je gebleven was (conditioneel — alleen bij bestaande, lokale bezoekgeschiedenis)
4. Ontdek een onderwerp (categorieën + populaire vragen samengevoegd)
5. Net bijgewerkt
6. Footer

Geen procesuitleg-sectie (de eerder overwogen cyclus-illustratie), geen aparte contact-banner. Beide zijn bewust geschrapt — zie Ontwerpkeuzes.

---

## Sectie 1 — Header

**Waarom deze sectie bestaat**: oriëntatie en een permanente, betrouwbare uitweg — een gebruiker moet altijd weten waar ze is en altijd bij navigatie en contact kunnen, ongeacht waar ze op de pagina staat.

**Welk probleem hij oplost**: voorkomt dat iemand terug moet scrollen om ergens anders naartoe te gaan.

**Componenten**: logo (woordmerk + beeldmerk, variant-specifiek), navigatielinks (Categorieën, Updates, Contact), compact zoekicoon, variant-indicator (alleen zichtbaar als er meer dan één actieve variant is).

**Content**: statisch, wisselt alleen qua logo/naam per variant.

**Interacties**: klik logo → terug naar de homepage van de actieve variant. Klik zoekicoon → **scrollt smooth terug naar de hero en zet de cursor in het zoekveld** — er is precies één zoekveld op deze pagina, nooit een tweede kopie in de header. Klik navigatielink → paginanavigatie met een korte fade (200ms).

**Kleur**: witte achtergrond, donkerblauwe tekst/logo, dunne rand in grijs-100.

**Ruimte en hiërarchie**: laag visueel gewicht ten opzichte van de hero. Hoogte 64px, comprimeert naar 56px na een scroll-drempel van ~80px.

**Beslissing — blijft de header zichtbaar tijdens scrollen?** Ja, sticky, op elk schermformaat.

**Beslissing — blijft de zoekbalk altijd bovenaan zichtbaar?** Nee. Er is één zoekveld, in de hero. Dupliceren in een sticky balk zou een tweede, verwarrende invoerplek creëren en het zoekicoon-shortcut is voldoende.

---

## Sectie 2 — Hero met zoekveld

**Waarom deze sectie bestaat**: dit is het hart van de pagina — elke taak begint hier.

**Welk probleem hij oplost**: "ik heb een vraag, waar moet ik zijn" wordt binnen één oogopslag beantwoord.

**Componenten**: kop (H1), zoekveld met verzendicoon, drie voorbeeldvraag-chips, ondergeschikte tekstlink, mini-tagline met gradient-onderstreep, foto (bleedend over het kleurvlak), L-icoon-watermark, welkom-terug-regel (conditioneel).

**Content**:
- Kop (vast, verandert nooit): *"Vind direct antwoord op je vraag."*
- Subregel (vast): *"Typ wat je zoekt — we wijzen je meteen de juiste stap of uitleg."*
- Placeholder in het veld: variant-specifiek voorbeeld, bijv. *"Bijvoorbeeld: hoe koppel ik een doelenset aan een groep?"*
- Drie voorbeeldvraag-chips: redactioneel beheerd per variant (geen automatisch gegenereerde suggesties), maximaal zes woorden per chip.
- Mini-tagline: *"Kennis vanuit Inzicht"* met de dunne regenbooggradient-onderstreep.

**Interacties**: typen + Enter of klik verzendicoon → triggert de antwoord-state (zie Staten hieronder), in-place, geen paginanavigatie. Klik chip → vult het veld en verstuurt direct, geen tussenstap. Klik tekstlink *"Of ontdek een onderwerp"* → scrollt naar Sectie 4.

**Kleur**: donkerblauw hoofdvlak met een groen blok dat er in het logo-patroon achter/naast grijpt. Zoekveld wit met dunne rand, donkerblauwe focus-rand bij actief veld.

**Ruimte en hiërarchie**: het zoekveld is het grootste, meest geïsoleerde element op de pagina — groter en dominanter dan de kop erboven. Dit is een bewuste omkering van de gebruikelijke kop-eerst-hiërarchie: actie krijgt hier voorrang boven uitleg.

**Beslissing — verschijnen populaire vragen direct?** De voorbeeldvraag-chips wel, direct zichtbaar zonder klik. De volledige lijst "populaire vragen" (Sectie 4) staat verderop, niet in de hero — dat zou de hero overladen.

**Beslissing — autocomplete tijdens typen?** Nee. Geen suggestie-dropdown terwijl iemand typt. Dit is bewust: een suggestie-dropdown hoort bij zoekmachine-gedrag (trefwoorden), niet bij een vraag in gewone taal, en voegt complexiteit toe zonder aantoonbaar voordeel.

---

## Sectie 3 — "Verder waar je gebleven was" (conditioneel)

**Waarom deze sectie bestaat**: ondersteunt terugkerend gebruik zonder dat daar een persoonlijk account of serverkant-tracking voor nodig is.

**Welk probleem hij oplost**: "ik was hier vorige week ook, ik weet niet meer waar het stond."

**Componenten**: sectiekop, rij van maximaal vier compacte kenniskaarten.

**Content**: titel van het artikel, sectie/stap-context, "bekeken op [datum]" — uitsluitend gebaseerd op **lokale, client-side opgeslagen bezoekgeschiedenis** (browser-opslag). Geen server-side gebruikersprofiel, geen login vereist, geen tracking over apparaten of sessies heen.

**Interacties**: klik kaart → direct naar het artikel, gescrold naar de eerder bekeken sectie.

**Kleur**: witte achtergrond — rustpunt na het donkerblauw van de hero.

**Ruimte en hiërarchie**: compact en laag in gewicht, duidelijk ondergeschikt aan de hero. Dit is een bonus, geen hoofdmoment.

**Beslissing — wanneer verschijnt deze sectie?** Uitsluitend wanneer er minimaal één item in de lokale geschiedenis staat. Geen lege-staat-variant ("je hebt nog niets bekeken") — dat voegt ruis toe voor precies de groep (eerste bezoekers) die deze sectie sowieso nooit relevant vindt. Bij nul items: de sectie bestaat simpelweg niet op de pagina.

**Motivatie voor de client-side aanpak**: [PROJECT.md](PROJECT.md) sluit uitgebreide analytics/personalisatie expliciet uit van de MVP. Deze sectie blijft binnen scope omdat er niets over de gebruiker wordt opgeslagen of geanalyseerd buiten de eigen browser — geen nieuwe backend-infrastructuur, geen personalisatie-engine.

---

## Sectie 4 — "Ontdek een onderwerp"

**Waarom deze sectie bestaat**: vangt iedereen op die niet (meer) typt — bladeraars en mensen zonder scherp geformuleerde vraag.

**Welk probleem hij oplost**: "ik weet niet precies wat ik moet vragen."

**Componenten**: sectiekop met kort gradient-streepje, twee naast elkaar staande kolommen (desktop) / gestapeld (mobiel): "Onderwerpen" (categorie-kaarten) en "Populaire vragen" (klikbare tekstregels). Geen tabs — beide zijn gelijktijdig zichtbaar, geen extra klik om te wisselen.

**Content**: 6 tot 8 categorie-kaarten (icoon + titel, geen lange omschrijving — die hoort bij het categorie-overzicht zelf). 5 tot 6 populaire-vraag-regels, afkomstig uit dezelfde databron als het AI-feedback-beheerscherm (zie [UX-DESIGN.md](UX-DESIGN.md) scherm 14) — redactioneel gecureerd, niet automatisch/ongefilterd getoond.

**Interacties**: klik categorie-kaart → naar het categorie-overzicht. Klik populaire vraag → direct naar dezelfde antwoord-state als bij zelf typen — er is geen inhoudelijk verschil tussen een zelfgestelde en een aangeklikte vraag.

**Kleur**: lichtgrijsblauwe achtergrond (dezelfde toon als de cyclus-sectie op mijnleerlijn.nl) — bakent deze sectie af van de witte secties erboven/eronder en geeft ritme.

**Ruimte en hiërarchie**: de grootste sectie na de hero qua oppervlakte — dit is het browsing-hart van de pagina.

---

## Sectie 5 — "Net bijgewerkt"

**Waarom deze sectie bestaat**: toont dat de kennisbank leeft en actueel is, geeft een reden om terug te komen.

**Welk probleem hij oplost**: "is deze informatie nog wel actueel?"

**Componenten**: sectiekop met gradient-streepje, drie kaarten (titel, badge Nieuw/Bijgewerkt, datum), gradient-onderrand met "Lees verder".

**Content**: de drie meest recent gepubliceerde of gewijzigde artikelen die zichtbaar zijn voor de actieve variant (via de gedeelde samenvoegfunctie, zie [ARCHITECTURE.md](ARCHITECTURE.md)).

**Interacties**: klik kaart → naar het artikel.

**Kleur**: wit.

**Ruimte en hiërarchie**: kleiner dan Sectie 4, laatste inhoudelijke sectie vóór de footer. Bewust laag in de hiërarchie — dit is "leuk om te weten", geen taakkritisch element.

---

## Sectie 6 — Footer

**Waarom deze sectie bestaat**: secundaire navigatie, juridische links, en de permanente, rustige aanwezigheid van contact.

**Componenten, content, kleur**: ongewijzigd ten opzichte van de eerder vastgelegde footer-specificatie in [UI-DESIGN.md](UI-DESIGN.md) §26 — donkerblauw, logo, sitemap-links, social-iconen, volle-breedte gradient-lijn, copyright met "Onderdeel van sCoolsuite B.V."

**Beslissing — wanneer bied je contact aan?** Contact is hier altijd bereikbaar, rustig en zonder nadruk. De warme, proactieve contact-uitnodiging ("we denken met je mee") verschijnt **alleen** in de "geen antwoord gevonden"-staat — niet hier, en niet als aparte banner-sectie op de homepage. Zie Ontwerpkeuzes voor de motivatie.

---

## Staten van de homepage

### 1. Eerste bezoek
Hero toont de vaste kop, de drie voorbeeldvraag-chips, geen welkom-terug-regel. Sectie 3 ("Verder waar je gebleven was") bestaat niet. Sectie 4 toont de volledige, ongefilterde standaardset categorieën.

### 2. Terugkerende gebruiker
Een korte, klein gezette regel boven de kop: *"Welkom terug."* De kop zelf **verandert niet** — consistentie weegt zwaarder dan personalisatie-effectbejag. Sectie 3 is zichtbaar met maximaal vier recent bekeken artikelen. De voorbeeldvraag-chips blijven gewoon staan (ze zijn niet exclusief voor eerste bezoekers — een terugkerende gebruiker kan evengoed een nieuwe vraag hebben).

### 3. Gebruiker typt een vraag
Geen autocomplete-dropdown. Het veld blijft tijdens het typen op zijn plek. Bij versturen (Enter of verzendicoon): het veld verschuift rustig iets naar boven binnen de hero (blijft zichtbaar en direct bruikbaar voor een vervolgvraag), en direct daaronder verschijnt binnen circa 300ms een rustige "aan het zoeken"-indicator (geen generieke spinner — het veld "ademt" zachtjes, aansluitend bij de merktoon).

### 4. Gebruiker krijgt een antwoord
Het antwoord verschijnt in dezelfde hero-ruimte, met een korte fade-in (200ms), geen slide of bounce. Volgorde binnen het antwoordblok: eerst de antwoordtekst (grootst, meest prominent), daarna — kleiner en rustiger — de bron of bronnen, elk met titel, sectie/stap, link, en de datum van laatste inhoudelijke wijziging. Onderaan een kleine, laagdrempelige duim-omhoog/duim-omlaag-feedbackoptie.

### 5. Gebruiker krijgt meerdere antwoorden
Er verschijnt **altijd één samenhangend antwoord**, nooit een lijst losse "resultaten" zoals bij een zoekmachine. Als de retrieval meerdere relevante bronnen oplevert voor datzelfde antwoord, worden die als meerdere bronnenkaarten onder hetzelfde antwoord getoond. Als de vraag echt op meerdere, uiteenlopende onderwerpen raakt, wordt niet doorgevraagd (dat zou een gespreks-/chatgevoel geven dat we bewust vermijden) — in plaats daarvan krijgt het beste antwoord voorrang, met daaronder een korte regel *"Bedoelde je misschien ook…"* en één of twee links naar verwante onderwerpen.

### 6. Gebruiker vindt niets
Eerlijke, warme tekst — geen systeemfoutmelding. Toon: een collega die toegeeft het net niet zeker te weten en meteen meedenkt, bijvoorbeeld *"Dit weten we hier nog niet zeker genoeg om je een goed antwoord te geven."* Direct daaronder, zonder extra klik: een link naar het contactformulier met de gestelde vraag al voorgevuld, en — indien beschikbaar — één of twee half passende gerelateerde onderwerpen. Dit is het **enige** moment op de homepage waar contact proactief en met warme copy wordt aangeboden.

### 7. Gebruiker kiest een categorie
Navigatie naar het categorie-overzicht (zie [UX-DESIGN.md](UX-DESIGN.md) scherm 6) — een echte paginanavigatie, geen in-place transformatie zoals bij het zoekveld, met een korte fade (200–300ms) zodat de overgang niet als een harde sprong voelt.

### 8. Gebruiker opent een kennisartikel
Vanaf een bron-link in een antwoord, of vanaf een kaart in Sectie 3, 4 of 5: altijd dezelfde faded overgang. Als de binnenkomst via een antwoord-bron was: automatisch gescrold naar en kort gemarkeerd bij de exacte sectie/stap (zie [UX-DESIGN.md](UX-DESIGN.md) scherm 3).

---

## Detailbeslissingen (definitief)

| Vraag | Beslissing |
|---|---|
| Blijft de zoekbalk altijd bovenaan zichtbaar? | Nee — er is één zoekveld, in de hero. Sticky header heeft een kort-icoon ernaartoe. |
| Blijft de header zichtbaar tijdens scrollen? | Ja, sticky op elk schermformaat, comprimeert na scroll-drempel. |
| Verschijnen populaire vragen direct? | De drie voorbeeldvraag-chips in de hero: ja, altijd zichtbaar. De volledige lijst in Sectie 4: ja, zonder klik/tab. |
| Wanneer verschijnt "recent bekeken"? | Alleen met ≥1 item in de lokale (client-side) geschiedenis; anders bestaat de sectie niet. |
| Hoe ziet een kenniskaart eruit? | Witte kaart, 12px radius, schaduw sm (hover: schaduw md + lichte lift), icoon 24px (Lucide) + titel; compacte variant (Recent bekeken) zonder icoon, met datum; update-variant (Net bijgewerkt) met badge + datum + gradient-onderrand. |
| Wanneer toon je de bron? | Altijd, bij elk antwoord, nooit inklapbaar of optioneel. |
| Wanneer toon je "laatst bijgewerkt"? | Bij elke bronvermelding in een antwoord en bij elke kaart in "Net bijgewerkt". Niet op categorie-kaarten. |
| Wanneer bied je contact aan? | Altijd bereikbaar (header/footer), rustig. Proactief en met warme copy alleen in de "geen antwoord gevonden"-staat. |
| Hoe ziet de overgang homepage → antwoord eruit? | In-place transformatie van de hero: geen paginanavigatie, geen kleurwissel, veld schuift omhoog, antwoord verschijnt met een fade van 200ms. |
| Hoe ziet de overgang homepage → categorie/artikel eruit? | Echte paginanavigatie met een korte fade (200–300ms), geen abrupte sprong. |
| Verschijnt autocomplete tijdens typen? | Nee. |
| Auto-focus op het zoekveld bij laden? | Cursor-uitnodiging (bijv. zachte knipper), geen harde auto-focus die op mobiel het toetsenbord opent. |

---

## Sitemap van de homepage

```
/ (variant-herkend)
└── Homepage
    ├── Header
    │   ├── → Categorieën (categorie-overzicht)
    │   ├── → Updates
    │   └── → Contact (contactformulier)
    ├── Hero (zoekveld — in-place antwoord, geen eigen route)
    │   └── → [via bron-link] Artikel + sectie-anker
    ├── Verder waar je gebleven was (conditioneel)
    │   └── → Artikel + sectie-anker
    ├── Ontdek een onderwerp
    │   ├── Onderwerpen → Categorie-overzicht
    │   └── Populaire vragen → in-place antwoord (zelfde als hero)
    ├── Net bijgewerkt
    │   └── → Artikel
    └── Footer
        ├── → Categorieën, Updates, Contact (herhaald)
        └── → Privacyverklaring, Voorwaarden
```

---

## Componentenlijst (specifiek voor deze pagina)

- Sticky header met compact zoekicoon
- Hero-zoekveld (input + verzendicoon + focus-staat)
- Voorbeeldvraag-chip
- Ondergeschikte tekstlink
- Mini-tagline met gradient-onderstreep
- "Aan het zoeken"-indicator (ademend veld, geen spinner)
- Antwoordblok (antwoordtekst + één of meerdere bronnenkaarten + duim-omhoog/omlaag)
- "Geen antwoord gevonden"-blok (afwijkende, neutrale stijl — zie [UI-DESIGN.md](UI-DESIGN.md) §9)
- Kenniskaart — drie varianten: compact (Recent bekeken), standaard met icoon (Ontdek), update met badge+datum (Net bijgewerkt)
- Populaire-vraag-regel (tekstlink-stijl)
- Sectiekop met gradient-streepje
- Footer (herbruikt component, zie [UI-DESIGN.md](UI-DESIGN.md) §26)

---

## Volledige gebruikersflow

```
Bezoek homepage
  │
  ├─ Eerste bezoek → hero met chips, geen recent-bekeken
  └─ Terugkerend → welkom-terug-regel + recent-bekeken zichtbaar
  │
  ├─ Typt vraag / klikt chip / klikt populaire vraag
  │     └─ In-place antwoord
  │           ├─ Antwoord + bron(nen) → klik bron → artikel + sectie-anker
  │           ├─ Meerdere relevante bronnen → één antwoord, meerdere bronkaarten
  │           ├─ Ambigue vraag → beste antwoord + "Bedoelde je ook…"-links
  │           └─ Geen betrouwbaar antwoord → warme melding + voorgevuld contactformulier
  │
  ├─ Klikt "Of ontdek een onderwerp" / scrollt
  │     └─ Ontdek-sectie
  │           ├─ Klikt categorie → categorie-overzicht → artikel
  │           └─ Klikt populaire vraag → in-place antwoord (zelfde pad als hierboven)
  │
  ├─ Klikt kaart in "Net bijgewerkt" → artikel
  │
  └─ Op elk moment: klik Contact (header/footer) → contactformulier
```

---

## Ontwerpkeuzes inclusief motivatie

**De cyclus-illustratie is geschrapt van de homepage.** Ze legt uit hoe het systeem werkt — nuttig voor wie nieuwsgierig is naar het platform zelf, irrelevant voor iemand met een concreet probleem. Op de homepage is dat uitleg die niemand vroeg. Als deze content bewaard moet blijven, hoort ze op een aparte "Hoe werkt dit?"-pagina, gelinkt vanuit de footer — niet in deze spec, want buiten scope van de homepage.

**De contact-banner is geschrapt als aparte sectie.** Een grote, proactieve contact-uitnodiging vóórdat iemand iets geprobeerd heeft, spreekt de kernbelofte van deze pagina tegen: eerst zelf een antwoord vinden. De warmte van "we denken met je mee" wordt bewaard voor het enige moment waarop ze relevant én geloofwaardig is: wanneer er daadwerkelijk geen antwoord gevonden is.

**Categorieën en populaire vragen zijn samengevoegd tot één sectie.** Twee losse, opeenvolgende secties die in wezen dezelfde vraag beantwoorden ("wat kan ik hier vinden?") kosten een bladeraar twee besluitmomenten waar er maar één nodig is.

**De secundaire actie is een tekstlink, geen knop.** Twee gelijkwaardige knoppen naast elkaar in de hero zouden de net vastgestelde dominantie van het zoekveld ondermijnen. Precies één primaire actie, één duidelijk ondergeschikte link.

**"Recent bekeken" is client-side, niet server-side.** Dit houdt de functie volledig binnen de MVP-scope zoals vastgelegd in [PROJECT.md](PROJECT.md), waar uitgebreide analytics en personalisatie expliciet zijn uitgesteld — er wordt geen nieuwe backend-infrastructuur of gebruikersprofiel voor gebouwd.

**Antwoorden verschijnen in-place, niet op een aparte pagina.** Een paginanavigatie naar een "chat-scherm" zou de indruk wekken dat de gebruiker een ander soort tool binnenstapt. De homepage moet aanvoelen als één doorlopende ruimte, niet als een overstap naar een losstaand onderdeel.

**Meerdere bronnen leiden tot één antwoord, nooit tot een resultatenlijst.** Een lijst met losse "resultaten" hoort bij zoekmachine-gedrag; dit platform belooft één duidelijk antwoord met bewijs eronder, niet een keuzemenu dat de gebruiker zelf moet doorpluizen.

**Geen autocomplete tijdens typen.** Voegt UI-complexiteit toe die hoort bij trefwoord-zoeken, niet bij een vraag in gewone taal — zonder aantoonbaar voordeel voor deze specifieke interactie.
