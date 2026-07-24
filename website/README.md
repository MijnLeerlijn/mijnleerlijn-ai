# MijnLeerlijn AI Kennisplatform

Next.js-app (App Router) + Payload CMS 3 (Postgres-adapter) op één database. Zie de architectuurdocumentatie in [`docs/`](../docs/) voor de volledige context; dit bestand is het praktische opstart- en deployrunboek.

## Lokale ontwikkeling

**Vereist**: Node.js **22 LTS** (niet nieuwer — zie `docs/TODO.md` Fase 4B voor waarom dit ooit ten onrechte aan Node zelf werd toegeschreven; de echte fix zit in `"type": "module"` in `package.json`) en een echte lokale PostgreSQL 16+.

```bash
cp .env.example .env   # vul minstens DATABASE_URI en PAYLOAD_SECRET in
npm install
npm run migrate
npm run seed            # fictieve Fase 3-demo-content, handig voor lokale UI-checks
npm run import:handleidingen   # de 22 echte handleidingen (payload/import-handleidingen/data/)
npm run dev
```

Beheeromgeving: `http://localhost:3000/admin`. Standaard seed-beheerder: `beheerder@mijnleerlijn.nl` — wachtwoord via `SEED_ADMIN_PASSWORD` (env) of de fallback in `payload/seed/index.ts`, **wijzig dit vóór elk gedeeld gebruik**.

## Omgevingsvariabelen

Zie `.env.example` voor de volledige, becommentarieerde lijst. Samengevat:

| Variabele                                                      | Verplicht                                   | Gedrag zonder                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URI`                                                 | Altijd                                      | App start niet                                                                                                                                                                                                                                                                                                                                                   |
| `PAYLOAD_SECRET`                                               | Altijd                                      | App start niet                                                                                                                                                                                                                                                                                                                                                   |
| `NEXT_PUBLIC_SERVER_URL`                                       | Aanbevolen                                  | Valt terug op `http://localhost:3000`                                                                                                                                                                                                                                                                                                                            |
| `BLOB_READ_WRITE_TOKEN`                                        | Aanbevolen                                  | Overbodig voor privé bijlage-opslag als de Blob store via OIDC aan het Vercel-project gekoppeld is (`services/storage.ts`); wél nodig voor de publieke media-plugin totdat `@payloadcms/storage-vercel-blob` OIDC ondersteunt (zie `payload.config.ts`). Zonder token: lokale schijfopslag (niet persistent op Vercel), een duidelijke waarschuwing, geen crash. |
| `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`                         | **Verplicht in productie**                  | Dev: console-e-mailadapter (verstuurt niets echt)                                                                                                                                                                                                                                                                                                                |
| `CONTACT_NOTIFICATION_EMAIL`                                   | Aanbevolen                                  | Geen interne notificatiemail bij een contactinzending                                                                                                                                                                                                                                                                                                            |
| `CRON_SECRET`                                                  | Optioneel                                   | Alleen relevant zodra geplande taken via Vercel Cron draaien                                                                                                                                                                                                                                                                                                     |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` | Nodig voor de Gmail-koppeling               | Zonder deze faalt alleen `/api/gmail/oauth/*` (geen crash elders) — zie hieronder                                                                                                                                                                                                                                                                                |
| `GMAIL_TOKEN_ENCRYPTION_KEY`                                   | Nodig voor de Gmail-koppeling               | Idem — versleutelt de opgeslagen Gmail-tokens (`lib/gmail/encryption.ts`)                                                                                                                                                                                                                                                                                        |
| `OPENAI_API_KEY`                                               | Nodig voor de AI-analyse van supportthreads | Zonder deze faalt alleen `POST /api/support/analyze` (thread krijgt `aiAnalysisStatus: "failed"`, geen crash elders) — zie `services/ai-client.ts` en `lib/support/analyze.ts`                                                                                                                                                                                   |
| `AI_MODEL_ID`                                                  | Optioneel                                   | Overschrijft het standaardmodel (`gpt-4o`) van de centrale AI-client (`services/ai-client.ts`)                                                                                                                                                                                                                                                                   |

`services/ai-client.ts` is de centrale AI-client (Vercel AI SDK, OpenAI-provider — tot 2026-07-23 Anthropic, overgezet vanwege een tijdelijk betaalprobleem met Anthropic-credits, zie het commentaar in dat bestand) — gebruikt door de supportthread-analyse hieronder. `services/ai.ts` (zoekantwoord-synthese) is hier bewust nog niet doorheen omgebouwd en blijft voorlopig extractief (de best gevonden tekst, geen taalmodel-generatie) — zie de motivatie in dat bestand.

## Gmail-helpdeskkoppeling

OAuth 2.0-koppeling met één Gmail-helpdeskaccount, alleen-lezen (`gmail.readonly`) — nog geen e-mailimport, uitsluitend de veilige koppeling zelf. Zie `app/api/gmail/oauth/start`, `.../callback`, `lib/gmail/`, `payload/globals/GmailConnection.ts`.

1. Log in als beheerder op `/admin` (in dezelfde browser/tab).
2. Ga naar `/api/gmail/oauth/start` — dit start het Google-consentscherm. Alleen beheerders komen voorbij deze stap (403 voor iedereen anders).
3. Na toestemming op Google's scherm kom je terug op `/api/gmail/oauth/callback`, die de authorization code server-side inwisselt, de tokens versleuteld opslaat, en uitsluitend een succesmelding + het gekoppelde e-mailadres toont.
4. Status/herkoppelen inzien: `/admin/globals/gmail-connection` (alleen beheerders — de tokens zelf zijn daar nooit meer dan de versleutelde ciphertext).

## AI-analyse van supportthreads (conceptkennisartikelen)

Analyseert geïmporteerde Gmail-threads met AI tot conceptkennisartikelen (`knowledge-drafts`) — nooit automatisch gepubliceerd, altijd handmatig te bekijken/aanpassen/goedkeuren. Zie `lib/support/analyze.ts` voor de volledige privacy-/dedupliceringslogica en `payload/collections/KnowledgeDrafts.ts` voor het datamodel.

- **Eerst maar 5 threads testen**: `/admin/globals/gmail-connection` → knop **"Analyseer nieuwe threads"** kiest zelf tot 5 nog niet (succesvol) geanalyseerde threads.
- **Gerichte selectie**: `/admin/collections/support-threads` → selecteer ten hoogste 5 rijen (checkboxes) → knop **"Analyseer geselecteerde threads"** bovenin de lijst.
- Resultaten (concepten bekijken/goedkeuren/afkeuren): `/admin/collections/knowledge-drafts`.
- Vereist `OPENAI_API_KEY` (zie hierboven); zonder deze variabele faalt de analyse per thread met een technische foutmelding, zonder de thread ten onrechte op "Geanalyseerd" te zetten.

## Knowledge Sources (PDF's, video's, websites, release notes, handleidingen, FAQ's)

Centrale invoer voor de AI-kennispijplijn naast Gmail-supportthreads — zie `lib/knowledge/` (index-source.ts voor de kerninhoudslogica, process-source.ts voor de Payload-orkestratie, link-drafts.ts voor de automatische koppeling aan `knowledge-drafts`) en `payload/collections/KnowledgeSources.ts` voor het datamodel. Geen chatbot — uitsluitend uitlezen, samenvatten, trefwoorden/categorie bepalen en (voor PDF's) hoofdstukken herkennen + per hoofdstuk samenvatten. Vectoropslag/embeddings: zie de volgende sectie.

- **Een PDF toevoegen**: `/admin/collections/knowledge-sources` → **Create new** → Type "PDF" → upload het bestand bij "Bestand" → opslaan.
- **Een URL toevoegen** (video/website/release notes/handleiding/FAQ/intern document): zelfde scherm, Type naar keuze, vul "URL" in.
- **Prioriteit** (`priority`, verplicht select-veld, direct onder "Type"): **Kerninhoud** (`core`, default — belangrijkste handleidingen met praktische instructies), **Aanvullende inhoud** (`secondary` — uitsluitend als aanvulling), **Achtergrondinformatie** (`reference` — laagste zoekprioriteit). Bestaande bronnen kregen bij het toevoegen van dit veld automatisch `core` (databasedefault, geen aparte migratiestap). Nog niet gebruikt door de zoeklogica zelf (`lib/embeddings/similarity-search.ts`) — uitsluitend de classificatie, bedoeld voor een latere zoeklogica-wijziging.
- **Indexeren**: selecteer een of meer bronnen in de lijst → knop **"Indexeer geselecteerde bronnen"** bovenin. Dezelfde knop **herindexeert** een reeds geïndexeerde bron gewoon opnieuw (bv. na een fout, of om een bijgewerkt bestand opnieuw te laten uitlezen).
- Resultaten (samenvatting, trefwoorden, categorie, hoofdstukken, gekoppelde conceptkennisartikelen): open de bron zelf in `/admin/collections/knowledge-sources`. Het "Onderbouwd door"-overzicht op elk knowledge-draft (`/admin/collections/knowledge-drafts`) toont hoeveel supportthreads/handleidingen/video's/etc. dat concept onderbouwen.
- Vereist ook `OPENAI_API_KEY` (dezelfde centrale AI-client als hierboven) — zonder deze faalt het indexeren per bron met status "Fout" en een technische foutmelding, zonder de bron ten onrechte op "Geïndexeerd" te zetten.

## Semantisch zoeken & embeddings (Sprint 4)

Embeddings voor `knowledge-sources` (+ hun hoofdstukken), `knowledge-drafts` en gepubliceerde `articles` — zie `lib/embeddings/` (embed-record.ts voor de kernbeslissing + AI-aanroep, process-embedding.ts voor de Payload-orkestratie per collectie, similarity-search.ts voor het zoeken zelf) en `services/ai-client.ts` (`generateEmbedding`, OpenAI's `text-embedding-3-small` via de Vercel AI SDK). Geen chatbot, geen gegenereerd antwoord — uitsluitend een gerangschikte lijst treffers met similarity-score.

**Tijdelijke vectoropslag**: er is nog geen externe vectorstore/pgvector-koppeling — de vector zelf staat tijdelijk als JSON-array in het (verborgen) veld `embedding` op elk document, en similarity wordt in JS berekend (`cosineSimilarity` uit de Vercel AI SDK). Dit is bewust de enige plek die vervangen hoeft te worden zodra er een echte vectorstore komt; `embeddingStatus`/`embeddedAt`/`embeddingModel`/`embeddingTextHash` blijven dan ongewijzigd bruikbaar.

- **Embeddings maken**: selecteer een of meer rijen in `/admin/collections/knowledge-sources`, `/admin/collections/knowledge-drafts` of `/admin/collections/articles` → knop **"Maak embeddings"** bovenin de lijst. Dezelfde knop **herembedt**: alleen documenten waarvan de tekst écht is gewijzigd (sha256-hashvergelijking) worden opnieuw naar OpenAI gestuurd, de rest wordt overgeslagen (geen onnodige API-kosten).
- **Semantisch zoeken testen**: `/admin/globals/knowledge-search` → typ een zoekvraag → **"Zoek semantisch"**. Toont per treffer: type, titel (+ hoofdstuk indien van toepassing), similarity-score en een korte reden.
- Alleen gepubliceerde artikelen worden geëmbed; pedagogische content (`knowledgeType: pedagogisch`) pas na `aiApprovalStatus: goedgekeurd` — zelfde goedkeuringspoort als docs/CONTENT-MODEL.md §Twee soorten kennis.
- Vereist `OPENAI_API_KEY` (zelfde centrale AI-client). Optioneel: `EMBEDDING_MODEL_ID` om het standaardmodel (`text-embedding-3-small`) te overschrijven.

## MijnLeerlijn AI Assistant (Sprint 5, `/assistant`)

Een echte RAG-chatassistent bovenop het semantisch zoeken hierboven — zie `lib/assistant/` (build-context.ts voor het opbouwen van de AI-context uit zoektreffers, answer.ts voor de antwoordlogica + harde "nooit antwoorden zonder bron"-regel, process-question.ts voor de Payload-orkestratie + logging, rewrite-query.ts voor de query-rewriter hieronder) en `payload/collections/AssistantConversations.ts` voor het datamodel. Werking: vraag → **query-rewriter** → **gefaseerde semantische zoekopdracht op Knowledge Source-prioriteit** (top 10, `lib/embeddings/similarity-search.ts`) → context → antwoord (`generateStructuredOutputWithUsage`, `services/ai-client.ts`) → bronvermelding.

**Query-rewriter** (`lib/assistant/rewrite-query.ts`): herschrijft de vraag naar MijnLeerlijn-terminologie vóórdat er gezocht wordt — bv. "leerdoelen" → "doelen", "kind" → "leerling", "klas" → "groep" — omdat semantic search anders soms faalt op synoniemen die niet letterlijk in de handleidingen voorkomen. Gebruikt dezelfde centrale AI-client/hetzelfde model als de rest van het project (`generateStructuredOutput`, `services/ai-client.ts` — geen los model of nieuwe dependency). Zoekt voorlopig uitsluitend met de herschreven vraag (geen hybride/dubbele zoekopdracht). De **originele** vraag van de gebruiker blijft ongewijzigd naar antwoordgeneratie (`answer.ts`) en de gespreklogging (`assistant-conversations`) gaan — alleen de zoekvraag zelf wordt vervangen. Bij een fout (bv. ontbrekende `OPENAI_API_KEY`) of een lege modeluitkomst valt de rewriter terug op de originele vraag, zonder de rest van de assistent te laten falen. Buiten productie (`NODE_ENV !== "production"`) logt hij zowel de originele als de herschreven vraag naar de console (`[assistant:rewrite-query] ...`).

**Gefaseerd zoeken op Knowledge Source-prioriteit** (`lib/embeddings/similarity-search.ts`'s `searchKnowledgePhased`, alleen gebruikt door de assistent — de Sprint 4 "Test semantisch zoeken"-tool in `/admin/globals/knowledge-search` blijft het gewone, platte `searchKnowledge` gebruiken en weegt alle bronnen nog steeds gelijk): zoekt eerst uitsluitend in Knowledge Sources met `priority: "core"`. Levert die tier minder dan `limiet` resultaten op met `similarity >= MIN_SIMILARITY_VOOR_ANTWOORD` (dezelfde bestaande drempel als `lib/assistant/answer.ts` — geen nieuwe/willekeurige grens), dan breidt de zoekopdracht uit naar `secondary`, en pas als core+secondary nog steeds onvoldoende opleveren, ook naar `reference`. Bij een gelijk afgerond similarity-percentage ("vergelijkbare relevantie", zelfde afronding als de bestaande confidence-berekening) wint core altijd van secondary, secondary van reference — knowledge-drafts en articles hebben geen prioriteitstier en doen in élke fase gewoon mee, die kunnen dus nooit door deze fasering uit de resultaten verdwijnen. In development (`NODE_ENV !== "production"`) logt `process-question.ts` per vraag: de originele vraag, de uiteindelijk uitgevoerde fase, het aantal (voldoende-scorende) kandidaten per prioriteit, de scores van de geselecteerde resultaten en welke bronnen naar het antwoordmodel gaan (`[assistant:retrieval] ...`).

**Belangrijke, bewuste afwijking van eerdere documentatie** (met opzet, zie het commentaar bovenin `app/(frontend)/assistant/page.tsx`): eerdere architectuurdocumenten (`docs/SECURITY-AND-PRIVACY.md`, `docs/PLATFORM-FOUNDATION.md`) beschreven de AI-assistent als publiek/anoniem, zonder inlog. Deze sprint vraagt expliciet om een inlogmuur; omdat er geen apart publiek gebruikersaccount bestaat (alleen de CMS-`users`-collectie), betekent "ingelogd" hier noodzakelijkerwijs "ingelogd als MijnLeerlijn-beheerder of -redacteur" — dit is dus een intern test-/dogfooding-scherm, geen publieke lancering, consistent met hoe elke AI-functionaliteit in Sprint 2 t/m 4 al achter dezelfde login zat.

- **Een eerste vraag stellen**: log in op `/admin` (zelfde sessie werkt overal), ga naar `/assistant`, typ een vraag en klik **"Verstuur"**.
- **"AI mag nooit antwoorden geven zonder bron"** is een harde regel in code (`lib/assistant/answer.ts`), niet alleen een promptinstructie: zonder relevante bronnen (of bij een te lage overeenkomstscore) wordt het taalmodel niet eens aangeroepen — het antwoord is dan altijd letterlijk "Dat weet ik niet. Er is onvoldoende informatie in de kennisbank."
- **Confidence** is altijd de retrieval-score van de best passende bron, nooit een zelfinschatting van het model — zelfde filosofie als de betrouwbaarheidsdrempel in `docs/AI-KNOWLEDGE-STRATEGY.md`.
- **Elk gesprek wordt gelogd**: vraag, antwoord, bronnen, model, tokens, antwoordtijd, confidence en feedback — zie `/admin/collections/assistant-conversations` (alleen zichtbaar voor de eigen gesprekken, tenzij beheerder).
- **Feedback**: 👍/👎 onder elk antwoord; bij 👎 volgt een optionele "Wat miste er?"-vraag, ook opgeslagen op het gesprek.
- Vereist `OPENAI_API_KEY` (zelfde centrale AI-client als hierboven) — zonder deze faalt het stellen van een vraag met een nette foutmelding (geen gespreklogboek aangemaakt), nooit een crash. Geen nieuwe environment variables t.o.v. de vorige sprints.

## Handleidingen synchroniseren (Sprint 6, opslag: Vercel Blob)

Vult `knowledge-sources` automatisch met de handleiding-PDF's. **Opslag is Vercel Blob, niet het lokale bestandssysteem**: `website/handleidingen/` bleek via `.vercelignore` alsnog buiten de Vercel-build te vallen, en met de map inmiddels op 1,6+ GB (video's/presentaties erbij) is "meebundelen in de serverless functie" sowieso geen houdbare aanpak — zie `lib/knowledge/manuals-blob.ts` voor de volledige motivatie. Hergebruikt de bestaande indexeer- en embedlogica hierboven (`process-source.ts`, `process-embedding.ts`) volledig — geen tweede parallel systeem.

- **Eenmalig (en veilig herhaalbaar) uploaden naar Blob**: `npm run upload:handleidingen` — leest lokaal alles uit `website/handleidingen/` (alle bestandstypen, niet uitsluitend PDF's), berekent per bestand een sha256 (streaming, ook voor bestanden >1 GB) en uploadt alleen nieuwe/gewijzigde bestanden naar Blob (`access: private`, prefix `handleidingen/`). Vereist `BLOB_READ_WRITE_TOKEN` in `.env` — dit script gebruikt **uitsluitend** dat token, nooit Vercel OIDC (zie de code-comments in `payload/upload-manuals-to-blob/index.ts` voor waarom: @vercel/blob probeert zonder een expliciete `token`-optie eerst OIDC via het lokale Vercel CLI-projectkoppelbestand, wat op een niet-OIDC-ingeschakelde omgeving faalt). Kan zonder risico herhaald worden gedraaid (bv. na het toevoegen van nieuwe handleidingen) — ongewijzigde bestanden worden nooit opnieuw geüpload.
- **Private store**: de Blob store is bewust `private` — bestanden zijn dus niet via een kale publieke URL op te vragen. Payload's `media`-collectie zelf (site-afbeeldingen/logo's, via de gedeelde `vercelBlobStorage`-plugin) ondersteunt op dit moment uitsluitend `public` toegang, dus handleiding-media loopt daar bewust NIET doorheen: `lib/knowledge/sync-manuals.ts`'s `maakMediaDoc()` maakt het media-document zonder `file:`, wijzend naar de al bestaande private Blob (geen re-upload, geen dubbele opslag). `lib/knowledge/process-source.ts`'s `resolveerBestandsUrl()` herkent zo'n private-Blob-URL en genereert er, pas op het moment van (her)indexeren, een kortlevende signed URL voor (zelfde aanpak als contactformulierbijlagen in `services/storage.ts`) — zo blijft ook herhaald herindexeren later werken.
- **Naamgevingsschema in Blob**: `handleidingen/<pad>/<sha256>__<bestandsnaam>` — de hash staat letterlijk in de bestandsnaam, zodat de synchronisatie hieronder met één lijst-aanroep kan bepalen wat nieuw/gewijzigd/ongewijzigd is, **zonder een enkele byte te downloaden** (cruciaal nu bestanden honderden MB's tot >1 GB kunnen zijn). Alleen bij een daadwerkelijk nieuw/gewijzigd bestand wordt de inhoud opgehaald.
- **Synchroniseren naar Knowledge Sources**: `/admin/collections/knowledge-sources` → knop **"Synchroniseer handleidingen"** (direct zichtbaar boven de tabel). Verwerkt per klik maximaal 5 nieuwe/gewijzigde PDF's (de Blob-listing zelf, goedkoop, gebeurt altijd volledig). Voor veel bestanden tegelijk: klik de knop enkele keren achter elkaar, of roep de route rechtstreeks aan met een hogere `limit` (max. 20): `curl -X POST /api/knowledge/sync-manuals -d '{"limit":20}'` (met een geldige beheerderssessie-cookie).
- **Idempotent & dedup**: elk bestand wordt geïdentificeerd via `sourceFilePath` (logisch pad, bv. `handleidingen/Analyse.pdf`) én `sourceFileHash` (sha256, rechtstreeks uit de Blob-bestandsnaam). Ongewijzigde bestanden worden overgeslagen (geen download, geen AI-aanroepen); gewijzigde bestanden (andere hash, zelfde pad) worden bijgewerkt en herindexeerd/herembed; inhoudelijk identieke bestanden onder een andere naam (bv. `Analyse.pdf` / `Analyse (1).pdf`) worden herkend als duplicaat en overgeslagen — nooit een tweede bron, nooit automatisch iets verwijderd.
- **Logging** (`payload.logger`, alleen aantallen — nooit bestandsinhoud): aantal bestanden gevonden in Blob, nieuw, bijgewerkt, ongewijzigd overgeslagen, duplicaat overgeslagen, geïndexeerd, geëmbed, mislukt (met technische foutmelding per bestand). Na afloop toont de knop dezelfde aantallen.
- **Embeddings verifiëren**: open een gesynchroniseerde bron in `/admin/collections/knowledge-sources` — `embeddingStatus` moet `indexed` zijn en `embeddedAt` gezet, of test semantisch via `/admin/globals/knowledge-search` (zelfde tester als Sprint 4).
- **Alleen beheerders** (`isAdmin`, niet `isEditor`) mogen synchroniseren — zelfde sessieverificatie als `/api/knowledge/index` en `/api/knowledge/embed`. Vereist `BLOB_READ_WRITE_TOKEN` (of Vercel OIDC — zie `services/storage.ts`); hergebruikt verder `OPENAI_API_KEY` (verplicht voor indexeren/embedden) en optioneel `EMBEDDING_MODEL_ID`.
- **Knowledge Drafts in de Assistant/zoekresultaten**: alleen `status: "approved"` telt mee voor embedden en semantisch zoeken (zie `VEILIGE_DRAFT_STATUSSEN` in `lib/embeddings/process-embedding.ts` en `lib/embeddings/similarity-search.ts`) — bewuste, veilige standaard: `"new"` is nog niet door een redacteur beoordeeld (mogelijk onjuist/onvolledig, rechtstreeks uit een Gmail-thread), `"published"` is al apart als artikel geëmbed (anders dubbele/mogelijk verouderde resultaten), `"rejected"`/`"review"` zijn expliciet niet bruikbaar. Ruwe Gmail-threads (`support-threads`) worden nooit geëmbed of doorzocht — uitsluitend de opgeschoonde `knowledge-drafts`.
- **Lokale `website/handleidingen/`**: staat sinds deze migratie in `.gitignore` (niet meer getrackt in git) — de map blijft alleen lokaal bestaan als brondata voor `npm run upload:handleidingen`. Vercel Blob is de enige bron van waarheid voor productie.

## Productie-/preview-deploy (Vercel)

1. **Accounts/resources vooraf nodig**: Vercel-project, een Postgres-database die ook `pgvector` kan (bv. Neon/Supabase — nog geen pgvector-tabellen in gebruik, maar dezelfde database is de bedoeling, zie `docs/ARCHITECTURE.md`), Vercel Blob store, Resend-account + geverifieerd verzendadres, een domein/subdomein.
2. **Vercel-omgevingsvariabelen instellen** (Project Settings → Environment Variables): alle variabelen uit `.env.example`, met echte waarden. `NEXT_PUBLIC_SERVER_URL` = de echte preview-/productie-URL.
3. **Migraties tegen de productie-/preview-database**:
   ```bash
   DATABASE_URI=<echte-connection-string> PAYLOAD_SECRET=<zelfde-secret-als-productie> npm run migrate
   ```
4. **Productie-seed — GEEN fictieve demo-content**:
   ```bash
   DATABASE_URI=<...> PAYLOAD_SECRET=<...> SEED_INCLUDE_DEMO_ARTICLES=false npm run seed
   DATABASE_URI=<...> PAYLOAD_SECRET=<...> npm run import:handleidingen
   ```
   `SEED_INCLUDE_DEMO_ARTICLES=false` slaat de 75 fictieve Fase 3-artikelen/bronnen/updates over — varianten en categorieën (wél echt, zie code-commentaar in `lib/data/categories.ts`) worden nog steeds gezaaid. Zonder deze vlag staan fictieve demo-artikelen naast de echte handleidingen in productie, wat het "AI verzint niets"-principe van dit project ondermijnt.
5. **Deploy** (`vercel --prod` of via Git-integratie).
6. **Smoke-check na deploy**: `/admin` (inloggen), `/` (zoeken op een bestaande handleiding, bv. "hoofdprofiel aanmaken"), een artikelpagina, `/contact` (test-inzending), Ja/Nee-feedback onder een antwoord.

## Scripts

| Commando                                         | Doel                                                         |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `npm run dev` / `build` / `start`                | Next.js                                                      |
| `npm run typecheck` / `lint` / `format` / `test` | Kwaliteitscontrole                                           |
| `npm run generate:types` / `generate:importmap`  | Payload-codegen na collection-wijzigingen                    |
| `npm run migrate` / `migrate:create`             | Payload/Drizzle-migraties                                    |
| `npm run seed`                                   | Fictieve Fase 3-demo-content (lokale ontwikkeling)           |
| `npm run import:handleidingen`                   | Echte handleidingen uit `payload/import-handleidingen/data/` |
