# CONTENT-MODEL.md — Redactionele regels

> Dit document beschrijft de **redactionele** regels bovenop het datamodel in [DATA-MODEL.md](DATA-MODEL.md) (canoniek). Hier geen nieuwe velden of entiteiten — wel: wie mag wat schrijven, wat elke override-actie in de praktijk betekent, en hoe de twee kennistypes redactioneel werken.

## Wie mag wat schrijven

| Rol | Mag schrijven in | Mag niet |
|---|---|---|
| Centrale redacteur | `Article`, `Section`, `ContentBlock` (de centrale boom) | Direct in `VariantOverride`-content namens een variant die niet de zijne is (in kleine teams vaak dezelfde persoon, maar het onderscheid blijft schema-niveau afgedwongen) |
| Variant-redacteur | Uitsluitend `VariantOverride`-records voor "zijn" variant | De centrale `Article`/`Section`/`ContentBlock`-inhoud rechtstreeks wijzigen |
| Beheerder | Alles hierboven, plus: `Variant`-configuratie, rollen, `aiApprovalStatus` voor pedagogische content, publicatie/goedkeuring | — |

Dit is niet alleen een UI-afspraak: het datamodel in [DATA-MODEL.md](DATA-MODEL.md) maakt het **technisch onmogelijk** voor een variant-redacteur om de centrale boom te wijzigen — er is domweg geen schrijfpad naartoe vanuit hun rol. Zie [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md) voor hoe dit in Payload wordt afgedwongen.

## Override-acties in detail, met voorbeelden

Alle acties werken op `article`-, `section`- of `block`-niveau (zie `VariantOverride.targetType` in [DATA-MODEL.md](DATA-MODEL.md)).

### `onveranderd`
Geen afwijking. Standaardgedrag wanneer er geen `VariantOverride`-record bestaat voor dat element binnen die variant.

### `aanvullen`
De centrale tekst blijft **ongewijzigd** zichtbaar; de override-inhoud verschijnt direct erna, visueel duidelijk gemarkeerd als aanvulling (niet vermengd met de centrale tekst).
> *Voorbeeld*: een centrale stap "Koppel een doelenset aan een groep" blijft staan; MijnMonti voegt een blok toe: "Binnen Montessori-groepen koppel je dit meestal op leerlingniveau in plaats van groepsniveau — zie [link]."

### `vervangen`
De centrale inhoud van dit specifieke element wordt **vervangen**, positie in de boom blijft gelijk. Gebruik dit spaarzaam en alleen wanneer de centrale tekst voor deze variant feitelijk onjuist of misleidend zou zijn — niet als standaardkeuze voor "we willen het net iets anders zeggen" (dat is `aanvullen` of terminologie).
> *Voorbeeld*: een centrale stap verwijst naar "hoofdgebiedprofiel"-terminologie op een manier die voor de vrijeschool-variant een compleet ander werkproces beschrijft — het blok wordt vervangen door een eigen versie, i.p.v. verwarrend aangevuld.

### `verbergen`
Het element valt volledig weg — uit pagina, zoekindex én AI-index. Op `article`- of `section`-niveau cascadeert dit naar alles eronder.
> *Voorbeeld*: een sectie over een functie die in MijnD niet bestaat, wordt voor die variant volledig verborgen.

### `ander_medium`
Alleen de afbeelding/screenshot/video van een blok wordt vervangen; de tekst blijft centraal.
> *Voorbeeld*: een screenshot met MijnLeerlijn-huisstijl wordt voor MijnMonti vervangen door een screenshot met de MijnMonti-huisstijl van dezelfde functionaliteit.

### `invoegen_voor` / `invoegen_na`
Een volledig variant-eigen blok wordt naast een centraal blok geplaatst, zonder dat blok zelf aan te raken.
> *Voorbeeld*: vóór een centrale stap voegt de vrijeschool-variant een contextblok toe: "Binnen het vrijeschoolonderwijs wordt dit onderdeel meestal gecombineerd met periodeonderwijs — hieronder de reguliere stappen."

