# AI-KNOWLEDGE-STRATEGY.md — AI-assistent & RAG

> Zie [DATA-MODEL.md](DATA-MODEL.md) voor entiteiten en [CONTENT-MODEL.md](CONTENT-MODEL.md) voor de redactionele regels rond kennistypes. Kernregel door dit hele document heen: **de AI verzint niets** (zie [PROJECT.md](PROJECT.md) §Kernprincipes).

## RAG-overzicht

De AI-assistent beantwoordt vragen uitsluitend op basis van **retrieval-augmented generation (RAG)**: opgehaalde, goedgekeurde brokstukken content uit de centrale kennisbank + de afwijkingen van de actieve variant — nooit uit de eigen (ongecontroleerde) kennis van het taalmodel, met één uitzondering: taalbegrip en het herformuleren van gevonden content in vloeiend Nederlands. Nooit voor feitelijke inhoud.

## Indexeer-pijplijn op blokniveau

Getriggerd bij **publicatie** (niet bij elke conceptopslag):

1. Bij publiceren van een `Article` of `VariantOverride`: draai de gedeelde samenvoegfunctie (zie [ARCHITECTURE.md](ARCHITECTURE.md)) voor **elke variant** waarin dit artikel zichtbaar is — centraal-alleen-render voor varianten zonder override, samengestelde render voor varianten met een override, volledig overslaan voor `verbergen`.
2. Indexeer op **`ContentBlock`-niveau**, niet op heel-artikel-niveau — dit levert preciezere citaten (een AI-antwoord verwijst naar de exacte stap, niet naar een heel document) en is een expliciete eis vanuit de oprichter.
3. Genereer per blok een embedding met metadata: `{ articleId, sectionId, blockId, variantId, articleTitle, sectionTitle, sourceUrl, lastContentUpdate, mediaReference }`.
4. Zet `Article.embeddingStatus = indexed`.
5. Bij het intrekken/verbergen/archiveren van content: verwijder de bijbehorende blokken **actief** uit de index — "uit de AI-index halen" is een eersteklas stap in de publicatie-statusmachine, geen bijzaak. Anders bestaat het risico dat de AI citeert naar content die niet meer klopt of niet meer bestaat.

## Retrieval & variant-scoping

**Verplichte, harde scoping**: elke zoekopdracht filtert op `WHERE variantId = actieveVariant OR variantId IS centraal`, **op het niveau van de vectoropslag/query**, nooit als los na-filter in applicatiecode. Dit is het afdwingpunt tegen variant-lekkage: content van MijnMonti mag nooit terechtkomen in een antwoord aan een MijnD-gebruiker, ook niet via een bug of een hergebruikt "doorzoek alles"-hulpmiddel elders in de code.

## Twee soorten kennis & de `aiApprovalStatus`-poort

Zie [CONTENT-MODEL.md](CONTENT-MODEL.md) §Twee soorten kennis voor de redactionele achtergrond. Technisch:

- **Product- en softwarekennis** (`knowledgeType = product`): standaard opgenomen in de index zodra gepubliceerd.
- **Onderwijskundige/implementatiekennis** (`knowledgeType = pedagogisch`): wordt **pas** opgenomen in de index nadat `aiApprovalStatus = goedgekeurd` expliciet is gezet — een aparte poort, los van de normale publicatiestatus.
- De **systeeminstructie** van het model bevat een expliciet, niet-onderhandelbaar verbod: bij onderwijskundige vragen mag het model **nooit** zijn eigen (algemene) trainingskennis gebruiken en dat presenteren als MijnLeerlijn-advies — uitsluitend de opgehaalde, goedgekeurde brokstukken.
- Is er voor een onderwijskundige vraag onvoldoende goedgekeurde content beschikbaar (retrieval levert niets bruikbaars op), dan is het **gewenste, correcte gedrag** dat de AI dit eerlijk meldt en doorverwijst naar het contactformulier — zie §Betrouwbaarheidsdrempel hieronder, hetzelfde mechanisme.

## Providerabstractie & vergelijking

