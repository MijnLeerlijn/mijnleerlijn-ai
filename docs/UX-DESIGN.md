# UX-DESIGN.md — Complete productervaring MijnLeerlijn Kennisplatform

> Dit document beschrijft **schermen, niet code**. Het is geschreven zodat een UI-designer het rechtstreeks kan gebruiken als basis voor Figma-wireframes. Geen React, geen HTML, geen afbeeldingen — alleen tekstuele wireframes, componentbeschrijvingen en gedrag.
>
> Gebaseerd op: [PROJECT.md](PROJECT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DATA-MODEL.md](DATA-MODEL.md) (canoniek datamodel), [CONTENT-MODEL.md](CONTENT-MODEL.md), [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md), [TODO.md](TODO.md), [CLAUDE.md](../CLAUDE.md), en het brandbook (`Brand/mijn-leerlijn-brandbook .pdf`). Waar dit document een merkregel noemt, is die afkomstig uit het brandbook of uit [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) — er wordt hier niets nieuws over branding verzonnen.

## Leeswijzer

- **Deel A — Publieke schermen (1–9)**: geen login vereist, gericht op leerkrachten, IB'ers, kwaliteitscoördinatoren, schoolleiders, schoolbeheerders (zie [PROJECT.md](PROJECT.md) §Doelgroep).
- **Deel B — Beheeromgeving (10–15)**: login + rol vereist (`editor`/`admin`, zie [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md)), gericht op de oprichter en enkele collega's.
- Elk scherm volgt hetzelfde vaste sjabloon: doel, doelgroep, wireframe, componenten, gebruikersflow, primaire/secundaire acties, AI-interactie, mobiele/desktop versie, toegankelijkheid, foutmeldingen, lege statussen, loading states.
- Na de 15 schermen: een complete sitemap, alle navigatie, en een componentenbibliotheek.

## Ontwerpprincipes (samengevat uit DESIGN-SYSTEM.md)

- **Rustig, helder, professioneel** — kleur wordt accentmatig ingezet, nooit als grote vlakvulling in de werkinterface.
- **Inter** als lettertype, **Lucide** als iconenset (beide aanvullende keuzes, geen brandbook-regel).
- Kleurenpalet uit het brandbook: rood `#E10919`, oranje `#EC6608`, geel `#FEC905`, groen `#53AC32`, blauw `#1588C9`, donkerblauw `#002641`, plus de vaste 45°-regenbooggradient als dunne accentbalk.
- Slogan "Onderwijs vanuit **Inzicht**" — bruikbaar op de homepage-hero, niet op elk scherm herhaald.
- Content is een **boom** (sectie → stap/blok) — de UI moet die structuur letterlijk weerspiegelen, niet platslaan tot losse tekst.
- **Bronvermelding is nooit optioneel** waar AI-content getoond wordt (zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md)).
- Basisstijl blijft **herkenbaar MijnLeerlijn** in elke variant; alleen logo/productnaam/accentkleur wisselen (zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md)).

---

# Deel A — Publieke schermen

## 1. Homepage

**Doel**: startpunt van het kennisplatform; snel naar een antwoord via zoeken, AI-chat of bladeren; overzicht van categorieën en recente updates.

**Doelgroep**: alle publieke bezoekers van een specifieke variant (het domein/subdomein bepaalt welke variant al herkend is vóór deze pagina laadt, zie [ARCHITECTURE.md](ARCHITECTURE.md)).

**Wireframe (desktop, tekstueel)**:
```
┌─────────────────────────────────────────────────────────────┐
│ Header: [Logo variant]        Zoeken▢       Contact  [Variant▾]│
├─────────────────────────────────────────────────────────────┤
│                    (dunne gradient-accentbalk)                 │
│                "Onderwijs vanuit Inzicht"                       │
│           "Waarmee kunnen we je helpen?"                        │
│           [ Grote zoekbalk met AI-hinttekst          🔍 ]         │
├─────────────────────────────────────────────────────────────┤
│  Categorie-kaarten (grid, 3–4 kolommen)                          │
│  [icoon] Categorie / korte uitleg   [icoon] Categorie / uitleg    │
│  [icoon] Categorie / korte uitleg   [icoon] Categorie / uitleg    │
├─────────────────────────────────────────────────────────────┤
│  "Nieuw of bijgewerkt" — 3 kaarten, link naar Updates-scherm       │
├─────────────────────────────────────────────────────────────┤
│  AI-teaserkaart: "Stel je vraag direct aan de AI-assistent"        │
│  [ Start een gesprek ]                                             │
├─────────────────────────────────────────────────────────────┤
│  Footer: variant-info · sCoolsuite B.V. · links · social            │
└─────────────────────────────────────────────────────────────┘
```

**Componenten**: header/nav, grote zoekbalk, categorie-kaart, "uitgelicht"-contentkaart, AI-teaserkaart, footer, variant-indicator. Zie Componentenbibliotheek.

**Gebruikersflow**: bezoeker landt op de homepage van de al-herkende variant → typt in de zoekbalk, of klikt een categorie, of start de AI-chat, of gaat direct naar contact via de header.

**Primaire acties**: zoeken starten; AI-chat starten.

**Secundaire acties**: categorie openen; naar Updates; naar Contact.

**AI-interactie**: de zoekbalk toont een voorbeeldzin die aangeeft dat je in gewone taal mag typen (bijv. "Stel je vraag, bijvoorbeeld 'Hoe koppel ik een doelenset aan een groep?'"); de AI-teaserkaart opent scherm 4.

**Mobiele versie**: header wordt hamburgermenu + logo + zoekicoon; categorie-grid wordt één kolom, gestapeld; AI-teaserkaart blijft dicht onder de zoekbalk zichtbaar.

**Desktop versie**: leescontainer max-breedte ± 1200px; categorie-grid 3–4 kolommen afhankelijk van het aantal categorieën van de actieve variant; kaarten met subtiele hover-lift.

**Toegankelijkheid**: zoekbalk met echt label (niet alleen placeholder); "skip to content"-link vóór de header; logische focusvolgorde (header → zoeken → categorieën → footer); AA-kleurcontrast op alle kaarten en de gradientbalk-tekst.

**Foutmeldingen**: content kan niet laden → "We kunnen de pagina nu niet volledig laden. Probeer het opnieuw." met retry-knop; zoekbalk zelf toont hier geen foutmelding (zie scherm 2).

**Lege statussen**: variant zonder geconfigureerde categorieën (bijv. gloednieuwe variant) → toon alleen zoekbalk, AI-teaserkaart en contactlink, geen lege categorie-sectie.

**Loading states**: skeleton-kaarten voor categorieën en "nieuw/bijgewerkt"; de zoekbalk is direct interactief, ook terwijl de rest van de pagina nog laadt.

---

## 2. Zoekresultaten

**Doel**: snel relevante artikelen/stappen vinden op basis van een zoekterm.

**Doelgroep**: publieke gebruiker die zoekt via de homepage- of globale zoekbalk.

