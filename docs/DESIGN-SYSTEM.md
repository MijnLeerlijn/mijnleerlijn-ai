# DESIGN-SYSTEM.md — Ontwerpsysteem

> Elke sectie is gemarkeerd: **[Brandbook]** = letterlijk overgenomen uit `Brand/mijn-leerlijn-brandbook .pdf`, **[Aanvullend]** = ontwerpkeuze die hier wordt geadviseerd (niet uit het brandbook), **[Ontbreekt]** = bestand/informatie die nog aangeleverd moet worden. Zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md) §Variant-theming-mechanisme voor hoe dit per variant verandert.

## Merkbasis — [Brandbook]

**Kleuren** (uit het brandbook, "Mijn Leerlijn kleurenpallet"):

| Naam | Hex |
|---|---|
| Rood | `#E10919` |
| Oranje | `#EC6608` |
| Geel | `#FEC905` |
| Groen | `#53AC32` |
| Blauw | `#1588C9` |
| Donkerblauw | `#002641` |

**Gradient**: vaste diagonale (45°) regenboogovergang blauw → groen → geel → oranje → rood — herkenningselement, gebruikt als dunne accentbalk, nooit als vlakvulling van grote oppervlaktes.

**Logo**:
- Woordmerk: "MIJN" (regulier gewicht) + "LEERLIJN" (vet), in donkerblauw op lichte achtergrond of wit op donkere/kleurrijke achtergrond.
- Beeldmerk: L-vorm opgebouwd uit vijf ineengeschoven vierkante haken, in rood/oranje/geel/groen/blauw (of wit/outline-variant op kleur).
- Vaste varianten uit het brandbook: logo in kleur, logo wit, logo op gradient, beeldlogo los, beeldlogo als social-profielfoto (in cirkel op donkerblauw), beeldlogo als outline.

**Slogan**: "Onderwijs vanuit **Inzicht**" — het woord "Inzicht" in een kader.

