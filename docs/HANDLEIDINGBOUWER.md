# HANDLEIDINGBOUWER.md — technische documentatie

> Geschreven voor een ontwikkelaar die dit project voor het eerst opent, zonder voorkennis van dit gesprek. Zie ook [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) (algemene RAG-uitleg) en [DATA-MODEL.md](DATA-MODEL.md) (canoniek datamodel van de rest van het platform) — dit document beschrijft alleen de Handleidingbouwer, die ernaast bestaat.

De Handleidingbouwer is de vervanging van "een handleiding is een los PDF-bestand" door "een handleiding is een reeks gestructureerde stappen in het CMS". Diezelfde stap-records worden gebruikt voor (1) de publieke pagina `/handleidingen/[slug]`, (2) de sidebar naast de helpdesk-chat, én (3) de AI-retrieval die antwoorden opbouwt. Bestaande PDF-handleidingen (collectie `knowledge-sources`) blijven gewoon werken als aanvullende, legacy-bron — er is niets aan weggehaald.

## 1. Architectuur

**Bouwstenen, van CMS tot scherm:**

| Laag | Bestand(en) |
|---|---|
| Datamodel | `payload/collections/Handleidingen.ts` |
| Voorbeeldvragen (homepage) | `payload/globals/HelpdeskVoorbeeldvragen.ts` |
| Publicatie-/versielogica | `lib/knowledge/handleiding-publicatie.ts` |
| Opruimen bij verwijderen | `lib/knowledge/delete-handleiding.ts` |
| Embedden (indexeren) | `lib/embeddings/process-embedding.ts` (`embedHandleiding`), `lib/embeddings/embeddable-text.ts` (tekstopbouw) |
| Retrieval (zoeken + prioriteit) | `lib/embeddings/similarity-search.ts` |
| Context voor het taalmodel | `lib/assistant/build-context.ts` |
| AI-antwoord + prompt | `lib/assistant/answer.ts` |
| Publieke chat-orkestratie | `lib/assistant/process-public-question.ts` |
| Publieke chat-UI | `components/organisms/HelpdeskChat.tsx` |
| Publieke handleidingpagina | `app/(frontend)/(public)/handleidingen/[slug]/page.tsx` + `components/organisms/HandleidingStappenLijst.tsx` |
| Sidebar (PDF's + handleidingen samen) | `app/api/knowledge/public-manuals/route.ts` + `components/organisms/HandleidingenSidebar.tsx` |
| CMS-preview | `payload/components/HandleidingPreviewLink.tsx` |
| Media-URL-normalisatie | `lib/format/media-url.ts` |

**Hoe het samenhangt, in één alinea:** een beheerder schrijft stappen in het CMS. Bij publiceren embed een Payload-hook automatisch de handleiding én elke stap apart (eigen embedding-vector per stap). Een bezoekersvraag doorloopt dezelfde retrieval-pijplijn als altijd (`searchKnowledgePhased` → `buildContext` → `genereerAssistentAntwoord`), maar kandidaten kunnen nu ook `type: "handleiding"` of `type: "handleiding-step"` zijn. Vindt de retrieval een relevante stap, dan geeft de AI een kort, samenvattend antwoord (geen eigen genummerde lijst — zie §4) en toont de pagina daaronder de exacte stap(pen) met screenshot(s), gevolgd door een link naar de volledige handleiding.

**Prioriteit tussen bronnen** (Handleidingen vs. PDF's vs. achtergrondkennis): elke bron krijgt een `BronRol` (`lib/embeddings/similarity-search.ts`): `release-note` > `handleidingstap` > `manual` (PDF/artikel) > `background-model` > `faq` > `support`. Deze volgorde is uitsluitend een **tie-break bij (bijna) gelijke similarity-score** — een sterk relevante PDF wint nog altijd van een zwak relevante handleidingstap. Bij gelijke relevantie wint de gestructureerde stap dus altijd van een PDF over hetzelfde onderwerp; die PDF verdwijnt niet, maar zakt naar de "Bekijk handleiding(en)"-lijst als aanvullende download. Dezelfde regel staat, in woorden, in de systeeminstructie van het model (`lib/assistant/answer.ts`, regel 7) zodat het model conflicten tussen bronnen ook zelf correct kan afwegen wanneer de tie-break niet van toepassing is (bijv. een release note over een recente wijziging wint altijd, ongeacht bronrol-rang).

## 2. Datamodel

### `Handleidingen` (top-niveau)

| Veld | Type | Waarom |
|---|---|---|
| `internTitel` / `titel` | text | Intern vs. publiek — zelfde patroon als andere content-collecties. |
| `slug` | text, uniek | Voor `/handleidingen/{slug}`. |
| `korteOmschrijving` | textarea | Publieke intro + onderdeel van de handleiding-niveau-embedding. |
| `categorie` | relationship → `categories` | Hergebruikt, zelfde categorieën als PDF's. |
| `variantContext` | relationship → `variants`, hasMany | Leeg = alle varianten. |
| `status` | select: `concept`/`gepubliceerd`/`gearchiveerd` | **Bewust geen** Payload `versions.drafts` — dat gaf bij `Articles.ts` een Postgres-enum-naamsbotsing die dwong tot hernoemen naar `articleStatus`. Zonder `versions.drafts` is een gewoon select-veld `status` veilig. |
| `zichtbaarInSidebar` | checkbox | Los van AI-bruikbaarheid: bepaalt alleen of de sidebar 'm toont. Een verborgen-in-sidebar handleiding kan dus wél door de AI gebruikt worden. |
| `volgorde` | number | Sorteervolgorde binnen de categorie in de sidebar. |
| `legacyBron` | relationship → `knowledge-sources` | Optionele koppeling naar een bestaande PDF: toont een downloadlink onderaan de publieke pagina. Bewust **geen** importlogica — alleen het veld ligt klaar (zie §5). |
| `versie` | number, readOnly | Simpele teller, **geen** volwaardig versiebeheer. Leeg tot de eerste publicatie, dan 1, daarna +1 per publicatie. Zie §3. |
| `gepubliceerdOp` / `gepubliceerdDoor` | date / relationship → `users` | Alleen gezet bij de overgang náár `gepubliceerd` — los van `laatstBijgewerkt`, dat bij élke wijziging verandert. |
| `stappen` | array, min. 1 rij | Zie hieronder. |
| `embeddingStatus`/`embeddedAt`/`embeddingModel`/`embeddingTextHash`/`embedding` | — | Zelfde 5-veldpatroon als `Articles`/`KnowledgeSources` — de handleiding-niveau-embedding (titel + korte omschrijving + zoekwoorden), voor brede vragen die niet op één specifieke stap wijzen. |

### `stappen` (array-rij)

| Veld | Type | Waarom |
|---|---|---|
| `id` | *automatisch door Payload* | **De stabiele stap-ID.** Verandert nooit door herordenen of een titelwijziging. Dit is de sleutel waarmee retrieval, context-opbouw en de publieke respons een stap terugvinden — bewust **niet** het patroon van `KnowledgeSources.chapters`, dat op exacte titel-tekst matcht en dus stilzwijgend breekt bij een hernoemde titel. Zoek in de code naar `stepId` om alle plekken te vinden waar dit consequent wordt doorgegeven. |
| `titel` | text | Stap-titel, ook gebruikt als `chapterTitle` in retrieval-resultaten. |
| `uitleg` | richText (Lexical, beperkt tot vet/lijst/link) | Bewust beperkte toolbar — geen kleuren/koppen/vrije HTML, om de admin-UX simpel te houden voor niet-technische redacteuren. Voor embeddings/AI wordt dit automatisch omgezet naar platte tekst (`richTextNaarPlatteTekst`, `lib/embeddings/embeddable-text.ts`, gebruikt Lexical's eigen `convertLexicalToPlaintext`). |
| `media` | array, elke rij `{ bestand: upload→media, onderschrift }` | Bewust **`media`** genoemd, niet `afbeeldingen` — zodat later ook video toegevoegd kan worden zonder het datamodel te wijzigen. Voor nu wordt alleen een afbeelding ondersteund (niet technisch afgedwongen, alleen in de admin-beschrijving vermeld). Alt-tekst komt van `Media.altText` zelf, geen dubbel veld dat uit sync kan raken. |
| `waarschuwing` / `tip` | textarea | Los getoond met eigen visuele stijl (oranje/geel), zowel in de chat als op de publieke pagina. |
| `knopOfSchermnaam` | text | Vrij tekstveld voor bijv. "Beheer > Hoofdgebiedprofielen" — puur informatief, geen technische afdwinging. |
| `interneNotitie` | textarea | **Nooit** publiek of in AI-tekst — bewust uitgesloten in `buildStapText()`/`buildHandleidingText()` (`embeddable-text.ts`) en in de publieke-pagina-mapping. |
| `verborgen` | checkbox | "Tijdelijk verbergen" zonder verwijderen. Retrieval filtert hier hard op (`verzamelKandidaten()`), maar een verborgen stap wordt **wél** gewoon geëmbed — verbergen/tonen werkt zo instant, zonder herembedden. |
| `embeddingStatus`/`embeddingTextHash`/`embedding` | — | Per-stap embedding-bookkeeping. Let op: `embeddingStatus` op stapniveau wordt in de huidige code nooit expliciet gezet (alleen `embedding`/`embeddingTextHash`) — zie §7 Bekende beperkingen. |

### `helpdesk-voorbeeldvragen` (Global)

Eén array `vragen` (max. 6 rijen, elk `{ tekst }`), publiek leesbaar. Los van de `Handleidingen`-collectie — puur homepage-configuratie.

### `assistant-conversations.steps` (uitbreiding op een bestaande collectie)

Nieuw array-veld naast het bestaande `sources`-veld: `{ handleidingId, stepId, stepNummer }` per getoonde stap. Uitsluitend **klaargezet voor toekomstige analytics** — er wordt nu nergens actief mee gerapporteerd, zie §5.

## 3. Publicatieflow

```
concept ──(status → gepubliceerd)──> gepubliceerd ──(afterChange-hook)──> embedding ──> vindbaar voor de AI
```

**Wat gebeurt er per actie:**

- **Wijzigen (concept blijft concept)**: alleen `laatstBijgewerkt` wordt bijgewerkt (`beforeChange`-hook). Geen embedding, geen AI-effect.
- **Publiceren (concept → gepubliceerd)**: de `beforeChange`-hook roept `bepaalPublicatieVelden()` (`lib/knowledge/handleiding-publicatie.ts`, apart en met eigen tests) aan — deze functie is de **enige plek** die bepaalt of dit een échte publicatie-overgang is. Alleen dan: `versie` +1 (of 1 als dit de eerste keer is), `gepubliceerdOp`/`gepubliceerdDoor` gezet. Daarna triggert de `afterChange`-hook `embedHandleiding()`: embed de handleiding-tekst én, in een lus, elke stap-tekst (via `embedIfChanged` — een hash-vergelijking, dus een ongewijzigde stap kost nooit een nieuwe OpenAI-aanroep).
- **Opnieuw opslaan, al gepubliceerd, tekst gewijzigd**: `afterChange` embed opnieuw, maar `bepaalPublicatieVelden()` doet niets (geen nieuwe transitie) — `versie` blijft gelijk. Bewust: "pas opnieuw indexeren bij publiceren/wijzigen, niet bij elke toetsaanslag" wordt hier bereikt doordat de hash-vergelijking een no-op-save gratis maakt, niet doordat er een aparte "publiceer nu"-knop nodig is.
- **Archiveren (gepubliceerd → gearchiveerd)**: geen aparte "haal uit index"-actie nodig. `verzamelKandidaten()` in `similarity-search.ts` filtert hard op `status: gepubliceerd` — een gearchiveerde handleiding verdwijnt vanzelf uit elke volgende zoekopdracht, ook al blijft de oude embedding-data nog in de rij staan (onschadelijk, want nooit meer opgehaald).
- **Verwijderen**: de `afterDelete`-hook roept `ruimHandleidingMediaOp()` (`lib/knowledge/delete-handleiding.ts`) aan — verwijdert alle gekoppelde `Media`-documenten van stapafbeeldingen (en daarmee, via de gedeelde `vercelBlobStorage`-plugin, automatisch de onderliggende bestanden in Blob-opslag). Stap-embeddings zelf verdwijnen vanzelf mee (het zijn subrijen van het verwijderde document, geen aparte tabel).

**Belangrijke technische valkuil, al opgelost — lees dit voordat je aan deze hooks sleutelt:** `embedHandleiding()` wordt aangeroepen **vanuit** de `afterChange`-hook van hetzelfde document. Roep je daarin `payload.update()`/`payload.findByID()` aan **zonder** de hook's `req` door te geven, dan opent Payload een *nieuwe* database-transactie die op de rij-lock van de nog-openstaande buitenste transactie wacht — en dat hangt oneindig (ontdekt tijdens live verificatie van deze feature). Geef `req` dus altijd door aan elke Payload-aanroep binnen deze hook-keten.

**Zelf-begrensde recursie, bewust zo gelaten:** `embedHandleiding()`'s eigen `payload.update()`-aanroep triggert de `afterChange`-hook opnieuw. De tweede aanroep vindt (via de hash-vergelijking) niets meer gewijzigd en doet zelf geen update meer — de recursie stopt dus vanzelf na twee niveaus, met slechts één extra, goedkope hash-vergelijking, geen extra AI-aanroepen.

## 4. AI-flow

**Van vraag tot antwoord (publieke chat, `lib/assistant/process-public-question.ts`):**

1. `rewriteSearchQuery()` herschrijft de vraag tot een kortere zoekvraag.
2. `searchKnowledgePhased()` (`similarity-search.ts`) verzamelt kandidaten uit **alle** geïndexeerde bronnen — inclusief, sinds deze feature, elke gepubliceerde handleiding (handleiding-niveau) én elke niet-verborgen stap daarin (stap-niveau, elk met zijn eigen embedding-vector) — en scoort ze op cosinegelijkenis met de vraag.
3. `buildContext()` zet de top-treffers om in tekstblokken voor het taalmodel. Voor een `handleiding-step`-treffer wordt de stap **via de stabiele `stepId` teruggezocht** (niet via titel — zie §2), zodat een latere titelwijziging deze koppeling nooit breekt.
4. `genereerAssistentAntwoord()` (`lib/assistant/answer.ts`) roept het taalmodel aan met een systeeminstructie die verwijst naar bronrol en (voor Knowledge Sources) prioriteit, zodat het model zelf conflicten tussen bronnen kan afwegen.
5. `bepaalRelevanteStappen()` vertaalt **alleen de `handleiding-step`-context-items die het antwoord daadwerkelijk gebruikte** naar een publiek `steps`-veld: handleiding-titel/-slug, stapnummer, platte uitlegtekst, en de gekoppelde afbeelding(en) met caption/alt.
6. De publieke respons bevat dus altijd drie gescheiden velden: `answer` (lopende tekst), `manuals` (PDF-citaten, ongewijzigd bestaand gedrag) en `steps` (nieuw — de stap-kaarten met screenshot).

**Waarom de AI nooit zelf een afbeelding kiest:** een afbeelding wordt uitsluitend gekoppeld via de stabiele `stepId` die uit de *retrieval* komt, nooit via iets dat het taalmodel zelf teruggeeft. Het model ziet in de prompt alleen platte tekst (`richTextNaarPlatteTekst()`) — het kent geen bestandsnamen, URL's of media-ID's, en kan er dus ook nooit een verzinnen of verwarren. `bepaalRelevanteStappen()` haalt de bijbehorende `media`-rijen rechtstreeks uit de database op, gebaseerd op exact dezelfde `stepId` die de retrieval al had gevonden. Dit is een structurele garantie (code, geen promptinstructie).

**Voorkomen van dubbele stappenlijsten (UX-fix):** als de context een `handleiding-step` bevat, wordt aan `genereerAssistentAntwoord()` `{ heeftStructuredStappen: true }` meegegeven. De systeeminstructie vervangt dan regel 4 ("werk de concrete stappen uit") door een instructie om **geen eigen genummerde lijst** te schrijven, maar kort samen te vatten en te verwijzen naar de stap-kaarten eronder. **Let op:** dit is, in tegenstelling tot de status-/verborgen-filters hierboven, een **promptinstructie**, geen harde code-regel — het model volgt 'm in de praktijk consistent op, maar er is geen deterministische garantie zoals bij de andere filters in dit document. Zie ook §7.

De interne `/assistant`-pagina (`lib/assistant/process-question.ts`) gebruikt dezelfde `genereerAssistentAntwoord()`, maar roept 'm aan **zonder** deze optie en toont geen stap-kaarten — daar verandert dus niets.

## 5. Uitbreidbaarheid

**Bewust voorbereid, nu nog niet gebouwd:**

- **Video's**: het sub-array heet `media`, niet `afbeeldingen` — een video-veldtype kan er later naast zonder migratie van bestaande data.
- **Analytics**: `assistant-conversations.steps` legt nu al vast welke handleiding/stap bij elk antwoord getoond werd, in dezelfde vorm als het publieke `steps`-responsveld. Er wordt nog niets gelogd voor duim omhoog/omlaag-koppeling of "contactformulier geopend" — maar omdat `conversationId` al naar de frontend gaat, kan een latere analytics-ronde dat zonder schemawijziging aan hetzelfde gesprek koppelen.
- **PDF-import**: `legacyBron` (koppeling naar een bestaande `knowledge-sources`-PDF) staat al op het datamodel. Er is bewust **geen** omzet-/importknop gebouwd — eerst moest de Handleidingbouwer zelf stabiel draaien.
- **Versiebeheer**: `versie`/`gepubliceerdOp`/`gepubliceerdDoor` zijn een minimaal fundament (een teller + wie/wanneer), geen volwaardige revisiegeschiedenis. Een latere uitbreiding kan hierop voortbouwen zonder deze drie velden opnieuw te hoeven ontwerpen.

**Bewust buiten scope gehouden (geen voorbereiding, geen halve implementatie):**

- Automatische PDF→stappen-conversie (OCR/tekst-suggestie/afbeelding-extractie).
- Payload's ingebouwde live-preview (iframe/realtime sync) — de preview-link opent gewoon de echte publieke pagina.
- Print/PDF-export van een handleidingpagina.
- Gelijktijdige meerdere-redacteuren-ondersteuning.
- Nieuwe onderwijsvarianten.
- AI-gegenereerde screenshots of video-instructies.

## 6. Productiechecklist

**Environment variables** (naast de al bestaande, algemene variabelen zoals `PAYLOAD_SECRET`/`DATABASE_URI`/`OPENAI_API_KEY`):

- `BLOB_READ_WRITE_TOKEN` (+ optioneel `BLOB_STORE_ID`, alleen informatief) — **moet wijzen naar een Vercel Blob-store met publieke toegang.** De `@payloadcms/storage-vercel-blob`-plugin ondersteunt uitsluitend `access: "public"`; een privé-store geeft een harde `"Cannot use public access on a private store"`-fout zodra iemand een stapafbeelding upload. Dit was tijdens de bouw van deze feature de eerste keer dat een normale Payload-media-upload (in plaats van de PDF-sync-bypass) daadwerkelijk gebruikt werd — controleer dit dus expliciet bij een nieuwe omgeving, ga er niet vanuit dat een bestaande store al goed staat.
- `NEXT_PUBLIC_SERVER_URL` — moet het echte domein zijn (geen trailing slash). Beïnvloedt Payload's csrf-allowlist; staat al los van deze feature, maar de publieke handleidingpagina en de preview-link zijn er wél van afhankelijk.

**Migraties**: draai `payload migrate` tegen de nieuwe/doel-database vóór of tijdens de deploy. Twee migratiebestanden horen bij deze feature:
- `payload/migrations/20260726_084003_handleidingen_en_voorbeeldvragen.ts` — maakt de `handleidingen`-tabellen en de `helpdesk_voorbeeldvragen`-globaltabellen aan.
- `payload/migrations/20260726_085845_assistant_conversations_steps.ts` — voegt de `steps`-subtabel toe aan `assistant-conversations`.

Let op: als je Payload lokaal in dev-mode hebt gedraaid tégen een database vóórdat je de migraties draaide, toont `payload migrate` de waarschuwing *"It looks like you've run Payload in dev mode... Would you like to proceed?"* — dat is Payload's eigen dev-push-detectie, geen teken van een kapotte migratie. Op een schone database (staging/productie die nooit dev-push heeft gehad) verschijnt deze vraag niet.

**Een eerste handleiding toevoegen:**
1. Admin → Handleidingen → nieuw document. Vul interne/publieke titel, categorie, korte omschrijving in. Status blijft eerst `concept`.
2. Voeg minimaal 1 stap toe: titel, uitleg, eventueel een screenshot (sleep in het `media`-subveld) en optioneel waarschuwing/tip.
3. Herordenen: sleep aan de rij (native Payload-gedrag). Dupliceren/verwijderen: eveneens native array-knoppen.
4. Klik "Bekijk preview" (rechts naast `status`) om de echte publieke pagina te zien, ook als concept — dit werkt alleen als je ingelogd bent (het is dezelfde sessie als /admin).
5. Zet `status` op `gepubliceerd` en sla op. Dit embedt automatisch (handleiding + elke stap) — geen aparte actie nodig. Vink `zichtbaarInSidebar` aan als de handleiding ook in de sidebar moet verschijnen.
6. Verifiëren: `embeddingStatus` van de handleiding hoort op `indexed` te staan na het opslaan (kan een paar seconden duren).

**Voorbeeldvragen instellen**: Admin → Globals → "Helpdesk voorbeeldvragen" → vul tot 6 rijen `tekst` in. Deze staan **niet** automatisch in een nieuwe database — moeten na elke nieuwe omgeving handmatig ingevuld worden.

## 7. Bekende beperkingen

- **Retrieval is in-memory, niet pgvector.** `similarity-search.ts` laadt alle geïndexeerde embeddings in het geheugen en rekent cosinegelijkenis in JavaScript uit. Dit is een bewuste, tijdelijke keuze die al vóór deze feature bestond (zie het commentaar bovenaan dat bestand) — werkt prima op de huidige schaal, maar is de eerste plek om te vervangen zodra er een echte vectorstore-koppeling komt. Deze feature volgt exact hetzelfde patroon, dus een toekomstige pgvector-migratie raakt ook de handleiding/stap-kandidaten.
- **`stappen[].embeddingStatus` wordt nooit expliciet gezet.** Het veld bestaat in het datamodel (readOnly/hidden, dus onzichtbaar in de admin-UI), maar `embedHandleiding()` schrijft alleen `embedding`/`embeddingTextHash` per stap, nooit een status-waarde. Functioneel onschadelijk — retrieval controleert of `stap.embedding` een geldige vector is, niet deze statuswaarde — maar wie dit veld ooit gebruikt (bijv. voor een admin-kolom "geïndexeerd: ja/nee" per stap) moet eerst deze schrijfstap toevoegen.
- **"Geen dubbele stappenlijst" is een promptinstructie, geen harde regel** (zie §4) — in tegenstelling tot bijna elke andere regel in deze feature (status, verborgen, stabiele ID's), die allemaal in code afgedwongen worden. Bij een toekomstige aanpassing van het model of de prompt is het invoegen van een nieuwe onbedoelde genummerde lijst een reëel risico dat alleen door handmatig testen wordt opgemerkt, niet door een geautomatiseerde check.
- **Geen automatische deduplicatie tussen een handleidingstap en een PDF die letterlijk dezelfde content bevat.** De bronrol-tie-break bepaalt alleen wélke van de twee de hoofdcitatie wordt bij gelijke score — een sterk-scorende PDF over exact hetzelfde onderwerp kan nog steeds apart in de "Bekijk handleiding(en)"-lijst verschijnen, ook als de content inhoudelijk overlapt met de getoonde stap.
- **Turbopack-dev-server-instabiliteit** (Next.js 16, niet specifiek aan deze feature): tijdens de bouw traden af en toe "Maximum update depth exceeded"-crashes op in de admin-UI, ook op volledig ongerelateerde, native Payload-schermen (bijv. het Media-aanmaak-modal). Reproduceerbaar onafhankelijk van deze feature's eigen code (bevestigd via een schone `npm run build`/`npm test`/`npm run typecheck`) — waarschijnlijk dev-mode/Turbopack-gerelateerd. Geen bekende fix; workaround tijdens ontwikkeling was testdata via de Payload local API aanmaken in plaats van via de browser-admin-UI.