**Wireframe**:
```
┌───────────────────────────────────────────────────┐
│ Header met zoekbalk (ingevuld met de zoekterm)        │
├───────────────────────────────────────────────────┤
│ "Resultaten voor 'doelenset koppelen'" (12 resultaten)  │
│ [Categorie ▾]   [Type: handleiding/stap ▾]              │
├───────────────────────────────────────────────────┤
│ Resultaatkaart: titel + sectie/stap-context + snippet    │
│ Resultaatkaart: titel + sectie/stap-context + snippet    │
│ ...                                                        │
│ AI-suggestiebalk: "Wil je direct een antwoord? Vraag het   │
│  de AI-assistent" [Vraag het de AI →]                        │
├───────────────────────────────────────────────────┤
│ Paginering                                                  │
└───────────────────────────────────────────────────┘
```

**Componenten**: persistente zoekbalk in de header, filterdropdowns (categorie, type), resultaatkaart (titel + breadcrumb-achtige sectie/stap-context + snippet met gemarkeerde zoekterm), AI-suggestiebalk, paginering.

**Gebruikersflow**: typt zoekterm → resultaten laden (live of na bevestigen) → filtert optioneel → opent resultaat → landt op scherm 3, gescrold naar de exacte sectie/stap.

**Primaire acties**: resultaat openen; AI-assistent starten met de zoekvraag voorgevuld.

**Secundaire acties**: filteren; zoekterm aanpassen; pagineren.

**AI-interactie**: de suggestiebalk stimuleert de overstap naar AI-chat — automatisch wordt er niets overgenomen, de gebruiker kiest bewust.

**Mobiele versie**: filters onder een "Filters"-knop in plaats van inline dropdowns; resultaatkaarten vol-breedte gestapeld.

**Desktop versie**: filters inline naast de resultatentelling; resultaten in één kolom (tekstuele matches, geen kaartgrid).

**Toegankelijkheid**: live-region die het aantal resultaten aankondigt voor screenreaders; gemarkeerde zoektermen niet alleen met kleur (ook onderstreept/vet); focus blijft in de zoekbalk tot de gebruiker bewust navigeert.

**Foutmeldingen**: zoekservice niet bereikbaar → "Zoeken lukt nu niet. Probeer het opnieuw, of stel je vraag aan de AI-assistent." met beide acties direct beschikbaar.

**Lege statussen**: 0 resultaten → "Geen resultaten voor '...'. Probeer een andere zoekterm, of stel je vraag direct aan de AI-assistent." met prominente AI-chat-knop én link naar het contactformulier.

**Loading states**: 3–5 skeleton-resultaatkaarten tijdens zoeken; subtiele laadindicator in de zoekbalk, geen full-page spinner.

---

## 3. Handleiding (artikeldetail)

**Doel**: stap-voor-stap uitleg tonen, opgebouwd uit de boomstructuur Sectie → ContentBlock (zie [DATA-MODEL.md](DATA-MODEL.md)), inclusief variant-aanvullingen.

**Doelgroep**: publieke gebruiker met een concrete vraag.

**Wireframe**:
```
┌───────────────────────────────────────────────────┐
│ Home > Categorie > Artikeltitel                       │
├───────────────┬───────────────────────────────────┤
│ Sidebar:       │ Artikeltitel                          │
│ Inhoudsopgave  │ "Laatst bijgewerkt: 12 mei 2026"        │
│ (secties,      │                                          │
│  sticky,       │ Sectie 1                                │
│  scroll-spy)   │  [tekstblok]                             │
│                │  [1] Genummerde stap  [afbeelding]        │
│                │  [2] Genummerde stap                       │
│                │  [⚠ waarschuwingsblok]                     │
│                │   ↳ [Aanvulling — MijnMonti] (gemarkeerd)   │
│                │  [💡 tipblok]                               │
│                │ Sectie 2                                    │
│                │  ...                                          │
│                │ "Was dit artikel nuttig?" [Ja] [Nee]           │
│                │ Gerelateerde artikelen (kaarten)                │
│                │ [Contact-doorverwijzingsblok, indien aanwezig]   │
└───────────────┴───────────────────────────────────┘
```

**Componenten**: breadcrumb, sticky inhoudsopgave-sidebar met scroll-spy, sectiekop, en per `ContentBlock.type` (zie [DATA-MODEL.md](DATA-MODEL.md)) een eigen component: tekstblok, genummerde-stap (nummer + tekst + optionele afbeelding), waarschuwingsblok, tipblok, video-embed, downloadkaart, contact-doorverwijzingsblok; "aanvulling"-kader dat een `VariantOverride`-actie `aanvullen` visueel onderscheidt van centrale tekst (zie [CONTENT-MODEL.md](CONTENT-MODEL.md)); feedbackwidget; gerelateerde-artikelen-kaarten.

**Gebruikersflow**: komt via zoeken, categorie, of een AI-citaat (deep link naar sectie) → leest/scrollt, eventueel geholpen door de scroll-spy inhoudsopgave → geeft optioneel feedback → gaat naar een gerelateerd artikel of naar contact.

**Primaire acties**: stappen doorlopen; sectie-link kopiëren/delen.

**Secundaire acties**: feedback geven; gerelateerd artikel openen; bijlage downloaden; video afspelen.

**AI-interactie**: een vaste "Vraag het de AI-assistent"-knop (sidebar of floating) opent scherm 4 met dit artikel als context; wanneer een gebruiker via een AI-citaat binnenkomt, wordt automatisch naar de exacte sectie gescrold en die sectie kort gemarkeerd.

**Mobiele versie**: inhoudsopgave wordt een inklapbaar blok bovenaan ("Inhoud ▾") in plaats van een sticky sidebar; afbeeldingen vol-breedte; sticky "Vraag het de AI"-knop onderaan het scherm.

**Desktop versie**: twee-koloms layout (sidebar ≈25% / content ≈75%), sidebar sticky tijdens scrollen, actieve sectie gemarkeerd via scroll-spy.

**Toegankelijkheid**: correcte koppenhiërarchie (h1 titel, h2 secties); waarschuwing/tip nooit uitsluitend via kleur (altijd icoon + tekstlabel "Waarschuwing"/"Tip"); video's met ondertiteling waar beschikbaar; verplichte alt-tekst op alle afbeeldingen; "aanvulling"-kader met tekstlabel, niet alleen een gekleurde rand.

**Foutmeldingen**: artikel niet (meer) beschikbaar voor deze variant → "Dit artikel bestaat niet (meer) voor [variant]." + zoekbalk + link naar het categorie-overzicht.

**Lege statussen**: n.v.t. op paginaniveau (een gepubliceerd artikel heeft per definitie inhoud — redactioneel geborgd, geen aparte UI nodig).

**Loading states**: skeleton voor titel en secties tijdens laden; afbeeldingen lazy-loaded met een placeholderblok.

---

## 4. AI-chat

**Doel**: direct, in gewone taal, een betrouwbaar antwoord krijgen mét bronvermelding.

**Doelgroep**: publieke gebruiker met een specifieke vraag.

**Wireframe** (los scherm op mobiel, paneel of los scherm op desktop):
```
┌───────────────────────────────────────────────────┐
│ "AI-assistent"   [Variant-badge]              [Sluiten ✕]│
├───────────────────────────────────────────────────┤
│ [AI] Welkomstbericht + voorbeeldvragen (chips)          │
│ [Gebruiker] jouw vraag...                                │
│ [AI] antwoordtekst                                        │
│      ┌ Bronnen ──────────────────────────────┐            │
│      │ 📄 Artikeltitel — Sectie/stap            │            │
│      │    Bijgewerkt: 12 mei 2026                │            │
│      │    [screenshot-miniatuur]                  │            │
│      └────────────────────────────────────────┘            │
│      [👍 Nuttig]  [👎 Niet nuttig]                            │
├───────────────────────────────────────────────────┤
│ [ Typ je vraag...                              ] [Verstuur▶]│
│ "De AI gebruikt alleen goedgekeurde bronnen van [variant]." │
└───────────────────────────────────────────────────┘
```