## Uitsluitingsgedrag (samenvatting)

`verbergen` is de enige actie die content **volledig** laat verdwijnen (pagina, zoekindex, AI-index). Alle andere acties tonen nog steeds iets — dit is bewust: een uitsluiting is een expliciete redactionele keuze ("dit is niet relevant voor deze variant"), geen bijwerking van een andere actie.

## Terminologieregels

- Het terminologie-woordenboek (op `Variant`, zie [DATA-MODEL.md](DATA-MODEL.md)) is een **substitutielaag**, geen herschrijving: centrale auteurs hoeven nooit aan variant-woordkeuze te denken.
- Substitutie is **standaard aan** voor alle centrale tekst binnen een variant, en kan per element worden uitgeschakeld (`termOverridesApplied = false`) — bijvoorbeeld wanneer een `vervangen`-blok zelf al de juiste variant-terminologie bevat en dubbele substitutie ongewenst is.
- Terminologie-substitutie is eenvoudige woord-/frase-vervanging, geen contextuele herformulering — voor context-afhankelijke aanpassingen is `aanvullen` of `vervangen` het juiste instrument.

## Samenvoegalgoritme (redactioneel perspectief)

De technische implementatie is één gedeelde functie (zie [ARCHITECTURE.md](ARCHITECTURE.md) §Eén gedeelde samenvoegfunctie); redactioneel is de volgorde:

1. Begin met de centrale boom (secties → blokken, in centrale volgorde).
2. Per element: bestaat er een gepubliceerde `VariantOverride` voor de actieve variant? Pas de bijbehorende actie toe (zie tabel hierboven).
3. Pas terminologie-substitutie toe op alle getoonde centrale tekst (tenzij uitgeschakeld voor dat element).
4. Resultaat is de samengestelde content die **zowel** de pagina **als** de zoekindex **als** de AI-index gebruiken.

**Verplichte tests** (zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) §Verplichte tests) borgen dat dit algoritme overal exact hetzelfde resultaat geeft — een redacteur die een override test op de pagina, moet erop kunnen vertrouwen dat de AI dezelfde versie citeert.

## Twee soorten kennis en redactionele implicaties

Zie [DATA-MODEL.md](DATA-MODEL.md) §Kennistype & AI-goedkeuring voor de velden; hier de redactionele betekenis.

### A. Product- en softwarekennis (`knowledgeType = product`)
Bediening, knoppen, instellingen, stappen, foutoplossing, functionaliteiten. Dit is het merendeel van de bestaande handleidingen (zie `handleidingen/` in de repository — doelensets, vaardighedensets, periodeplanner, etc.). Redactioneel: normale publicatieworkflow, automatisch bruikbaar voor de AI zodra gepubliceerd.

### B. Onderwijskundige en implementatiekennis (`knowledgeType = pedagogisch`)
Doelgericht onderwijs, montessori, dalton, vrijeschoolonderwijs, implementatiekeuzes, praktijkvoorbeelden, begeleiding. Redactioneel gelden **strengere regels**:

- Publiceren op de website ≠ automatisch bruikbaar voor de AI. Een beheerder moet **expliciet** `aiApprovalStatus = goedgekeurd` zetten — een bewuste, aparte handeling.
- Dit voorkomt dat de AI onderwijskundig advies presenteert op basis van conceptcontent, een snelle aanvulling, of — erger — de eigen (niet-gecontroleerde) kennis van het taalmodel.
- Wanneer onvoldoende goedgekeurde onderwijskundige informatie beschikbaar is voor een vraag, is het **correcte, gewenste gedrag** dat de AI dit eerlijk meldt en doorverwijst naar het contactformulier — niet dat de AI "iets nuttigs" probeert te verzinnen. Zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) voor de technische afdwinging.

**Praktisch gevolg voor redacteuren**: bij het schrijven van pedagogische content is het raadzaam om alvast te markeren welke passages als "onderbouwd genoeg om als AI-antwoord te dienen" gelden, zodat de goedkeuringsstap bij publicatie geen verrassing is.
