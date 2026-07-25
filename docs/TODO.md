# TODO.md — Status en volgende stappen

> Actueel overzicht. Werk dit bij zodra beslissingen genomen worden of fases starten/afronden — dit is het eerste document om te checken voor "waar staan we nu". Voor de volledige onderbouwing per fase (afhankelijkheden, Definition of Done, leidende documenten): zie [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

## Fase 0: Ontwerp — ✅ afgerond

- [x] Repository geïnspecteerd (brandbook, logo's, handleidingen)
- [x] Architectuurvoorstel goedgekeurd (zie `.claude/plans/refactored-coalescing-lemur.md` voor de volledige besluitvormingsgeschiedenis)
- [x] Architectuur-, UX- en UI-documentatie aangemaakt in `docs/` + `CLAUDE.md` in de hoofdmap
- [x] Homepage-ervaring volledig uitgewerkt ([HOMEPAGE-SPEC.md](HOMEPAGE-SPEC.md), [HOMEPAGE-VISUAL-SPEC.md](HOMEPAGE-VISUAL-SPEC.md))
- [x] Werkend, klikbaar prototype van de homepage (7 states/schermen, dummydata) in `website/`

## Fase 1: Platform Foundation

- [ ] Volledige mappenstructuur + afhankelijkheidsregels vastleggen (zie [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md))
- [ ] Prototype overzetten van JavaScript naar TypeScript
- [ ] Routing, layouts, state-managementkeuzes, providers, tokenbeheer, variant-architectuur en integratiepunten uitgewerkt en als skelet aanwezig
- [ ] Zie [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md) §10 voor de volledige Definition of Done

## Fase 2: Component library

- [ ] Componentinventarisatie (zie [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) §Fase 2) bouwen: 16 atoms, 15 molecules, 17 organisms
- [ ] Alle staten (default/hover/focus-visible/active/disabled/loading/selected/error/success/empty) + toegankelijkheid per component
- [ ] Responsive gedrag op alle breekpunten
- [ ] `/dev/components`-previewroute (alleen development)
- [ ] Vitest + Testing Library opgezet, tests voor kritieke componenten/hulpfuncties
- [ ] Homepage en artikelpagina omgezet naar de nieuwe componenten zonder visuele achteruitgang

## Fase 3: Pagina's met dummydata

- [ ] Overige 13 schermen uit [UX-DESIGN.md](UX-DESIGN.md) bouwen (homepage en artikel bestaan al vanuit het prototype)
- [ ] Alle staten per scherm (leeg/laden/fout) aanwezig, nog zonder backend
- [ ] `DemoSwitcher` uit het prototype verwijderen of achter een productie-guard zetten

## Fase 4: Payload CMS — ✅ afgerond (zie opleveringsrapport in de sessiegeschiedenis)

- [x] Testopstelling: Payload 3.86.0 + `@payloadcms/db-postgres` geïnstalleerd, draait via Next.js 16.2.10's eigen build-pipeline (`next build`/`next dev` bevestigd)
- [x] Toets 1: centrale-content-plus-variant-override-model — `articles` (Sections/Blocks genest) + eigen `variant-overrides`-collectie met polymorfe `targetType`/`targetId`, uniciteit afgedwongen via hook
- [x] Toets 2: rechten per centrale content vs. per variant-override — functie-gebaseerde access control (`payload/access/roles.ts`), variant-redacteur heeft schema-niveau geen schrijfpad naar de centrale boom
- [x] Toets 3: preview per variant — structureel ondersteund (Payload drafts + `variant-overrides`); daadwerkelijke previewroute volgt in Fase 5 samen met de samenvoegfunctie
- [x] Toets 4: versiegeschiedenis + geplande publicatie — Payload `versions.drafts` (`autosave`, `schedulePublish`) op `articles`
- [x] Toets 5: samen draaien met dezelfde Postgres + `pgvector` — architecturaal bevestigd (Payload beheert alleen zijn eigen tabellen); pgvector-tabellen volgen in Fase 6, buiten Payload's migratiesysteem om
- [x] Toets 6: uitwijkbaarheid — eigen Postgres-tabellen (Drizzle), geen proprietary opslagformaat; geen lock-in geconstateerd
- [x] Besluit vastgelegd: **Payload bevestigd (GO, met voorwaarden)** — geen overstap naar het zelfgebouwde alternatief nodig
- [x] Collections + rechten per rol (`admin`/`editor`, met `variantScope` voor het centraal/variant-onderscheid) + versies/concepten/audit (Payload-ingebouwd)
- [x] Authenticatie beheeromgeving — Payload's ingebouwde auth (`users`-collectie), geen aparte Auth.js/Clerk-laag (zie beslissing 3 hieronder)
- [x] Contactformulier echt werkend — validatie, honeypot, in-memory rate limiting, opslag via Payload, privé bijlage-opslag (Vercel Blob private + signed URL's), e-mailnotificatie via Resend (met development-adapter)

### Fase 4B: Live Integration Verification — ✅ afgerond (2026-07-21)

Fase 4 was na de eerste doorloop functioneel uitgewerkt maar nog niet tegen een echte PostgreSQL-database geverifieerd. Fase 4B heeft dat alsnog gedaan: Payload CLI, migraties, seed, rollen/workflows, publicatiegrenzen, variantgedrag en het contactformulier zijn end-to-end getest tegen een echte lokale Postgres 16-instantie. Geen nieuwe scope — alleen configureren, uitvoeren, testen, herstellen.

- [x] **Correctie eerdere diagnose**: het vermeende "Node.js 26-tooling-conflict" uit de Fase 4-opleveringsrapportage was een verkeerde diagnose. De werkelijke oorzaak van Payload CLI's `ERR_REQUIRE_ASYNC_MODULE` was een ontbrekende `"type": "module"` in `website/package.json` (payloadcms/payload#15701) — dit faalde identiek op zowel Node 22 als Node 26. **Node 22 LTS blijft wel de aanbevolen/geteste versie** voor Payload CLI-operaties; het faalde niet meer op Node 26 na de fix maar is daar niet uitputtend getest.
- [x] Payload CLI volledig werkend gemaakt en uitgevoerd tegen een echte Postgres 16 (Homebrew): `generate:importmap`, `generate:types`, `migrate:create`, `migrate` — allemaal foutloos.
- [x] Databaseschema geïnspecteerd via directe SQL: alle 9 collections aanwezig, relaties/foreign keys correct, drafts/versions-tabellen aangemaakt, uniciteit variant-override werkt, slugs afgedwongen.
- [x] **Bug gevonden en gefixt**: Postgres-enum-naamcollisie — het eigen `status`-veld op `Articles` en Payloads interne `_status`-veld (drafts) genereerden allebei een enum `enum_articles_status`. Veld hernoemd naar `articleStatus` (collection, access control, types, service-mapping, seed, tests).
- [x] **Datamodel-correctie**: Payload's Postgres-adapter gebruikt numerieke (serial) primary keys voor top-level collection-documenten, en string-UUID's alleen voor geneste sectie-/blok-subdocumenten — `payload/types.ts` en `services/payload.ts` waren hier eerder ten onrechte overal string van uitgegaan; gecorrigeerd en expliciet gedocumenteerd.
- [x] **Bug gevonden en gefixt (toegangsbeveiliging)**: een variant-redacteur kon via de local API een `variant-overrides`-document aanmaken voor een andere variant dan de eigen `variantScope` (Payload valideert een `Where`-return niet tegen `create`-payloads). Fix in `ownVariantOverrideAccess` (`payload/access/roles.ts`).
- [x] **Bug gevonden en gefixt (toegangsbeveiliging)**: publieke/anonieme leestoegang tot `variant-overrides` was volledig geblokkeerd (`anyEditor`), wat de Fase 5-samenvoegfunctie zou breken. Nieuwe `publishedOverrideOrEditor`-accessfunctie toegevoegd en toegepast.
- [x] `npm run seed` twee keer uitgevoerd tegen de echte database: eerste run maakt content aan, tweede run geen duplicaten. Werkelijke aantallen bevestigd: 75 artikelen, 10 categorieën, 15 bronnen, 5 updates, 3 varianten.
- [x] Rollen/workflows handmatig geverifieerd (admin/centraal-redacteur/variant-redacteur, concept→review→publicatie, versiegeschiedenis+terugzetten, geplande publicatie, variant-override, media/bron/update, contactmelding) — variant-redacteur kan centrale content aantoonbaar niet wijzigen, ook niet via directe API-call.
- [x] Publieke publicatiegrenzen geverifieerd tegen de echte draaiende dev-server: concept/in_review/gepland niet publiek zichtbaar vóór publicatiemoment, gepubliceerd wel, gearchiveerd niet, onbekende slug → 404.
- [x] Variantgedrag geverifieerd: gedeeld artikel zichtbaar voor alle varianten, variant-gebonden artikel alleen voor de juiste variant, override opslaan werkt, dubbele override voor dezelfde combinatie wordt geweigerd. Definitieve samenvoeglogica blijft Fase 5-scope.
- [x] Contactformulier end-to-end tegen echte database + opslag getest: geldige/ongeldige inzending, honeypot, rate limit, opslag, Resend-notificatie. **Bekende resterende beperking**: Vercel Blob (bijlage-upload/signed URL) en Resend-succespad zijn niet met echte productie-credentials getest (niet beschikbaar in deze testomgeving) — dit is de enige nog niet volledig geverifieerde integratie, geen ontwerpblocker.
- [x] Volledige kwaliteitscontrole herbevestigd op Node 22 tegen de echte, geseede database: typecheck, lint, format, unit tests (60/60), production build, dev server, admin, publieke routes, contactformulier — allemaal groen.
- [x] **Eindoordeel: Fase 4 definitief gereed**, met de expliciete kanttekening dat Vercel Blob-bijlageopslag en Resend-e-mailbezorging alleen met placeholder-/foutpad-credentials zijn getest, niet met echte productiesleutels.

## Fase 5: Contentstructuur

- [ ] Gedeelde samenvoegfunctie bouwen + verplichte pariteitstest (zie [ARCHITECTURE.md](ARCHITECTURE.md))
- [ ] Migratie van bestaande handleiding-PDF's (`handleidingen/`) naar het modulaire contentmodel
- [ ] MijnMonti-voorbeeldvariant: placeholder-branding, minimaal één `aanvullen`-, `vervangen`- en `ander_medium`-override, terminologie-woordenboek (zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md))
- [ ] Fase 3-pagina's omschakelen van dummydata naar echte content

## Fase 6: AI-laag

- [ ] RAG-pijplijn (indexeren op blokniveau, `pgvector`, harde variant-scoping)
- [ ] Providerabstractie + praktijktest Anthropic/OpenAI op echte NL-content
- [ ] Bronvermelding, betrouwbaarheidsdrempel, "geen antwoord"-fallback
- [ ] De zes homepage-antwoordstates koppelen aan echte content (nu nog dummy in het prototype)
- [ ] Variant-lekkage-test en uitgebreide samenvoegfunctie-pariteitstest (incl. AI-index)

## Chatbot-kwaliteit: evaluatieomgeving (2026-07-25)

Aparte opdracht, los van de fasering hierboven: "we gaan nu uitsluitend werken aan de kwaliteit van de AI Helpdesk-chatbot" — geen nieuwe websitefuncties, varianten of pgvector. Doel: objectief kunnen testen of de assistent (Sprint 5, `/assistant`) echte MijnLeerlijn-helpdeskvragen correct, volledig en uitsluitend op basis van bronnen beantwoordt.

**Huidige werkelijke status van de chatbot:**
- De RAG-assistent zelf bestond al (Sprint 5) en werkt: query-rewriter → gefaseerde retrieval op Knowledge Source-prioriteit → antwoord met verplichte bronvermelding, harde "nooit antwoorden zonder bron"-regel.
- Nieuw: elke bron heeft nu ook een **bronrol** (`purpose`: background-model/manual/release-note/faq/support — afgeleid van `type` of expliciet gezet, zie `lib/embeddings/similarity-search.ts`), zichtbaar in de prompt-context. De systeeminstructie (`lib/assistant/answer.ts`) is herschreven: eerst onderwerp herkennen, dan (indien van toepassing) meerdere routes met hun "waarom" benoemen, dán pas de concrete stappen; expliciete conflictregels tussen bronrollen; nooit schoolbeleid/teamafspraken verzinnen.
- Het interne achtergronddocument "Kennisbasis MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI" is toegevoegd als Knowledge Source (`purpose: background-model`, `priority: core`) — bedoeld voor de onderliggende reden/samenhang, nooit voor klik-voor-klik-stappen als daar een handleiding voor is.
- **De kwaliteit zelf is nog NIET objectief gemeten** — dat is precies waar de evaluatieomgeving hieronder voor gebouwd is, en de reden dat er nog geen enkele automatische verbetering is doorgevoerd.

**Wat de evaluatieomgeving kan** (`/admin/globals/assistant-eval`, admin-only):
- Eén testvraag (uit de vaste set van 40, of los getypt) door de volledige pijplijn draaien en per run zien: originele vraag, herschreven zoekvraag, uitgevoerde retrievalfase, alle gevonden bronnen/chunks met similarity-score, prioriteit én bronrol, de letterlijke prompt-context naar het taalmodel, het antwoord, bronvermeldingen, en de confidence/no-answer-beslissing.
- Elke run wordt vastgelegd (`assistant-eval-runs`) met een **handmatig** in te vullen beoordeling (correct/gedeeltelijk correct/incorrect) en een vrij opmerkingenveld — bewust **geen automatische beoordeling**, zoals expliciet gevraagd.
- 40 representatieve testvragen staan klaar (`assistant-eval-questions`, `payload/seed/eval-questions.ts`), 8 per categorie: feitelijk, stap-voor-stap, meerdere routes, onduidelijk, onvoldoende bron.

**Wat nog niet gevalideerd is:**
- Geen van de 40 testvragen is al daadwerkelijk door de pijplijn gehaald: dit is gebouwd in een sandbox zonder werkende `OPENAI_API_KEY`, dus geen enkele echte AI-aanroep kon hier getest worden (wél uitgebreid unit-getest met gemockte, voorspelbare AI-uitkomsten). Eerstvolgende stap: met een echte sleutel alle 40 vragen draaien via de testpagina en handmatig beoordelen.
- Het achtergronddocument is aangemaakt (Knowledge Source id 9 lokaal) maar nog **niet geïndexeerd/geëmbed** — zelfde reden. Opnieuw `npm run import:kennisbasis` draaien (idempotent) of de bron selecteren en op "Indexeer geselecteerde bronnen" klikken zodra er een geldige sleutel is.
- De nieuwe bronrol-tie-break en de herziene systeeminstructie zijn alleen tegen gemockte/geconstrueerde scores getest, nog niet tegen echte similarity-scores en modeloutput.
- `variantContext` op Knowledge Sources is toegevoegd als metadata (zelfde patroon als `Articles.ts`) maar er is bewust **geen variant-gefilterde retrievallogica** gebouwd — expliciet buiten scope van deze opdracht.

## Fase 7: Bewust uitgesteld (niet vóór MVP)

- Academy/cursusplatform
- Inspiratie- en praktijkvoorbeeldenbank
- Uitgebreide analytics
- Geavanceerde automatisering
- Klant-only afgeschermde content + bijbehorende publieke authenticatielaag
- Meerstaps-goedkeuringsworkflows
- Volwaardige incident-response-tooling

## Openstaande beslissingen (vóór of tijdens de bouw)

| # | Beslissing | Status |
|---|---|---|
| 1 | Uitkomst Payload-geschiktheidstoets | ✅ **GO, met voorwaarden** — zie Fase 4-opleveringsrapport |
| 2 | Primaire AI-leverancier (Anthropic vs. OpenAI) | Open — fase 6, testen met echte NL-content |
| 3 | Auth-oplossing beheeromgeving (Auth.js vs. Clerk) | ✅ **Geen van beide** — Payload's ingebouwde authenticatie (`users`-collectie), zie `services/auth.ts` |
| 4 | Opslagleverancier bijlagen (Vercel Blob vs. S3/R2) | ✅ **Vercel Blob** (private storage + signed URL's, GA sinds juni 2026), zie `services/storage.ts` |
| 5 | E-maildienst (Resend vs. Postmark e.d.) | ✅ **Resend**, zie `services/email.ts` (met console-adapter voor development) |
| 6 | Juridische bewaartermijnen + privacyverklaring-tekst | Open — wacht op juridische input namens sCoolsuite B.V. |
| 7 | Definitieve merkbestanden MijnMonti | Open — placeholder-branding tot aanlevering |
| 8 | Definitieve merkbestanden MijnD en vrijeschool-variant (incl. merknaam vrijeschool) | Open — nog niet vastgesteld |

## Vastgelegde keuzes (niet meer open, tenzij expliciet heroverwogen)

- Tweede MVP-variant: **MijnMonti**
- Hosting: **Vercel**-voorkeur, kernlogica providers-onafhankelijk
- Database: **Postgres + pgvector**
- CMS: **Payload CMS 3.86.0** — geschiktheidstoets doorlopen in fase 4, GO met voorwaarden, niet langer onder voorbehoud
- Taal: **TypeScript** (vanaf fase 1 — prototype was bewust JavaScript, zie [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md))
- Lettertype: **Inter**
- Iconenset: **Lucide**
- Styling: **Tailwind CSS v4**, tokens centraal in `app/globals.css` (zie [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md) §7)
- Browserinformatie in contactformulier: alleen grove categorie, **geen fingerprinting**
- Content-, database- en applicatiestructuur: zie [DATA-MODEL.md](DATA-MODEL.md) (canoniek)