**Componenten**: chatbubbel (gebruiker/AI), bronnenkaart (titel, sectie, link, datum, miniatuur), feedbackknoppen, invoerveld + verstuurknop, voorbeeldvraag-chips (beginstaat, variant-specifiek), "denkend"-indicator, laag-vertrouwen-antwoordvariant (zie scherm 8), variant-indicator.

**Gebruikersflow**: opent chat (leeg, of met voorgevulde vraag vanuit zoeken/een artikel) → typt vraag → ontvangt antwoord met bron(nen) → geeft optioneel feedback → stelt een vervolgvraag of sluit het gesprek.

**Primaire acties**: vraag versturen; bron openen (naar scherm 3, exacte sectie).

**Secundaire acties**: feedback geven; voorbeeldvraag-chip aanklikken; gesprek wissen/opnieuw beginnen.

**AI-interactie**: dit scherm ís de AI-interactie — elk antwoord toont altijd bronvermelding (zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md)); bij onvoldoende betrouwbaarheid schakelt de flow expliciet over naar de andere weergave van scherm 8, nooit een "gokantwoord" in de normale stijl.

**Mobiele versie**: volledig scherm (eigen route, geen overlay); invoerveld sticky boven het toetsenbord; bronnenkaart compacter (titel + sectie + link, geen miniatuur).

**Desktop versie**: kan als slide-in paneel (± 420px, rechterzijde) vanuit elk scherm geopend worden, of als volledig scherm via een directe link; gespreksgeschiedenis scrollbaar met een maximale hoogte.

**Toegankelijkheid**: live-region-aankondiging bij nieuwe AI-berichten; invoerveld met label "Stel je vraag"; bronnenkaarten als losse, focusbare links; feedbackknoppen met duidelijke aria-labels.

**Foutmeldingen**: AI-service niet bereikbaar → "De AI-assistent is nu niet bereikbaar. Probeer het later opnieuw, of gebruik het contactformulier." met directe contact-knop.

**Lege statussen**: nieuw gesprek → welkomstbericht + 3–4 variant-specifieke voorbeeldvragen als chips.

**Loading states**: "denkend"-indicator (drie puntjes) direct na versturen; antwoord streamt woord voor woord; de bronnenkaart verschijnt pas zodra het antwoord compleet is.

---

## 5. Contactformulier

**Doel**: een probleem melden wanneer kennisbank en AI-assistent geen (voldoende) antwoord boden.

**Doelgroep**: publieke gebruiker, vaak doorverwezen vanuit scherm 8.

**Wireframe**:
```
┌───────────────────────────────────────────────────┐
│ "Neem contact op met de helpdesk"                     │
│ Korte intro: reactietijd, wanneer dit het juiste kanaal│
│  is                                                     │
├───────────────────────────────────────────────────┤
│ Wie ben je                                             │
│  [Naam leerkracht*] [E-mail*] [Naam school*]             │
├───────────────────────────────────────────────────┤
│ Wat is het probleem                                     │
│  [Soort vraag ▾*]  [Onderwerp*]                           │
│  [Uitleg van het probleem* — groot tekstveld]              │
│  [Wat verwacht je?*]                                        │
│  [Wat zie je daadwerkelijk?*]                                 │
│  [URL van de softwarepagina]                                    │
│  ⚠ "Voer geen leerling- of medische gegevens in, ook niet   │
│     in schermafbeeldingen."                                   │
├───────────────────────────────────────────────────┤
│ Bijlagen                                                    │
│  [Sleep bestanden hierheen of blader]  (max. bestandsgrootte)│
│  bestandslijst met verwijderknop per bestand                   │
├───────────────────────────────────────────────────┤
│ Automatisch meegestuurd (informatief):                        │
│  Variant · Helpcentrum-URL · Datum/tijd · "Chrome op desktop"   │
├───────────────────────────────────────────────────┤
│                 [ Versturen ]                                   │
└───────────────────────────────────────────────────┘
```

**Componenten**: sectiekoppen, tekstvelden, select (soort vraag), grote textarea, waarschuwingsbanner, upload-dropzone met per-bestand voortgang, read-only "automatisch meegestuurd"-kaart, primaire verstuurknop, inline veldvalidatie.

**Gebruikersflow**: komt op het formulier (evt. met "uitleg van het probleem" voorgevuld vanuit scherm 8) → vult verplichte velden in → uploadt optioneel bijlagen → verstuurt → ziet een bevestiging.

**Primaire acties**: formulier versturen.

**Secundaire acties**: bijlage verwijderen vóór versturen; teruggaan naar kennisbank/AI-chat.

**AI-interactie**: geen live AI op dit scherm zelf; wel voorgevuld indien binnengekomen via scherm 8 (de oorspronkelijke AI-vraag als startpunt voor "uitleg van het probleem", door de gebruiker aan te passen).

**Mobiele versie**: één kolom; secties met duidelijke witruimte; upload-dropzone wordt een "Kies bestanden"-knop (geen drag-and-drop op mobiel); "automatisch meegestuurd" samengevouwen onder een uitklapbare "Details"-sectie.

**Desktop versie**: max-breedte ≈700px (formulieren blijven smal en leesbaar); logisch samenhorende velden naast elkaar (naam+e-mail, soort vraag+onderwerp).

**Toegankelijkheid**: elk veld met een echt `<label>` (niet alleen placeholder); verplichte velden met `*` én `aria-required`; foutmeldingen gekoppeld aan het veld; waarschuwingsbanner met voldoende contrast, niet alleen kleur; uploadstatus hoorbaar aangekondigd.

**Foutmeldingen**: per veld inline ("Dit veld is verplicht", "Vul een geldig e-mailadres in"); bestand te groot → "Dit bestand is groter dan de maximale bestandsgrootte en kan niet worden geüpload."; verzendfout → bannermelding boven het formulier, ingevulde data blijft behouden.

**Lege statussen**: formulier begint altijd leeg; upload-dropzone toont "Nog geen bestanden toegevoegd" tot de eerste upload.

**Loading states**: verstuurknop toont een laadindicator en wordt uitgeschakeld tijdens versturen (voorkomt dubbel indienen); per bestand een eigen voortgangsbalk.

**Bevestiging na versturen** (geen apart scherm, wel een vaste staat): "Bedankt, je melding is verstuurd. We reageren meestal binnen 1 werkdag." + referentienummer + knop terug naar de kennisbank.

---

## 6. Categorie-overzicht

**Doel**: browsen door handleidingen binnen een categorie/thema, voor gebruikers die liever bladeren dan gericht zoeken.

**Doelgroep**: publieke gebruiker die oriënteert.

**Wireframe**:
```
┌───────────────────────────────────────────────────┐
│ Home > Categorieën > [Categorienaam]                   │
├───────────────────────────────────────────────────┤
│ Categorietitel + korte uitleg                          │
├──────────────┬────────────────────────────────────┤
│ Subcategorie- │ [icoon] Artikeltitel — korte samenvatting│
│ filter        │ [icoon] Artikeltitel — korte samenvatting│
│ (sidebar)     │ ...                                       │
└──────────────┴────────────────────────────────────┘
```