**Abstractielaag**: alle modelaanroepen lopen via één interne service (bijv. `getChatModel(config)`), gebouwd op de **Vercel AI SDK** — die heeft eersteklas adapters voor zowel Anthropic als OpenAI met een gedeelde interface voor chat/streaming/tool-calling. RAG-orchestratie (ophalen, prompt-opbouw, betrouwbaarheidscheck, citatieopmaak) is **eigen code**, niet een zwaardere framework-laag zoals LangChain — voor één goed gedefinieerde RAG-flow is dat makkelijker te doorgronden, debuggen en providers-onafhankelijk te houden. Wisselen van leverancier wordt zo een configuratiewijziging, geen herbouw.

**Korte vergelijking (Nederlandstalige RAG-taak), nog geen definitieve keuze:**

| Leverancier | Aandachtspunten |
|---|---|
| **Anthropic** (Claude) | Sterke NL-taalkwaliteit, sterk in "citeer bronnen / weiger bij onzekerheid"-instructievolging — precies het gedrag dat dit platform vereist. Prompt-caching kan de kosten van het RAG-patroon (systeeminstructie + opgehaalde brokstukken herhalen elke beurt) merkbaar drukken. |
| **OpenAI** (GPT-4-klasse) | Vergelijkbare NL-kwaliteit en RAG/citatiecapaciteit, breed ecosysteem aan voorbeelden/tooling. Een reëel tweede/fallback-optie, juist dankzij de abstractielaag. |
| **Overig** (Mistral, Gemini, lokale modellen) | Niet aanbevolen als primaire keuze voor de MVP — NL-taalkwaliteit en betrouwbaar "weiger bij onzekerheid"-gedrag zijn voor déze specifieke taak minder beproefd; kostenvoordeel weegt nu niet op tegen kwaliteitsrisico op een klantcontactpunt. Te heroverwegen zodra volume en echte gebruiksdata beschikbaar zijn. |

**Keuze van primaire leverancier: nog open** (zie [TODO.md](TODO.md)) — te bepalen na een praktijktest met echte Nederlandstalige handleiding-content, niet nu op voorhand.

## Bronvermelding (verplichte velden)

Elk AI-antwoord toont, waar beschikbaar:

- Titel van de gebruikte handleiding/kennisbron
- Relevante sectie of stap (blok-niveau, zie indexering hierboven)
- Link naar de brompagina, diep gelinkt naar de exacte sectie
- Datum van laatste inhoudelijke update (`lastContentUpdate`)
- Actieve variant
- Relevante screenshot/afbeelding, indien aanwezig bij dat blok

**Regel**: links en bronverwijzingen worden **nooit** door het taalmodel vrij geformuleerd — altijd opgelost uit de daadwerkelijk opgehaalde blok-metadata. Een citaat kan zo nooit ergens naartoe wijzen dat het model "verzonnen" heeft.

## Betrouwbaarheidsdrempel & doorverwijzing naar het contactformulier

De betrouwbaarheid wordt bepaald door de **kwaliteit van de zoekresultaten** (bijv. een te lage gelijkenis-score van het best passende blok, of te weinig relevante blokken binnen de actieve variant-scope) — **niet** door het model zelf te laten inschatten hoe zeker het is.

Onder de drempel (of: onvoldoende goedgekeurde pedagogische content, zie hierboven): **geen antwoordpoging**. In plaats daarvan een vaste, eerlijke melding ("dit staat niet betrouwbaar genoeg in de kennisbank") met een directe doorverwijzing naar het (voorgevulde) contactformulier — inclusief de gestelde vraag als omschrijving en de actieve variant, zie [SECURITY-AND-PRIVACY.md](SECURITY-AND-PRIVACY.md). Dit is een deterministische stap in eigen code, geen promptinstructie die het model zou kunnen negeren.

## Vectoropslag & motivatie

**`pgvector`, in dezelfde Postgres-database** als de overige content (geen apart vector-databaseproduct). Reden: het corpus is enkele honderden artikelen over een handvol varianten (duizenden blokken, geen miljoenen) — `pgvector` is hier ruim toereikend, variant-scoping (§Retrieval hierboven) wordt gewone SQL `WHERE`-filtering in plaats van een aparte filter-DSL, en her-indexering bij publicatie is een normale, transactionele database-update naast de contentwijziging zelf. Alleen te heroverwegen bij een substantiële schaalsprong.

