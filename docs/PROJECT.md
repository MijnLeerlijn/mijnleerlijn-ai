# PROJECT.md — MijnLeerlijn AI Kennisplatform

> Status: MVP in ontwerpfase. Dit document is het startpunt voor iedereen (mens of AI) die met dit project werkt.

## Waarom bestaan we?

Scholen die met MijnLeerlijn werken, willen snel en zelfstandig antwoord op hun vragen — zonder daarvoor de helpdesk te hoeven bellen of mailen. Met de opkomst van meerdere onderwijsvarianten (MijnMonti, MijnD, vrijeschool) zou dezelfde vraag straks in aparte systemen apart beantwoord moeten worden, met het risico dat antwoorden uit elkaar gaan lopen. Dat is niet houdbaar.

We bouwen dit platform omdat kennis over de software op één plek moet staan — betrouwbaar, actueel en één keer geschreven — terwijl elke onderwijsvariant er zijn eigen taal en nadruk aan kan geven. Een AI-assistent maakt die kennis direct toegankelijk, maar alleen als hij nooit iets verzint en altijd eerlijk is over wat hij niet zeker weet. Dat vertrouwen is de kern van waarom dit platform bestaat: leerkrachten en schoolteams moeten erop kunnen bouwen.

## Visie & doel

MijnLeerlijn bouwt één centraal, AI-gedreven kennisplatform ("kennisplatform") dat leerkrachten, IB'ers, kwaliteitscoördinatoren, schoolleiders en beheerders helpt om zelfstandig antwoord te vinden op vragen over het gebruik van de software — via een doorzoekbare kennisbank, een AI-assistent die betrouwbaar antwoordt op basis van goedgekeurde bronnen, en een contactformulier als vangnet wanneer de kennisbank het antwoord niet heeft.

Het platform vervangt op termijn de huidige helpdesk-pagina op mijnleerlijn.nl/klantenservice, maar dan geschikt voor **meerdere onderwijsvarianten van dezelfde onderliggende software**, met content die één keer centraal wordt beheerd.

## Doelgroep

- Leerkrachten
- Intern begeleiders (IB'ers)
- Kwaliteitscoördinatoren
- Schoolleiders
- Schoolbeheerders

**Nadrukkelijk niet** de primaire doelgroep van dit platform: leerlingen en ouders.

## Scope

**Dit platform is wel:**
- Een centrale kennisbank met handleidingen, opgebouwd uit secties en contentblokken (zie [DATA-MODEL.md](DATA-MODEL.md))
- Een AI-assistent die uitsluitend antwoordt op basis van goedgekeurde bronnen, met bronvermelding
- Een contactformulier dat doorverwijst naar de helpdesk wanneer de kennisbank geen betrouwbaar antwoord heeft
- Een beheeromgeving waarin content en varianten worden beheerd, ontworpen voor niet-technische redacteuren

**Dit platform is (voorlopig) niet:**
- Een leerlingomgeving of oudercommunicatiekanaal
- Een academy/cursusplatform (later fase)
- Een inspiratie- of praktijkvoorbeeldenbank (later fase)
- Een vervanging van mijnleerlijn.nl als commerciële website — die blijft apart bestaan

## Onderwijsvarianten

| Variant | Status |
|---|---|
| MijnLeerlijn | Referentievariant, eerst gebouwd, brandbook aanwezig in `Brand/` |
| MijnMonti (montessori) | Tweede MVP-variant, merkbestanden volgen later — zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md) |
| MijnD (dalton) | Verwacht in het eerste jaar, nog geen merkbestanden |
| Vrijeschool-variant | Verwacht in het eerste jaar, merknaam nog niet vastgesteld — behandeld als configureerbare variant zonder definitieve naam |
| Verdere varianten / white-label | Geen vast maximum — de architectuur mag hier niet op begrensd zijn |

Elke variant is een **configuratie**, geen aparte codebase of website. Zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md) voor hoe een variant wordt toegevoegd en beheerd.

## Kernprincipes

Deze principes zijn leidend voor elke ontwerp- en bouwbeslissing in dit project:

1. **Eén keer centraal beheren.** Content wordt nooit per variant gekopieerd; varianten voegen alleen gecontroleerde afwijkingen toe (zie [CONTENT-MODEL.md](CONTENT-MODEL.md)).
2. **De AI verzint niets.** Antwoorden komen uitsluitend uit expliciet goedgekeurde bronnen, met bronvermelding. Bij onvoldoende betrouwbare informatie zegt de AI dat eerlijk en verwijst door naar het contactformulier (zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md)).
3. **Wat de AI ziet, ziet de gebruiker ook.** Pagina, zoekindex en AI-index gebruiken dezelfde samenvoegfunctie — geen aparte waarheid voor de AI.
4. **Rustig, professioneel, helder.** De interface is kalm en duidelijk; het kleurrijke logo en de regenbooggradient zijn herkenningspunten, geen leidraad voor een drukke of kinderlijke interface (zie [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)).
5. **Geen leerlinggegevens in het contactformulier.** Gebruikers worden hier expliciet voor gewaarschuwd (zie [SECURITY-AND-PRIVACY.md](SECURITY-AND-PRIVACY.md)).
6. **Geen onomkeerbare leverancierskeuzes.** AI-provider en hosting zijn via een abstractielaag vervangbaar (zie [ARCHITECTURE.md](ARCHITECTURE.md)).
7. **Eenvoud voor de redacteur.** Het beheerteam is klein en niet-technisch; de beheeromgeving moet dat weerspiegelen (zie [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md)).