**Componenten**: breadcrumb, categorie-intro, subcategorie-sidebarfilter, artikelrij (icoon + titel + samenvatting + "laatst bijgewerkt").

**Gebruikersflow**: komt via homepage-categoriekaart of hoofdnavigatie → bladert, filtert optioneel op subcategorie → opent een artikel.

**Primaire acties**: artikel openen.

**Secundaire acties**: filteren op subcategorie; naar zoeken/AI-chat overstappen.

**AI-interactie**: subtiele link "Liever direct een antwoord? Vraag het de AI-assistent."

**Mobiele versie**: subcategorie-sidebar wordt een horizontaal scrollbare chip-rij bovenaan.

**Desktop versie**: twee-koloms layout (sidebar ≈25% / lijst ≈75%), rijen met hover-state.

**Toegankelijkheid**: lijst als semantische structuur/landmark; filterchips met `aria-pressed`; duidelijke focusindicatoren.

**Foutmeldingen**: categorie bestaat niet (meer) voor deze variant → doorverwijzing naar het hoogste categorie-overzicht + zoekbalk.

**Lege statussen**: categorie zonder zichtbare artikelen voor deze variant (bijv. alles via `verbergen` uitgesloten) → "Voor [variant] zijn hier momenteel geen artikelen. Gebruik de zoekbalk of stel je vraag aan de AI-assistent."

**Loading states**: skeleton-rijen tijdens laden.

---

## 7. Updates

**Doel**: overzicht van nieuwe/bijgewerkte handleidingen, zodat terugkerende gebruikers weten wat er veranderd is.

**Doelgroep**: publieke gebruikers die willen bijblijven — met name IB'ers en kwaliteitscoördinatoren.

**Wireframe**:
```
┌───────────────────────────────────────────────────┐
│ "Updates" + korte uitleg                               │
│ [Alles / Nieuw / Bijgewerkt ▾]   [Periode ▾]             │
├───────────────────────────────────────────────────┤
│ "Mei 2026"                                              │
│  ● [Nieuw] Artikeltitel — korte toelichting                │
│  ● [Bijgewerkt] Artikeltitel — korte toelichting             │
│ "April 2026"                                                │
│  ● ...                                                        │
└───────────────────────────────────────────────────┘
```

**Componenten**: filterdropdowns, datumgroep-kop, updateregel (badge Nieuw/Bijgewerkt + titel + toelichting + link), "meer laden"/paginering.

**Gebruikersflow**: opent Updates (via footer/nav) → filtert optioneel → klikt door naar het artikel.

**Primaire acties**: naar bijgewerkt artikel gaan.

**Secundaire acties**: filteren op type/periode.

**AI-interactie**: geen.

**Mobiele versie**: filters onder een "Filters"-knop; datumgroepen blijven gestapeld.

**Desktop versie**: filters inline rechtsboven; chronologische lijst, optioneel met een subtiele tijdlijn-stijl.

**Toegankelijkheid**: datumgroepen als koppen (h2/h3) voor screenreader-navigatie; badges met tekstlabel, niet alleen kleur.

**Foutmeldingen**: laden mislukt → "Updates konden niet geladen worden." + retry.

**Lege statussen**: geen updates in de gekozen periode → "Geen updates in deze periode." + link om het filter te resetten.

**Loading states**: skeleton-regels per datumgroep.

---

## 8. AI "geen antwoord gevonden"

**Doel**: eerlijk communiceren dat de kennisbank onvoldoende betrouwbare informatie heeft, zonder de gebruiker met lege handen achter te laten (zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) §Betrouwbaarheidsdrempel).

**Doelgroep**: publieke gebruiker binnen de AI-chat wiens vraag onder de betrouwbaarheidsdrempel valt, of waarvoor onvoldoende goedgekeurde onderwijskundige content bestaat (zie [CONTENT-MODEL.md](CONTENT-MODEL.md) §Twee soorten kennis).

**Wireframe** (variant binnen scherm 4, geen los scherm):
```
│ [AI] "Ik kan hier geen betrouwbaar antwoord op geven op   │
│      basis van onze kennisbank voor [variant]."             │
│      ┌───────────────────────────────────────────┐          │
│      │ ℹ Dit kan zijn omdat het antwoord nog niet in │          │
│      │   onze kennisbank staat, of nog niet is        │          │
│      │   goedgekeurd voor gebruik door de AI.           │          │
│      └───────────────────────────────────────────┘          │
│      [ Stel je vraag via het contactformulier → ]              │
│      "Bedoelde je een van deze onderwerpen?" (optioneel)         │
│       [gerelateerd artikel-chip]  [gerelateerd artikel-chip]      │
```

**Componenten**: AI-bericht in een expliciete "onzeker"-stijl (neutrale/grijze kaart, géén bronnenkaart, visueel duidelijk anders dan een normaal antwoord), toelichtingskaartje, primaire CTA naar het contactformulier (voorgevuld, zie scherm 5), optionele gerelateerde-artikel-chips (wanneer retrieval wél losse, niet-drempelhalende treffers opleverde).

**Gebruikersflow**: stelt een vraag → het systeem bepaalt deterministisch (op retrieval-kwaliteit, niet het zelfvertrouwen van het model) dat er onvoldoende betrouwbare basis is → toont deze staat in plaats van een gegokt antwoord → gebruiker gaat naar het contactformulier of herformuleert de vraag.

**Primaire acties**: naar het contactformulier (met de vraag voorgevuld).

**Secundaire acties**: vraag herformuleren; gerelateerd artikel openen indien getoond.

**AI-interactie**: dit ís een AI-interactiestaat, bewust visueel anders dan een "echt" antwoord zodat gebruikers dit onderscheid direct herkennen en niet per abuis een onzeker antwoord als feit lezen.

**Mobiele versie**: zelfde opbouw; de CTA-knop is vol-breedte en prominent.

**Desktop versie**: toelichtingskaartje en CTA blijven binnen de breedte van de chatbubbel — geen aparte full-width banner die het gesprek onderbreekt.

**Toegankelijkheid**: deze berichtstaat heeft een tekstueel label ("Geen betrouwbaar antwoord gevonden") dat ook voor screenreaders duidelijk maakt dat dit geen normaal antwoord is, niet alleen visuele styling.

**Foutmeldingen**: n.v.t. — dit ís functioneel al de "eerlijke onzekerheid"-staat.

**Lege statussen**: n.v.t.

**Loading states**: dezelfde "denkend"-indicator als scherm 4, vóórdat deze staat verschijnt — de gebruiker merkt vooraf niet dat het antwoord negatief zal uitvallen.

---

## 9. Variantwissel

**Doel**: (a) een bezoeker op een niet-eenduidige/algemene URL laten kiezen voor welk product hij hulp zoekt; (b) een redacteur/beheerder een andere variant laten previewen (zie [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md) §Preview-mechanisme).

**Doelgroep**: (a) publieke bezoeker zonder herkend variant-domein; (b) editor/admin in de beheeromgeving.