## Systeeminstructie-richtlijnen

De systeeminstructie van het model moet expliciet vastleggen:

1. Antwoord uitsluitend op basis van de meegegeven, opgehaalde brokstukken.
2. Citeer altijd de bron (zie §Bronvermelding).
3. Verzin nooit een antwoord, link, of feit dat niet in de opgehaalde brokstukken staat.
4. Bij onderwijskundige vragen: gebruik nooit eigen trainingskennis als vervanging voor ontbrekende goedgekeurde bronnen.
5. Wees eerlijk en behulpzaam bij het doorverwijzen naar het contactformulier — dit is geen "falen", maar het gewenste eindpunt wanneer de kennisbank het antwoord niet heeft.
6. Houd rekening met de terminologie van de actieve variant in de formulering van het antwoord.

## Centrale Kennisbasis MijnLeerlijn vs. Helpdesk-onderwerpen vs. handleidingen (Fase 4, 2026-07-28)

Deze sectie beschrijft de **daadwerkelijk gebouwde**, huidige drielaags-architectuur van de Helpdesk AI. Vervangt de eerdere sectie "Achtergrondverhaal vs. handleidingen" (Helpdesk MVP 1.0) — die beschreef een bewust NIET-forced-include-ontwerp; dat is met Fase 4 bewust teruggedraaid naar een gegarandeerde, altijd-aanwezige achtergrondlaag. Zie `lib/assistant/kennisbasis-context.ts`, `lib/assistant/build-context.ts`, `lib/assistant/answer.ts` en `lib/assistant/process-public-question.ts` voor de code.

Drie afzonderlijke bronnen, elk met een eigen, niet-overlappende rol:

1. **Helpdesk-onderwerpen** (collectie `kennisbasis-onderwerpen`, in de UI hernoemd naar "Helpdesk-onderwerpen") — kleine, handmatig beheerde configuratie (officiële term/synoniemen/voorbeeldvragen per functie). Deterministisch, code-gestuurd via `lib/assistant/bepaal-intentie.ts`: bepaalt de **intentie** en de **officiële term** die de zoekvraag stuurt, en (bij 2+ plausibele kandidaten) de verduidelijkingsvraag. Géén embeddings, géén semantische retrieval — een kleine, volledig in de prompt gestufte lijst.
2. **Centrale Kennisbasis MijnLeerlijn** (Payload **Global**, singleton, `payload/globals/KennisbasisMijnleerlijn.ts`) — het volledige narratieve achtergrondverhaal (visie, samenhang, productlogica, begrippenkader). **Gegarandeerd, forced-include**: bij elke vraag (behalve een "onduidelijk"-verduidelijkingsvraag, die nooit tot een antwoord komt) haalt `haalCentraleKennisbasisOp()` de **gepubliceerde** stand op en stuurt die, als apart gelabeld promptblok, altijd mee — ongeacht enige similarity-score. Bewust géén onderdeel meer van de gewone semantische retrieval: `searchKnowledgePhased()` sluit bronnen met bronrol `background-model` expliciet uit (zie `lib/embeddings/similarity-search.ts`), zodat dezelfde inhoud niet dubbel (en mogelijk inconsistent) via twee kanalen tegelijk in de prompt terechtkomt.
3. **Handleidingen** (Handleidingbouwer-stappen + PDF-knowledge-sources) — blijven de leidende bron voor schermnamen, knoppen en concrete klik-stappen, gevonden via de bestaande gefaseerde semantische retrieval (ongewijzigd).

**Volgorde in de pijplijn** (`process-public-question.ts`):

1. `bepaalIntentie()` — intentie + officiële term (Helpdesk-onderwerpen), of een verduidelijkingsvraag.
2. `haalCentraleKennisbasisOp()` — de gepubliceerde centrale kennisbasis, altijd opgehaald (behalve bij "onduidelijk").
3. Zoekvraag = de officiële term (bij "opgelost") of de herschreven vraag (bij "geen-match").
4. `searchKnowledgePhased()` — gefaseerde semantische retrieval over handleidingen/overige bronnen (`background-model` uitgesloten).
5. `genereerAssistentAntwoord()` — de centrale kennisbasis staat als eerste, apart gelabeld blok in de prompt-context, vóór de genummerde bronblokken.