**Toepassingsstijl** (uit de voorbeeldpagina's in het brandbook): foto's van leerlingen "gemaskeerd" binnen de L-vorm van het beeldmerk, witte tekst op kleurvlak, het dunne L-patroon herhaald als subtiele achtergrondtextuur op effen kleurvlakken.

## Typografie — [Aanvullend]

Het brandbook legt **geen lettertype vast** (zie Ontbreekt hieronder) — het woordmerk gebruikt een vet, geometrisch schreefloos lettertype, maar dat is een logo-asset, geen aangewezen interface-lettertype.

**Advies: Inter** als primair lettertype.
- Open source (geen licentiekosten), variabele font-ondersteuning (goed voor laadprestatie).
- Uitstekende ondersteuning van Nederlandse diacritische tekens.
- Rustige, professionele, zeer leesbare uitstraling op scherm — sluit aan bij de wens "rustig, helder, professioneel, niet kinderlijk".
- Veelgebruikt in serieuze edtech- en beheertools, dus vertrouwd voor de doelgroep (leerkrachten, IB'ers, schoolleiders).

**Alternatief**: IBM Plex Sans, voor iets meer typografisch karakter met behoud van rust — te overwegen als Inter na een visuele test "te generiek" aanvoelt.

Schaal (indicatief, te verfijnen bij implementatie): één beperkte set stappen (bijv. 14/16/18/24/32/40px) — bewust klein aantal formaten voor rust en consistentie.

## Iconografie — [Aanvullend]

Het brandbook bevat geen iconenset (zie Ontbreekt hieronder).

**Advies: Lucide** (MIT-licentie, actief onderhouden fork van Feather Icons).
- Consistente, rustige lijnstijl — sluit beter aan bij "professioneel, niet druk" dan een afgeronde/speelse set.
- Brede dekking van benodigde begrippen (documenten, groepen, doelen/targets, instellingen, waarschuwing, tip, video, download).
- Eén enkele bibliotheek gebruiken, nooit mixen met een tweede iconenstijl — visuele consistentie is belangrijker dan het "perfecte" icoon per geval.

## Layout- en ruimteprincipes

**[Aanvullend]** Uitgangspunt: rustig, helder, professioneel. Concreet:
- Veel witruimte, één duidelijke leeskolombreedte voor artikeltekst.
- Kleur wordt **accentmatig** ingezet (knoppen, kaderlijnen, iconen, de gradientbalk) — niet als grote vlakvulling van content-oppervlaktes, in lijn met de brandbook-voorbeelden waar kleur vooral op marketing-hero's verschijnt, niet op functionele schermen.
- Eén heldere hiërarchie per pagina: titel, korte inleiding, gestructureerde content (secties/stappen), duidelijk gescheiden "aanvulling"-blokken bij variant-overrides (zie [CONTENT-MODEL.md](CONTENT-MODEL.md)).
- Componenten met zachte, consistente randen/kaartstijl — geen scherpe contrasten of felle kleurvlakken in de werkinterface.

## Componenten

**[Aanvullend]**, te ontwerpen zonder bestaand voorbeeld (zie Ontbreekt hieronder):

- **KB-artikel/sectie/blok-weergave**: volgt de structuur uit [DATA-MODEL.md](DATA-MODEL.md) — sectiekoppen, genummerde stappen met duidelijke stapmarkering, apart gestileerde waarschuwing- en tip-blokken (kleur/icoon-onderscheid, geen felle achtergrondkleuren), inline afbeeldingen met bijschrift.
- **Zoeken**: prominent, direct zichtbaar op de homepage en op elke pagina bereikbaar; resultaten tonen artikel + relevante sectie, niet alleen de artikeltitel.
- **AI-chat**: gesprek met duidelijk onderscheiden "Bronnen"-lijst onder elk antwoord (zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md)); een expliciet, herkenbaar "ik weet het niet zeker"-antwoordtype met duidelijke doorverwijzing naar het contactformulier — visueel anders dan een gewoon antwoord, niet verstopt.
- **Contactformulier**: overzichtelijke, gefaseerde indeling (contactgegevens → probleembeschrijving → bijlagen) in plaats van één lange lijst velden; zichtbare privacywaarschuwing bij omschrijving/upload (zie [SECURITY-AND-PRIVACY.md](SECURITY-AND-PRIVACY.md)).
- **Beheer-shell**: functioneel en dicht (geen marketing-uitstraling), duidelijke statuslabels (concept/in review/gepland/gepubliceerd) en een zichtbaar onderscheid tussen "centrale content" en "variant-overrides" zodat een redacteur nooit per ongeluk denkt in de verkeerde laag te werken.

## Variant-theming-mechanisme

Zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md) voor het volledige model. Ontwerp-samenvatting: het ontwerpsysteem (typografie, spacing, componentvormen, layoutprincipes) is **vast** en identiek voor alle varianten — alleen **logo, productnaam en accentkleur** wisselen per variant, binnen datzelfde systeem. Dit voorkomt dat een variant "een andere website" aanvoelt, en houdt de belofte "basisstijl blijft herkenbaar MijnLeerlijn" overeind ook wanneer een variant een eigen accentkleur heeft.

## Toegankelijkheid

**[Aanvullend]**: WCAG 2.1 AA als uitgangspunt — voldoende kleurcontrast (met name bij accentkleuren op witte/donkere achtergronden, te checken per variant-accentkleur), verplichte alt-tekst op alle media (zie `Media.altText` in [DATA-MODEL.md](DATA-MODEL.md)), toetsenbordnavigeerbare AI-chat en formulieren, en geen informatie die uitsluitend via kleur wordt overgebracht (bijv. waarschuwing-/tip-blokken altijd ook met een icoon en label, niet alleen een kleur).

## Ontbreekt

Expliciet, uit de repository-inspectie:
- **Lettertype**: geen naam/gewichten in het brandbook, `Brand/fonts/` is leeg → advies hierboven is een aanvullende keuze, geen brandbook-regel.
- **Iconenset**: `Brand/icons/` is leeg → advies hierboven is een aanvullende keuze.
- **Beeldbank/foto's**: `Brand/images/` is leeg — de brandbook-voorbeelden gebruiken stockfoto's van leerlingen die niet als los bestand aanwezig zijn.
- **UI-componentvoorbeelden**: `Brand/ui-examples/` is leeg — geen bestaande knoppen/kaarten/formulierstijlen om op voort te bouwen; componenten hierboven zijn dus nieuw ontworpen op basis van de brandbook-principes, niet overgenomen.
- **Tone-of-voice-document**: niet aanwezig in het brandbook. Toon vanuit de oprichter (zie [PROJECT.md](PROJECT.md)/gesprekscontext): persoonlijk, warm, duidelijk, praktisch, niet te technisch, uitleg in logische stappen, gericht op snel verder kunnen werken — dit is vastgelegd als richtlijn, geen brandbook-regel.
- **Merkbestanden voor MijnMonti, MijnD en de vrijeschool-variant**: nog niet aangeleverd — zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md) §Placeholder-branding-regels.