**Wireframe — publieke kiezer** (bij landing op een niet-herkende/algemene URL):
```
┌───────────────────────────────────────────────────┐
│ "Voor welk product zoek je hulp?"                      │
│  [Logo MijnLeerlijn]  [Logo MijnMonti]  [Logo MijnD]      │
│  [Logo vrijeschool-variant (werktitel)]                    │
│  Elke kaart: naam + 1-regel onderwijstype-omschrijving       │
└───────────────────────────────────────────────────┘
```

**Wireframe — header-switcher** (compact, overal zichtbaar wanneer relevant, en in de beheeromgeving voor preview):
```
Header-element: [Huidige variant-logo ▾]
  ▾ lijst van actieve varianten, huidige gemarkeerd (aria-current)
```

**Componenten**: variant-keuzekaart (publiek), variant-dropdown (compact, header), variant-badge (leesindicator elders in de UI).

**Gebruikersflow (publiek)**: landt op een algemene URL → kiest een variant-kaart → wordt doorgestuurd naar het domein/subdomein/slug van die variant.

**Gebruikersflow (beheer)**: opent de dropdown in de beheeromgeving → kiest een andere variant om content in te previewen → beheer-UI toont content in de context van die variant (zie scherm 11).

**Primaire acties**: variant kiezen.

**Secundaire acties**: (beheer) terug naar "alle varianten".

**AI-interactie**: geen directe interactie; de gekozen variant bepaalt daarna wél alle AI-scoping (zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md)).

**Mobiele versie**: publieke kiezer toont kaarten gestapeld (1 kolom); header-dropdown verhuist naar het hamburgermenu.

**Desktop versie**: publieke kiezer toont kaarten in een grid (2–4 kolommen); header-dropdown compact naast het logo.

**Toegankelijkheid**: volledig toetsenbord-navigeerbaar; huidige variant met `aria-current`; logo's altijd met tekstuele naam ernaast, nooit als enige onderscheid.

**Foutmeldingen**: gekozen variant niet (meer) actief/gearchiveerd → "Dit product is momenteel niet beschikbaar." + terug naar de kiezer.

**Lege statussen**: slechts één actieve variant (vroege fase) → de publieke kiezer wordt overgeslagen en de header-dropdown toont geen wisselmogelijkheid — geen zinloze UI met precies één optie.

**Loading states**: korte laadindicator tijdens de doorverwijzing naar het gekozen variant-domein.

---

# Deel B — Beheeromgeving

Alle onderstaande schermen vereisen login met rol `editor` of `admin` (zie [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md)). Consistente linker zijnavigatie: Dashboard, Artikelen, Variants, Media, AI-feedback, Instellingen (zie §Navigatie hieronder). Toon: functioneel en dicht, geen marketing-uitstraling.

## 10. Beheeromgeving dashboard

**Doel**: snel overzicht van openstaande redactionele taken en platformstatus.

**Doelgroep**: editor + admin.

**Wireframe**:
```
┌───────────┬───────────────────────────────────────┐
│ Zijnav     │ Welkom, [naam]  ·  Actieve variant: [x ▾]   │
│ Dashboard  │ ┌─────────┬─────────┬─────────┬────────┐     │
│ Artikelen  │ │Concepten│In review│ Gepland │Meldingen│     │
│ Variants   │ │   4     │   2     │   3     │ 5 nieuw │     │
│ Media      │ └─────────┴─────────┴─────────┴────────┘     │
│ AI-feedback│ Recente activiteit (laatste 10, uit AuditLog)   │
│ Instellingen│  · [naam] publiceerde "Doelenset aanmaken"      │
│            │  · [naam] wijzigde override voor MijnMonti        │
│            │ AI-signaal: "3 vragen deze week zonder betrouwbaar │
│            │  antwoord" → [Bekijk in AI-feedback]                 │
└───────────┴───────────────────────────────────────┘
```

**Componenten**: zijnavigatie, statuskaarten (aantallen, doorklikbaar naar gefilterde lijst), activiteitenlijst (uit `AuditLog`, zie [DATA-MODEL.md](DATA-MODEL.md)), AI-kwaliteitssignaalkaart, variant-contextselector.

**Gebruikersflow**: logt in → landt op het dashboard → klikt door naar in-review-artikelen of AI-signalen.

**Primaire acties**: doorklikken naar in-review-artikelen; doorklikken naar AI-feedback-signalen.

**Secundaire acties**: variant-contextfilter wisselen; activiteitenlijst uitbreiden.

**AI-interactie**: alleen indirect, via het kwaliteitssignaal dat doorverwijst naar scherm 14.

**Mobiele versie**: zijnav als inklapbaar hamburgermenu; statuskaarten gestapeld (2×2 of 1 kolom); activiteitenlijst blijft leesbaar.

**Desktop versie**: vaste (niet-inklapbare) zijnavigatie; statuskaarten in een rij; activiteitenlijst en signalen naast elkaar.

**Toegankelijkheid**: statuskaarten als focusbare links met betekenisvol aria-label; activiteitenlijst als semantische lijst met leesbare tijdstempel.

**Foutmeldingen**: dashboard-data niet te laden → "Overzicht kan nu niet worden geladen." + retry; individuele widgets falen onafhankelijk van elkaar.

**Lege statussen**: nieuw account/nieuwe variant zonder activiteit → "Nog geen activiteit. Begin met het aanmaken van je eerste artikel." + CTA naar scherm 11.

**Loading states**: skeleton-statuskaarten en skeleton-activiteitenregels.

---

## 11. Artikelen beheren

**Doel**: centrale artikelen (Article/Section/ContentBlock) en hun variant-overrides schrijven, reviewen en publiceren (zie [DATA-MODEL.md](DATA-MODEL.md), [CONTENT-MODEL.md](CONTENT-MODEL.md), [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md)).

**Doelgroep**: editor + admin.

**Wireframe — lijstweergave**:
```
┌───────────┬───────────────────────────────────────┐
│ Zijnav     │ Artikelen                    [+ Nieuw artikel]│
│            │ [Status ▾] [Categorie ▾] [Kennistype ▾]         │
│            │ Titel               Status     Kennistype  Bijgewerkt│
│            │ Doelenset aanmaken   Gepubliceerd Product   12 mei│
│            │ Montessori-implementatie In review Pedagogisch 10 mei│
│            │ ...                                                 │
└───────────┴───────────────────────────────────────┘
```

**Wireframe — detail/editor (boom + overrides)**:
```
┌───────────┬───────────────────────────────────────┐
│ Zijnav     │ ← Terug  [Artikeltitel]   Status: Concept    │
│            │ [Concept opslaan] [Indienen voor review]       │
│            │ Variant-context: [Centraal ▾]  (of: MijnMonti)  │
├───────────┼───────────────┬───────────────────────┤
│            │ Boomstructuur  │ Blok-editor                    │
│            │ ▸ Sectie 1     │ Type: [Genummerde stap ▾]         │
│            │   • Blok 1      │ [invoervelden afhankelijk van type]│
│            │   • Blok 2 ◀sel │ Override (bij variant-context):    │
│            │ ▸ Sectie 2     │  [Actie: Vervangen ▾]               │
│            │   + Blok toev.  │  [override-inhoud invoerveld]        │
│            │ + Sectie toev.  │                                       │
├───────────┴───────────────┴───────────────────────┤
│ Versiegeschiedenis (uitklapbaar): v3 (huidig)·v2·v1 [Terugzetten]│
└───────────────────────────────────────────────────┘
```