**Confidence-drempel ongewijzigd**: `MIN_SIMILARITY_VOOR_ANTWOORD` in `lib/assistant/answer.ts` blijft uitsluitend gebaseerd op de score van de beste **opgehaalde** (handleiding/knowledge-source-)bron — de centrale kennisbasis telt daar bewust niet in mee. Zonder een voldoende sterke handleiding/bron antwoordt de AI dus nog steeds niet, ook al is de centrale kennisbasis wél beschikbaar — "de AI mag nooit antwoorden geven zonder bron" blijft onverkort gelden voor concrete producthandelingen.

**Officiële term nooit stilzwijgend overschreven**: de systeeminstructie in `answer.ts` (regels 13-14) legt expliciet vast dat de centrale kennisbasis uitsluitend voor visie/betekenis/samenhang/productlogica dient, nooit voor klik-stappen, en dat de al-vastgestelde officiële term/configuratie (stap 1 hierboven) altijd leidend blijft. Signaleert het model een inhoudelijke tegenspraak tussen de centrale kennisbasis en een andere bron of de vastgestelde configuratie, dan lost het dat nooit stilzwijgend op: het antwoord wordt voorzichtig geformuleerd én het conflict wordt vastgelegd in het nieuwe `tegenstrijdigheid`-veld (zichtbaar en filterbaar in het AI Verbetercentrum).

**Structuurbehoud in de prompt**: de centrale kennisbasis wordt niet plat naar ononderbroken tekst omgezet — `richTextNaarGestructureerdeTekst()` (`lib/assistant/kennisbasis-richtext.ts`) behoudt koppen (`## `/`### `) en lijst-items (`- `), zodat de AI de hoofdstukindeling van het document blijft herkennen.

Regressietests: `lib/embeddings/similarity-search.test.ts` (background-model uitgesloten van `searchKnowledgePhased`, `searchKnowledge()` zelf ongewijzigd), `lib/assistant/kennisbasis-context.test.ts`, `lib/assistant/answer.test.ts` (kennisbasisblok altijd aanwezig wanneer meegegeven, confidence-gate ongewijzigd, tegenstrijdigheid-veld), `lib/assistant/kennisbasis-richtext.test.ts` (round-trip-verliesvrijheid), `lib/assistant/process-public-question.test.ts` (logging).

## Verplichte tests (samenvoegfunctie-pariteit)

Zie ook [ARCHITECTURE.md](ARCHITECTURE.md) §Eén gedeelde samenvoegfunctie. Concreet vereist:

- Een geautomatiseerde test die, voor een representatieve set `(article, variant)`-combinaties, bevestigt dat de door de AI geïndexeerde/geciteerde blokken exact overeenkomen met wat de samenvoegfunctie voor diezelfde combinatie aan de paginaweergave levert.
- Een geautomatiseerde test die bevestigt dat een retrieval-query voor variant A nooit blokken retourneert die uitsluitend aan variant B zijn gekoppeld (variant-lekkage-test, zie Risico's in het architectuurvoorstel).

Deze tests zijn **geen "nice to have"** — ze zijn de technische invulling van de belofte "de AI ziet nooit iets anders dan de gebruiker".

## Kwaliteitsbewaking

- AI-vraaglogs (vraag + opgehaalde blok-ID's + variant, zie [SECURITY-AND-PRIVACY.md](SECURITY-AND-PRIVACY.md) voor bewaartermijn) worden gebruikt om de betrouwbaarheidsdrempel na livegang bij te stellen — te streng voelt nutteloos (voortdurend doorverwijzen), te soepel riskeert onbetrouwbare antwoorden.
- Steekproefsgewijze controle van onderwijskundige antwoorden na livegang wordt aanbevolen, gezien het risico dat een taalmodel ongemerkt algemene kennis laat doorsijpelen (zie Risico's in het architectuurvoorstel).
- Uitgebreide analytics-infrastructuur is bewust uitgesteld (zie [PROJECT.md](PROJECT.md)) — kwaliteitsbewaking in de MVP is bewust eenvoudig: loggen + steekproef, geen dashboard-tooling.