## Relatie tot mijnleerlijn.nl en sCoolsuite B.V.

- **mijnleerlijn.nl** blijft bestaan als commerciële/informatieve website. Het kennisplatform is een aparte applicatie met dezelfde merkidentiteit, technisch zelfstandig, met wederzijdse links naar het juiste helpcentrum.
- **sCoolsuite B.V.** is de juridische entiteit achter MijnLeerlijn. Deze naam hoeft niet prominent in de hoofdinterface te staan, maar komt terug in de footer en op juridische pagina's (privacyverklaring, voorwaarden). Exacte juridische teksten worden later aangeleverd — zie [SECURITY-AND-PRIVACY.md](SECURITY-AND-PRIVACY.md).
- De bestaande helpdesk (mijnleerlijn.nl/klantenservice) blijft actief tijdens de ontwikkeling en wordt pas vervangen als het nieuwe platform getest en goedgekeurd is. Bestaande categorieën, handleidingen en het huidige contactformulier dienen als inhoudelijke referentie, niet als technisch uitgangspunt.

## Fasering

**MVP (eerste werkende versie):**
- MijnLeerlijn-branding en homepage
- Zoeken
- AI-assistent met bronvermelding op blokniveau
- Centrale handleidingen in het modulaire contentmodel
- Ondersteuning van afbeeldingen/screenshots
- MijnMonti als werkende tweede voorbeeldvariant
- Contactformulier
- Eenvoudige beheeromgeving voor content én varianten

**Bewust uitgesteld (na de MVP):**
- Academy
- Inspiratie en praktijkvoorbeelden
- Uitgebreide analytics
- Geavanceerde automatisering
- Klant-only afgeschermde content
- Meerstaps-goedkeuringsworkflows
- Volwaardige incident-response-tooling

## Wanneer is dit project succesvol?

- Leerkrachten en IB'ers vinden zelfstandig een antwoord via de kennisbank of AI-assistent, zonder de helpdesk te hoeven mailen — het contactformulier is het vangnet, niet het eerste kanaal.
- De AI-assistent citeert altijd een bron, of zegt eerlijk dat het antwoord er niet is — geen enkel verzonnen antwoord.
- Nieuwe content wordt één keer geschreven; MijnMonti toont aantoonbaar eigen naam, kleur, terminologie en aanvullingen zonder dat er iets gekopieerd is.
- Een nieuwe onderwijsvariant kan via de beheeromgeving worden toegevoegd, zonder nieuwe code of een nieuwe website.
- Redacteuren zonder technische achtergrond kunnen zelfstandig content schrijven, reviewen en publiceren.
- De bestaande helpdesk kan met vertrouwen worden uitgefaseerd, omdat het nieuwe platform aantoonbaar minstens zo goed werkt.

## Documentenoverzicht

| Document | Inhoud |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Systeemopbouw, hosting, variant-herkenning, renderstrategie |
| [DATA-MODEL.md](DATA-MODEL.md) | Canonieke databronmodel (Article/Section/ContentBlock/VariantOverride/…) |
| [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md) | Hoe varianten werken, worden toegevoegd en beheerd |
| [CONTENT-MODEL.md](CONTENT-MODEL.md) | Redactionele regels: wie mag wat schrijven, override-acties, kennistypes |
| [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md) | CMS-keuze, redactieproces, rollen, versies, audit |
| [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) | RAG-opzet, bronvermelding, betrouwbaarheid, providerkeuze |
| [SECURITY-AND-PRIVACY.md](SECURITY-AND-PRIVACY.md) | Gegevens, bewaartermijnen, opslag, AVG-uitgangspunten |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Merk, typografie, iconen, componenten, toegankelijkheid |
| [UX-DESIGN.md](UX-DESIGN.md) | Alle 15 schermen: doel, wireframe, flows, staten, sitemap, navigatie |
| [UI-DESIGN.md](UI-DESIGN.md) | Visuele stijl tot componentniveau (40 onderdelen), pixel-/tokenwaarden |
| [HOMEPAGE-SPEC.md](HOMEPAGE-SPEC.md) | Definitieve functionele beslissingen voor de homepage |
| [HOMEPAGE-VISUAL-SPEC.md](HOMEPAGE-VISUAL-SPEC.md) | Pixel-perfect redline-specificatie van de homepage |
| [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md) | Technische blauwdruk: projectstructuur, componentarchitectuur, routing, state, providers |
| [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) | Bouwfases met afhankelijkheden, Definition of Done, leidende documenten |
| [TODO.md](TODO.md) | Statusoverzicht en volgende bouwstappen |
| [CLAUDE.md](../CLAUDE.md) | Onboarding voor toekomstige (AI-)ontwikkelsessies |

## Openstaande beslissingen

Zie [TODO.md](TODO.md) voor de volledige, actuele lijst. De belangrijkste vóór de bouw start: primaire AI-leverancier, authenticatie-oplossing voor de beheeromgeving, opslag- en e-maildienst, en de uitkomst van de Payload-geschiktheidstoets.