**Componenten**: filterbalk, artikelentabel met statuslabels, boomstructuur-navigator (secties/blokken, herordenbaar), bloktype-selector (tekst/genummerde_stap/afbeelding/waarschuwing/tip/video/download/contact_doorverwijzing — zie [DATA-MODEL.md](DATA-MODEL.md)), bloktype-specifieke editor, variant-contextwissel (Centraal vs. specifieke variant — bepaalt of de centrale boom of een override bewerkt wordt), override-actie-selector (onveranderd/aanvullen/vervangen/verbergen/ander_medium/invoegen_voor/invoegen_na — zie [CONTENT-MODEL.md](CONTENT-MODEL.md)) zichtbaar zodra een variant-context actief is, versiegeschiedenis-paneel met terugzet-actie, statusworkflow-knoppen, AI-goedkeuringstoggle (alleen zichtbaar bij `knowledgeType = pedagogisch`, alleen bedienbaar door `admin`, zie [CONTENT-MODEL.md](CONTENT-MODEL.md) §Twee soorten kennis).

**Gebruikersflow (centraal artikel)**: nieuw artikel → secties/blokken opbouwen → concept opslaan → indienen voor review → een andere persoon keurt goed → publiceren nu of inplannen.

**Gebruikersflow (variant-override)**: open bestaand centraal artikel → wissel variant-context naar bijv. MijnMonti → selecteer een blok → kies een override-actie → vul override-inhoud in → eigen concept/publicatie-cyclus voor die override.

**Primaire acties**: blok/sectie toevoegen; override toepassen; indienen voor review; publiceren.

**Secundaire acties**: herordenen; versie terugzetten; previewen (zie scherm 9); artikel archiveren.

**AI-interactie**: bij `knowledgeType = pedagogisch` een expliciete, apart bevestigde toggle "Goedgekeurd voor gebruik door de AI-assistent", losstaand van de publicatiestatus, met korte uitleg waarom deze stap bestaat; verder geen AI-schrijfhulp in deze MVP-scope.

**Mobiele versie**: editor is een desktop-taak; op mobiel/tablet is de lijstweergave (status bekijken, snel goedkeuren) volledig bruikbaar; de boom-editor toont een melding "Voor het beste resultaat, gebruik een groter scherm" met een werkende, verticaal gestapelde fallback in plaats van de driekolomsindeling.

**Desktop versie**: drie-koloms editor (boomstructuur smal-links, blok-editor midden, status/override/versies als rechterpaneel), boomstructuur permanent zichtbaar tijdens het bewerken van een blok.

**Toegankelijkheid**: boomstructuur navigeerbaar met het toetsenbord (naast drag-and-drop ook expliciete "verplaats omhoog/omlaag"-knoppen); statuslabels met tekst, niet alleen kleur; override-acties als duidelijk gelabelde radio's/select, niet alleen iconen.

**Foutmeldingen**: opslaan mislukt → inline melding, concept blijft lokaal behouden; poging tot wijziging van centrale content zonder de juiste rol → "Je kunt hier alleen variant-afwijkingen bewerken, niet de centrale tekst." (vangnet — de UI zou dit al moeten voorkomen); publiceren met ontbrekende verplichte inhoud → duidelijke lijst van wat ontbreekt.

**Lege statussen**: nieuw artikel zonder secties → grote lege-staat "Voeg je eerste sectie toe"; variant-context zonder overrides → "Voor [variant] zijn nog geen afwijkingen op dit artikel. Selecteer een blok om een afwijking toe te voegen."

**Loading states**: skeleton-boomstructuur bij het laden van een groot artikel; subtiele "Opgeslagen"-indicator in plaats van een blokkerende spinner.

---

## 12. Variants beheren

**Doel**: varianten aanmaken, configureren (branding, domein, terminologie) en de levenscyclus beheren (zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md)).

**Doelgroep**: admin.

**Wireframe — lijst**:
```
┌───────────┬───────────────────────────────────────┐
│ Zijnav     │ Variants                  [+ Nieuwe variant]│
│            │ Naam        Status  Domein-status  Placeholder?│
│            │ MijnLeerlijn Actief  Eigen domein   Nee          │
│            │ MijnMonti    Actief  Slug           Ja (branding)│
│            │ MijnD        Concept —              Ja            │
└───────────┴───────────────────────────────────────┘
```

**Wireframe — detail/configuratie**:
```
┌───────────┬───────────────────────────────────────┐
│ Zijnav     │ ← Terug  MijnMonti   Status: Actief ▾       │
│            │ [Branding] [Domein] [Terminologie]            │
│            │ [Onderwijstype] [Contactgegevens]               │
│            │────────────────────────────────────────────│
│            │ (Branding-tab)                                │
│            │ ⚠ Placeholder-branding actief                  │
│            │ Logo: [uploadveld + mini-voorbeeld]              │
│            │ Productnaam: [MijnMonti]                          │
│            │ Accentkleur: [kleurkiezer + hex] [contrastcheck]   │
│            │ [ ] Markeer branding als definitief                 │
└───────────┴───────────────────────────────────────┘
```

**Componenten**: variantentabel met statuskolommen, tabblad-navigatie (Branding/Domein/Terminologie/Onderwijstype/Contact), logo-upload met live mini-preview, kleurkiezer met contrastcontrole, domeinstatus-stappenbalk (slug → subdomein → eigen domein) met invoervelden per fase, terminologie-woordenboek-editor (tabel: centraal begrip | variant-begrip), placeholder-waarschuwingsbanner (zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md) §Placeholder-branding-regels).

**Gebruikersflow**: nieuwe variant aanmaken (naam, slug, onderwijstype) → branding invullen of op placeholder laten → domeinstatus instellen → terminologie toevoegen → status op "actief" zetten.

**Primaire acties**: variant aanmaken; opslaan per tab; status wijzigen.

**Secundaire acties**: branding als definitief markeren; domein promoveren met redirect-bevestiging.

**AI-interactie**: geen directe interactie; hier ingevoerde terminologie bepaalt wel de AI-antwoordformulering.

**Mobiele versie**: tabbladen worden een verticale accordeon; kleurkiezer/logo-upload blijven functioneel maar compacter.

**Desktop versie**: tabblad-layout met een mini-preview van de variant-styling (logo + kleur toegepast op een voorbeeldkaartje), direct visueel effect van wijzigingen.

**Toegankelijkheid**: kleurkiezer toont contrastwaarschuwingen ook in tekst; tabbladen als echte ARIA-tabs, toetsenbord-navigeerbaar.

**Foutmeldingen**: domein al in gebruik door een andere variant → "Dit domein is al gekoppeld aan [andere variant]."; ongeldige slug → inline validatie; verkeerd logo-formaat → "Upload een PNG- of SVG-bestand."

**Lege statussen**: nieuwe variant vóór eerste opslag → invulhints op elke tab; geen varianten behalve MijnLeerlijn → prominente "voeg je tweede variant toe"-CTA.

**Loading states**: opslaan per tab toont een korte bevestiging in plaats van de hele pagina te herladen.

---

## 13. Media beheren

**Doel**: afbeeldingen, video's en downloads beheren, zowel centraal als variant-specifiek (via `ander_medium`-overrides).

**Doelgroep**: editor + admin.

**Wireframe**:
```
┌───────────┬───────────────────────────────────────┐
│ Zijnav     │ Media                       [+ Uploaden]    │
│            │ [Type ▾] [Centraal/Variant-specifiek ▾]        │
│            │ Weergave: [Grid] [Lijst]                          │
│            │ ┌────┐┌────┐┌────┐┌────┐                          │
│            │ │img ││img ││pdf ││img │  (tegels met bestandsnaam,│
│            │ └────┘└────┘└────┘└────┘   gekoppeld-aan-badge)     │
└───────────┴───────────────────────────────────────┘
```

**Wireframe — detail**:
```
│ Grote preview │ Bestandsnaam, type, grootte                  │
│               │ Alt-tekst [verplicht invoerveld]                │
│               │ Gebruikt in: [lijst artikelen/blokken]            │
│               │ Centraal of variant: [MijnMonti-badge]              │
│               │ [Vervangen]  [Verwijderen]                            │
```

**Componenten**: media-tegel (grid/lijst), filterbalk, upload-dropzone, detailpaneel met verplicht alt-tekstveld, "gebruikt in"-koppelingenlijst, centraal/variant-badge.

**Gebruikersflow**: uploadt bestand → vult verplicht alt-tekst in → koppelt (of wordt gekoppeld vanuit scherm 11) aan een blok → later: vervangt of verwijdert.

**Primaire acties**: uploaden; alt-tekst invullen/bewerken.

**Secundaire acties**: filteren; vervangen; verwijderen.

**AI-interactie**: geen directe interactie; gekoppelde media verschijnt wel in AI-bronvermeldingen (zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md)).

**Mobiele versie**: grid wordt 2-koloms; detailpaneel als volledig-scherm modal.

**Desktop versie**: grid met hover-preview; detailpaneel als slide-in zijpaneel.

**Toegankelijkheid**: verplichte, betekenisvolle alt-tekst vóór een afbeelding aan een blok gekoppeld kan worden.

**Foutmeldingen**: upload mislukt/ongeldig formaat → inline melding; verwijderen van een bestand dat nog in gebruik is → bevestigingsdialoog met lijst van betrokken artikelen.

**Lege statussen**: geen media geüpload → "Nog geen media. Upload afbeeldingen of bestanden om aan handleidingen te koppelen." + CTA.

**Loading states**: upload-voortgangsbalk per bestand; skeleton-tegels tijdens laden.

---

## 14. AI feedback beoordelen

**Doel**: kwaliteit van AI-antwoorden bewaken — onbeantwoorde vragen, gebruikersfeedback, en signalen voor het bijstellen van de betrouwbaarheidsdrempel (zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) §Kwaliteitsbewaking).

**Doelgroep**: admin.

**Wireframe**:
```
┌───────────┬───────────────────────────────────────┐
│ Zijnav     │ AI-feedback              Variant: [Alle ▾]  │
│            │ [Geen antwoord] [Negatieve feedback]           │
│            │ [Positieve feedback]                             │
│            │────────────────────────────────────────────│
│            │ Vraag: "Hoe koppel ik ..."   Variant: MijnD      │
│            │ 3× gesteld deze week · Geen betrouwbaar antwoord   │
│            │ Oorzaak: [content ontbreekt / niet goedgekeurd /     │
│            │           niet relevant ▾]                            │
│            │ [Nieuw artikel starten]  [Naar bestaand artikel]        │
├───────────┴───────────────────────────────────────┤
│ (geanonimiseerd — geen individuele gebruikersidentiteit getoond)│
└───────────────────────────────────────────────────┘
```

**Componenten**: variant-filter, tabbladen (drie feedbacksoorten), vraagkaart (vraag + variant + frequentie + oorzaak-tag), oorzaak-classificatie-select, doorklik-acties naar scherm 11, eenvoudige trendindicator ("aantal onbeantwoorde vragen deze week" — bewust eenvoudig, geen uitgebreide analytics, zie [PROJECT.md](PROJECT.md) §Fasering).

**Gebruikersflow**: bekijkt onbeantwoorde/negatief-beoordeelde vragen → classificeert oorzaak → springt naar een bestaand artikel om een override/aanvulling toe te voegen, of start een nieuw artikel.

**Primaire acties**: doorklikken naar (nieuw) artikel om het hiaat te dichten.

**Secundaire acties**: filteren op variant; oorzaak markeren; vraag als "opgelost" markeren zonder verdere actie.

**AI-interactie**: dit scherm is het menselijke controlepunt op AI-gedrag — geen live AI hier, wel de output van AI-interacties elders.

**Mobiele versie**: tabbladen worden een dropdown-selector; vraagkaarten blijven leesbaar gestapeld.

**Desktop versie**: tabbladen horizontaal; vraagkaarten met filter-/sorteeropties (frequentie, datum).

**Toegankelijkheid**: trendgrafiek altijd met een tekstuele samenvatting; tabbladen als ARIA-tabs.

**Foutmeldingen**: data niet beschikbaar → "Feedback-overzicht kan nu niet geladen worden."

**Lege statussen**: geen openstaande signalen → "Geen openstaande signalen — de AI-assistent beantwoordt vragen momenteel goed voor [variant]."

**Loading states**: skeleton-vraagkaarten; trendgrafiek met eigen laadindicator.

---

## 15. Instellingen

**Doel**: gebruikers/rollen beheren en systeeminstellingen inzien die niet bij een specifieke variant of artikel horen.

**Doelgroep**: admin.

**Wireframe**:
```
┌───────────┬───────────────────────────────────────┐
│ Zijnav     │ Instellingen                                │
│            │ [Gebruikers & rollen] [Algemeen]               │
│            │ [Privacy & bewaartermijnen (referentie)]         │
│            │────────────────────────────────────────────│
│            │ (Gebruikers-tab)                                │
│            │ Naam       E-mail          Rol      Acties        │
│            │ [naam]     [mail]          Admin     [Bewerk]       │
│            │ [naam]     [mail]          Editor    [Bewerk]        │
│            │ [+ Gebruiker uitnodigen]                              │
└───────────┴───────────────────────────────────────┘
```

**Componenten**: tabblad-navigatie, gebruikerstabel met rol-badge en acties, "uitnodigen"-modal (e-mail + rolkeuze), algemene-instellingenformulier, read-only referentiepaneel met de bewaartermijnen uit [SECURITY-AND-PRIVACY.md](SECURITY-AND-PRIVACY.md) (niet hier bewerkbaar — het juridisch document is de bron).

**Gebruikersflow**: admin nodigt een collega uit met een rol → collega accepteert (aparte flow, buiten dit scherm) → admin kan later de rol wijzigen of toegang intrekken.

**Primaire acties**: gebruiker uitnodigen; rol wijzigen.

**Secundaire acties**: toegang intrekken; algemene instellingen aanpassen.

**AI-interactie**: geen directe interactie in v1 — AI-providerkeuze is een omgevingsconfiguratie, geen UI-instelling (zie [ARCHITECTURE.md](ARCHITECTURE.md)).

**Mobiele versie**: gebruikerstabel wordt een gestapelde kaartenlijst; tabs als dropdown.

**Desktop versie**: standaard tabel- en tabblad-layout.

**Toegankelijkheid**: rolwijziging met bevestigingsdialoog en tekstuele uitleg van de gevolgen; correcte tabelkoppen voor screenreaders.

**Foutmeldingen**: uitnodigen van een al bestaand e-mailadres → "Deze gebruiker heeft al toegang."; laatste admin proberen te downgraden → geblokkeerd, "Er moet altijd minstens één beheerder actief blijven."

**Lege statussen**: n.v.t. voor de gebruikerslijst (de ingelogde admin staat er altijd al in); subtiele hint bij nul uitgenodigde collega's.

**Loading states**: skeleton-rijen bij laden; korte bevestiging bij opslaan van algemene instellingen.

---

# Sitemap

```
/ (variant-herkend via domein/subdomein/slug)
├── Homepage
├── Zoeken (resultaten)
├── Categorieën
│   └── [categorie]
│       └── [artikel] (met #sectie-ankers)
├── Updates
├── AI-assistent (chat — paneel of eigen route)
├── Contact (contactformulier)
├── Kies je product (variantwissel — alleen op niet-herkende/algemene URL)
└── Juridisch: Privacyverklaring, Voorwaarden (footer-links, tekst volgt via sCoolsuite B.V.)

/beheer (login vereist)
├── Dashboard
├── Artikelen
│   ├── [lijst, gefilterd op status/categorie/kennistype]
│   └── [artikel-detail/editor] (met variant-contextwissel voor overrides)
├── Variants
│   └── [variant-detail] (tabs: Branding, Domein, Terminologie, Onderwijstype, Contact)
├── Media
│   └── [media-detail]
├── AI-feedback
│   ├── Geen antwoord gevonden
│   ├── Negatieve feedback
│   └── Positieve feedback
└── Instellingen
    ├── Gebruikers & rollen
    ├── Algemeen
    └── Privacy & bewaartermijnen (referentie, read-only)
```

---

# Navigatie

**Globale header (publiek)**: logo (linkt naar de homepage van de actieve variant) — grote/centrale zoekbalk — toegang tot AI-chat (knop/icoon) — link naar Contact — variant-indicator/wisselaar (scherm 9, alleen zichtbaar/relevant wanneer er meer dan één actieve variant is).

**Hoofdnavigatie-items**: Categorieën, Updates, Contact — als eenvoudige tekstlinks naast of onder de header, geen diepe uitklapmenu's (rust boven volledigheid, zie [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)).

**Footer (publiek)**: korte merkomschrijving + slogan, links naar categorieën, Updates, Contact, juridische pagina's (Privacyverklaring, Voorwaarden), vermelding van sCoolsuite B.V., social-iconen (indien van toepassing per brandbook — Instagram/LinkedIn/Facebook), kleine variant-indicator.

**Breadcrumbs**: `Home > Categorie > (Subcategorie) > Artikel`. In de beheeromgeving: `Sectienaam > Detail` binnen elk beheerscherm.

**Beheeromgeving zijnavigatie**: Dashboard, Artikelen, Variants, Media, AI-feedback, Instellingen — vast zichtbaar op desktop, inklapbaar op mobiel/tablet. Bovenaan: gebruikersmenu (profiel, uitloggen) en de actieve-variant-contextselector die de scope van Artikelen- en AI-feedback-schermen bepaalt.

**Mobiele navigatiepatronen**: hamburgermenu voor de publieke hoofdnavigatie; een sticky, altijd-bereikbare AI-chat-toegangsknop op publieke schermen (het is een primair pad, dus nooit verstopt); beheer-zijnav als uitklapbaar menu.

**Diepe links**: AI-citaten en zoekresultaten linken altijd naar `artikel + sectie-anker`, nooit alleen naar de top van een artikel — de gebruiker moet direct bij het relevante antwoord uitkomen.

---

# Componentenbibliotheek

## Navigatie
- **Header** (publiek/beheer-varianten) — logo, zoekbalk (publiek), acties, variant-indicator
- **Zijnavigatie** (beheer) — vaste lijst met actieve-item-highlight
- **Breadcrumb** — tekstlinks met `>`-scheiding
- **Tabbladen** (ARIA-tabs) — gebruikt in Variant-detail (12), Instellingen (15), AI-feedback (14)
- **Footer** (publiek)
- **Sticky inhoudsopgave / scroll-spy** — Handleiding-scherm (3)

## Invoer
- **Zoekbalk** (groot/homepage-variant, compact/header-variant)
- **Tekstveld / textarea** — met label, hint, foutstaat
- **Select / dropdown** — met label, foutstaat
- **Bestand-upload dropzone** — met voortgang per bestand, foutstaat (te groot/verkeerd type)
- **Kleurkiezer** — met hex-invoer en contrastcontrole-indicator
- **Toggle/checkbox** — o.a. AI-goedkeuringstoggle, "markeer branding als definitief"
- **Chip (voorbeeldvraag, filter, tag)** — klikbaar, met geselecteerde staat

## Content-weergave (1:1 met `ContentBlock.type`, zie DATA-MODEL.md)
- **Tekstblok**
- **Genummerde-stap-blok** (nummer + tekst + optionele afbeelding)
- **Afbeeldingblok** (met bijschrift, alt-tekst verplicht)
- **Waarschuwingblok** (icoon + label + tekst, kleuraccent)
- **Tipblok** (icoon + label + tekst, kleuraccent)
- **Videoblok** (embed + bijschrift)
- **Downloadblok** (bestandsicoon + naam + downloadknop)
- **Contact-doorverwijzingblok** (tekst + link naar contactformulier, evt. voorgevuld)
- **Aanvulling-kader** — omhult elk van bovenstaande wanneer getoond als `VariantOverride`-actie `aanvullen`, met een zichtbaar variant-label

## Feedback & status
- **Statuslabel/badge** — concept/in review/gepland/gepubliceerd/gearchiveerd (Article), nieuw/in behandeling/afgehandeld (ContactSubmission), nieuw/bijgewerkt (Updates)
- **Toast/bannermelding** — succes, fout, waarschuwing
- **Skeleton-loader** — kaart-, rij- en tekstvariant
- **Duim-omhoog/omlaag-feedback** — AI-chat
- **Lege-staat-component** — icoon/illustratie-placeholder (geen echte afbeelding, zie scope), titel, toelichting, CTA
- **Bevestigingsdialoog** — o.a. verwijderen, rolwijziging, verwijderen van media in gebruik

## Data-weergave (beheer)
- **Tabel** — sorteerbaar, filterbaar, met statuskolommen
- **Kaart/tegel** (media-grid, statuskaarten dashboard)
- **Boomstructuur-navigator** — secties/blokken, herordenbaar, met toetsenbordalternatief voor drag-and-drop
- **Versiegeschiedenis-tijdlijn** — met diff-indicatie en terugzet-actie
- **Trend-mini-grafiek** — met verplichte tekstuele samenvatting

## Overlay
- **Modal** — uploaden, uitnodigen, bevestigen
- **Slide-in paneel** — AI-chat (desktop), media-detail (desktop)
- **Dropdown-menu** — variant-switcher, gebruikersmenu, filters

## AI-specifieke componenten
- **Chatbubbel** (gebruiker/AI, incl. "denkend"-status)
- **Bronnenkaart** — titel, sectie/stap, link, datum laatste update, variant, optionele screenshot-miniatuur (verplichte velden, zie AI-KNOWLEDGE-STRATEGY.md)
- **"Geen betrouwbaar antwoord"-kaart** — visueel afwijkend van een normale AI-bubbel (scherm 8)
- **Voorbeeldvraag-chip-rij** — beginstaat van een nieuw gesprek
