# IMPLEMENTATION-PLAN.md — Bouwfases

> Vanaf hier stopt het ontwerpen en begint de bouw. Dit document is de canonieke bouwvolgorde. [TODO.md](TODO.md) blijft het actuele statusoverzicht (afvinklijst); dit document legt uit **waarom** de volgorde zo is, wat er per fase klaar moet zijn, en welke documenten leidend zijn bij het bouwen.
>
> Volgorde (vastgesteld): **1) platform foundation → 2) component library → 3) pagina's met dummydata → 4) Payload CMS → 5) contentstructuur → 6) AI-laag.** Elke fase levert een werkend, beoordeelbaar tussenresultaat op — er wordt nooit een fase gestart waarvan de vorige niet aantoonbaar af is.

## Waarom deze volgorde

De technische fundering (routing, componentarchitectuur, state management, providers, integratiepunten) staat vóórdat er ook maar één component gebouwd wordt — zonder die fundering zou elke volgende fase op drijfzand bouwen en later dure herstructurering vergen. Daarna pas componenten, dan pagina's: dit maakt de volledige gebruikerservaring (uit [UX-DESIGN.md](UX-DESIGN.md) en [HOMEPAGE-VISUAL-SPEC.md](HOMEPAGE-VISUAL-SPEC.md)) beoordeelbaar vóórdat er backend-code bestaat. De AI-laag is het meest onzekere, moeilijkst te wijzigen onderdeel (providerkeuze, retrieval-kwaliteit, betrouwbaarheidsdrempel) — die hoort daarom als laatste, gebouwd op een fundament dat al bewezen werkt. Het datamodel en de samenvoegfunctie (centraal + variant-overrides) moeten bewijsbaar correct zijn vóórdat er iets geïndexeerd wordt, anders erft de AI-laag fouten uit de laag eronder.

## Fase 0 — Ontwerp (afgerond)

Alle ontwerp- en architectuurdocumenten in `docs/` zijn goedgekeurd, plus een werkend, klikbaar prototype van de homepage (7 states/schermen) op basis van dummydata, bereikbaar via `website/` (`npm run dev`). Dit prototype is het startpunt van Fase 1 — het wordt uitgebreid en verhard, niet weggegooid.

---

## Fase 1 — Platform Foundation

**Wat wordt gebouwd**: de volledige technische fundering vóór er componenten of pagina's gebouwd worden — projectstructuur, componentarchitectuur (atoms/molecules/organisms/layouts) en de bijbehorende afhankelijkheidsregels, routing, layouts, state-managementkeuzes, providers, centraal tokenbeheer, de variant-architectuur, en gereserveerde integratiepunten. Inclusief het overzetten van het bestaande prototype van JavaScript naar TypeScript.

**Afhankelijkheden**: geen — bouwt direct voort op de bestaande Next.js/Tailwind-scaffold uit Fase 0.

**Definition of Done**: zie [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md) §10 — volledig en in detail uitgewerkt, niet herhaald in dit document.

**Leidende documenten**: [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md) (canoniek voor deze fase), [ARCHITECTURE.md](ARCHITECTURE.md), [DATA-MODEL.md](DATA-MODEL.md).

---

## Fase 2 — Component library

**Wat wordt gebouwd**: de losse, ad-hoc componenten uit het prototype (`website/components/`) worden, binnen de in Fase 1 vastgelegde `atoms`/`molecules`/`organisms`/`layouts`-structuur, geformaliseerd tot een complete, herbruikbare bibliotheek die alle 40 onderdelen uit [UI-DESIGN.md](UI-DESIGN.md) dekt: knoppen (alle varianten/staten), formulierelementen, kaarten (elke kenniskaart-variant), badges/meldingen, tabs, dialogen/modals, tabellen, filters, navigatie-elementen (header/footer/breadcrumb), de acht `ContentBlock`-weergavecomponenten, en de antwoord-/bronvermeldingscomponenten uit [HOMEPAGE-VISUAL-SPEC.md](HOMEPAGE-VISUAL-SPEC.md) §4.

**Afhankelijkheden**: Fase 1 volledig afgerond — de componentarchitectuur en afhankelijkheidsregels liggen dan vast.

**Definition of Done**:
- Elke component uit UI-DESIGN.md §7–§23 en §40 bestaat als losse, herbruikbare component met de exacte tokens (kleur, radius, schaduw, spacing) uit [HOMEPAGE-VISUAL-SPEC.md](HOMEPAGE-VISUAL-SPEC.md) §0.
- Alle staten geïmplementeerd: default/hover/focus/disabled/loading (zie UI-DESIGN.md §32–§34).
- Toegankelijkheid aanwezig: focus-ring op elk interactief element, `aria-label` op icoon-only-elementen, correcte formuliersemantiek.
- Elke component visueel te beoordelen zonder losse pagina's te hoeven bouwen (een componenten-overzichtspagina of vergelijkbaar mechanisme).
- Geen kleur/afstand/radius "los" in een pagina gedefinieerd die niet uit deze bibliotheek komt.
- Geen overtreding van de afhankelijkheidsregels uit [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md) §2.

**Leidende documenten**: [UI-DESIGN.md](UI-DESIGN.md) (canoniek voor visueel gedrag), [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md) §2 (componentarchitectuur), [HOMEPAGE-VISUAL-SPEC.md](HOMEPAGE-VISUAL-SPEC.md) (canoniek voor exacte tokenwaarden), [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) (merkbasis).

### Componentinventarisatie (definitief, vervangt géén los document)

**Atoms** — bestaand (Fase 1, ongewijzigd hergebruikt): `Button`, `PlaceholderFoto`, `CategorieIcoon`, `SocialIcons`. Nieuw: `IconButton`, `Link`, `Input`, `Textarea`, `Label`, `Badge`, `Chip` (dekt ook "Tag" en "SearchSuggestion" — zelfde component, interactieve/niet-interactieve variant, geen dubbele componenten), `Divider`, `GradientAccent` (de signatuur-gradientlijn, tot nu toe 4× hardcoded), `Spinner`, `Skeleton`, `VisuallyHidden`.

**Molecules** — bestaand: `KennisKaart` (dekt ook "CategoryCard"/"KnowledgeCard" — identieke component, Nederlandse naam uit Fase 1 blijft canoniek), `ArtikelBlok`. Nieuw: `SearchInput`, `Breadcrumbs`, `ArticleMeta`, `SourceCard` (dekt ook "SourceLink" — kaartvorm was al zo gebouwd in Fase 1 als `BronKaart`, hernoemd naar de canonieke naam), `UpdateCard`, `RecentCard`, `ContactField`, `FormMessage`, `EmptyState`, `ErrorMessage`, `Pagination`, `FeedbackControl`, `Toast` (visuele tegenhanger van de al bestaande `ToastProvider` uit Fase 1).

**Organisms** — bestaand, herbouwd op de nieuwe atoms/molecules: `Header` (nu met `MobileNavigation` als submodule), `Footer`, `Hero` (nu met `SearchPanel` als submodule), `DiscoverSection`, `UpdatesSection`, `RecentSection`. Nieuw: `SearchPanel`, `AnswerPanel`, `AnswerSources`, `NoAnswerState`, `ArticleHeader`, `ArticleContent`, `RelatedArticles`, `CategoryOverview`, `ContactForm`, `MobileNavigation`, `ToastViewport`.

**Bewuste afwijking van de voorbeeldlijst — geen "MultipleAnswers"**: [HOMEPAGE-SPEC.md](HOMEPAGE-SPEC.md) legt al vast dat meerdere bronnen of een ambigue vraag altijd tot **één samenhangend antwoord** leiden, nooit tot een lijst losse resultaten. Een apart "MultipleAnswers"-component zou dat expliciete besluit tegenspreken. `AnswerPanel` dekt beide gevallen via props (`bronnen: SourceCard[]`, optionele `suggesties`).

**Bewust niet gebouwd in Fase 2** (niet in de gevraagde organism-lijst, en horen bij de nog-niet-gestarte admin/CMS-uitwerking): tabel, boomstructuur-navigator, versiegeschiedenis-tijdlijn, trend-mini-grafiek, modal, slide-in-paneel, dropdown-menu, bevestigingsdialoog, select/dropdown, kleurkiezer, bestand-upload-dropzone, toggle/checkbox, tabbladen, chatbubbel (vervallen sinds de "geen AI-taal"-beslissing), avatar/auteursindicator (geen auteursconcept in het datamodel). `FocusRing` is geen apart component maar een gedeelde class-utility (zie `utils/focus-ring.ts`) — een ring is pure styling, geen eigen DOM-structuur.

---

## Fase 3 — Pagina's met dummydata

**Wat wordt gebouwd**: alle 15 schermen uit [UX-DESIGN.md](UX-DESIGN.md) als werkende Next.js-routes (volgens de routing/layouts uit [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md) §3–§4), samengesteld uit de Fase 2-bibliotheek, gevuld met statische dummydata — geen backend. Publiek: Homepage (al gebouwd, wordt hier verder verfijnd), Zoekresultaten, Handleiding/Artikel (al gebouwd), Categorie-overzicht, Updates, Contactformulier (alleen UI, geen verzending), Variantwissel. Beheer: Dashboard, Artikelen beheren, Variants beheren, Media beheren, AI-feedback beoordelen, Instellingen — ook deze zes als eigen UI met dummydata, nog **niet** gekoppeld aan Payload, zodat interactie en navigatie beoordeeld kunnen worden vóór de CMS-integratie.

**Afhankelijkheden**: Fase 2 moet functioneel compleet zijn — deze fase is compositie, geen nieuwe visuele patronen.

**Definition of Done**:
- Alle 15 schermen uit UX-DESIGN.md zijn bereikbaar als werkende, klikbare route.
- Elke gespecificeerde staat per scherm is aanwezig (leeg/laden/fout/gevuld — zie het "Lege statussen"/"Loading states"/"Foutmeldingen"-veld per scherm in UX-DESIGN.md).
- Responsive gedrag klopt met UI-DESIGN.md §4 op alle drie breekpunten.
- Nergens de woorden AI, AI-assistent of chatbot in gebruikersgerichte tekst (doorlopende eis, zie [HOMEPAGE-SPEC.md](HOMEPAGE-SPEC.md)).
- De homepage-states uit het Fase 0-prototype zijn 1:1 overgenomen, niet opnieuw uitgevonden.
- De `DemoSwitcher` uit het prototype is verwijderd of expliciet achter een productie-guard gezet (zie [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md) §4).

**Leidende documenten**: [UX-DESIGN.md](UX-DESIGN.md) (canoniek voor schermen/staten/flows), [HOMEPAGE-SPEC.md](HOMEPAGE-SPEC.md) en [HOMEPAGE-VISUAL-SPEC.md](HOMEPAGE-VISUAL-SPEC.md) (referentie-precisie voor de overige pagina's).

---

## Fase 4 — Payload CMS

**Wat wordt gebouwd**:
1. **Eerst** de Payload-geschiktheidstoets uit [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md) §Payload-geschiktheidstoets — een go/no-go-moment, geen formaliteit. Bij een negatieve uitkomst wordt het beschreven zelfbouw-alternatief gestart in plaats van de rest van deze fase.
2. Payload CMS opzetten binnen dezelfde Next.js-codebase (mount-punt al gereserveerd in Fase 1, zie [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md) §9), Postgres-adapter geconfigureerd (dezelfde database die later ook `pgvector` gebruikt).
3. Collections die 1:1 het canonieke datamodel volgen: `Article` (met `Section`/`ContentBlock` als Payload Blocks-veld), `VariantOverride`, `Media`, `Variant`, gebruikers/rollen.
4. Rechten/toegangscontrole: `editor` mag nooit in de centrale boom schrijven, alleen in `VariantOverride` voor de eigen variant (zie [CONTENT-MODEL.md](CONTENT-MODEL.md) §Wie mag wat schrijven) — schema-niveau afgedwongen, niet alleen UI.
5. Versies, concepten, geplande publicatie, audit-log, preview-per-variant ingeschakeld.
6. Authenticatie voor de beheeromgeving (Auth.js of Clerk — zie open beslissing in [TODO.md](TODO.md)), via `services/auth.ts` (zie [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md) §9).
7. Contactformulier echt werkend maken: opslag (`ContactSubmission`/`Attachment`), privé bijlage-opslag, spambeveiliging, e-mailnotificatie (zie [SECURITY-AND-PRIVACY.md](SECURITY-AND-PRIVACY.md)).

**Afhankelijkheden**: Fase 3 is qua code niet strikt vereist, maar wél qua kennis — de pagina's maken concreet welke datavorm nodig is, wat de Payload-schema's scherper maakt. Vandaar gepland ná Fase 3.

**Definition of Done**:
- Geschiktheidstoets doorlopen, uitkomst vastgelegd in TODO.md (Payload bevestigd óf overgestapt op het alternatief).
- Payload draait lokaal naast Next.js op dezelfde Postgres-database.
- Alle DATA-MODEL.md-entiteiten bestaan als collections met correcte, geteste rechten per rol.
- Een redacteur kan via de Payload-admin-UI een testartikel aanmaken, opslaan als concept, laten reviewen en publiceren — end-to-end getest, niet alleen in theorie.
- Het contactformulier uit Fase 3 verstuurt echt, met bijlage-opslag die voldoet aan de retentie-/privacyregels uit SECURITY-AND-PRIVACY.md.

**Leidende documenten**: [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md) (canoniek), [DATA-MODEL.md](DATA-MODEL.md) (canoniek schema), [ARCHITECTURE.md](ARCHITECTURE.md) (hosting/deployment), [SECURITY-AND-PRIVACY.md](SECURITY-AND-PRIVACY.md) (contactformulier/bijlagen).

---

## Fase 5 — Contentstructuur

**Wat wordt gebouwd**:
1. De **gedeelde samenvoegfunctie** (`lib/content/merge.ts`, contract al vastgelegd in Fase 1 — zie [PLATFORM-FOUNDATION.md](PLATFORM-FOUNDATION.md) §1/§8, centraal + variant-overrides → weergegeven content, zie [ARCHITECTURE.md](ARCHITECTURE.md) §Eén gedeelde samenvoegfunctie) — nu daadwerkelijk geïmplementeerd, mét de verplichte geautomatiseerde pariteitstest.
2. Migratie van de 25 bestaande handleiding-PDF's (`handleidingen/`) naar het modulaire `Article`/`Section`/`ContentBlock`-model in Payload — de eerste vulling van de centrale kennisbank.
3. Categorieën en terminologie voor MijnLeerlijn ingericht.
4. MijnMonti als tweede voorbeeldvariant concreet opgezet: placeholder-branding (of definitieve, indien inmiddels aangeleverd), minstens één `aanvullen`-, één `vervangen`- en één `ander_medium`-override, een terminologie-woordenboek met minstens één afwijking (zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md)).
5. De Fase 3-pagina's omschakelen van dummydata naar echte Payload-content via de samenvoegfunctie.

**Afhankelijkheden**: Fase 4 moet volledig werkend zijn — er is geen plek om content te schrijven zonder een werkende CMS.

**Definition of Done**:
- Alle 25 handleidingen staan als gestructureerde artikelen in het systeem, elk met minstens één sectie en de juiste bloktypes.
- MijnMonti toont aantoonbaar elk van de vereiste override-acties (zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md) §MijnMonti als referentievoorbeeld).
- De Fase 3-pagina's tonen live Payload-content, dummydata is verwijderd.
- De samenvoegfunctie-pariteitstest slaagt: paginaweergave en (nog te bouwen) zoekindex/AI-index zouden identieke content krijgen voor dezelfde `(article, variant)`-combinatie.
- `knowledgeType`/`aiApprovalStatus` zijn op elk gemigreerd artikel correct gezet (zie [CONTENT-MODEL.md](CONTENT-MODEL.md) §Twee soorten kennis) — dit is de voorbereiding voor Fase 6, niet iets om daar nog te moeten inhalen.

**Leidende documenten**: [CONTENT-MODEL.md](CONTENT-MODEL.md) (redactionele regels/override-acties), [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md) (MijnMonti-eisen), [DATA-MODEL.md](DATA-MODEL.md).

---

## Fase 6 — AI-laag

**Wat wordt gebouwd**: de RAG-pijplijn (indexeren op blokniveau, `pgvector`, harde variant-scoping op query-niveau) via `services/retrieval.ts` en `services/ai.ts` (mount-punten al gereserveerd in Fase 1), de providerabstractie met een eerste praktijktest tussen Anthropic en OpenAI op echte Nederlandstalige content, het citatiemechanisme, de betrouwbaarheidsdrempel met de "geen antwoord"-fallback naar het contactformulier — en het koppelen van de al volledig ontworpen homepage-antwoordervaring (de zes states uit [HOMEPAGE-SPEC.md](HOMEPAGE-SPEC.md)/[HOMEPAGE-VISUAL-SPEC.md](HOMEPAGE-VISUAL-SPEC.md), tot nu toe alleen als dummy-states) aan deze echte laag.

**Afhankelijkheden**: Fase 5 volledig — er moet goedgekeurde, gestructureerde content zijn om te indexeren, en de samenvoegfunctie moet al bewezen correct zijn (die wordt hier hergebruikt, niet opnieuw gebouwd).

**Definition of Done**:
- Een vraag op de homepage levert een echt antwoord op, met correcte bronvermelding uit de echte content (titel, sectie, link, datum — zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) §Bronvermelding).
- Variant-scoping werkt aantoonbaar: een MijnMonti-vraag levert nooit MijnLeerlijn-only content op en omgekeerd (verplichte variant-lekkage-test slaagt).
- De betrouwbaarheidsdrempel is gebaseerd op retrieval-kwaliteit, niet op het zelfvertrouwen van het model; onder de drempel verschijnt de al ontworpen "geen antwoord"-staat, geen gegokt antwoord.
- Onderwijskundige content (`knowledgeType = pedagogisch`) is pas doorzoekbaar ná expliciete `aiApprovalStatus = goedgekeurd` — technisch getest, niet aangenomen.
- De samenvoegfunctie-pariteitstest (uit Fase 5) is uitgebreid met de AI-index als derde vergelijkingspunt en slaagt.
- Nergens in de gebruikerservaring verschijnen de woorden AI, AI-assistent of chatbot.

**Leidende documenten**: [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) (canoniek), [HOMEPAGE-SPEC.md](HOMEPAGE-SPEC.md) en [HOMEPAGE-VISUAL-SPEC.md](HOMEPAGE-VISUAL-SPEC.md) (de exacte ervaring die nu écht gemaakt wordt).

---

## Wat buiten dit plan valt

Zie [PROJECT.md](PROJECT.md) §Fasering en [TODO.md](TODO.md) §Fase 7 (bewust uitgesteld) — academy, inspiratie/praktijkvoorbeelden, uitgebreide analytics, geavanceerde automatisering, klant-only content, meerstaps-goedkeuring, volwaardige incident-response. Dit implementatieplan bouwt uitsluitend de MVP-scope.

## Openstaande beslissingen die een fase blokkeren

| Beslissing | Blokkeert |
|---|---|
| Uitkomst Payload-geschiktheidstoets | Start van Fase 4 (stap 2 t/m 7) |
| Auth-oplossing (Auth.js vs. Clerk) | Fase 4 stap 6 |
| Opslagleverancier bijlagen, e-maildienst | Fase 4 stap 7 |
| Primaire AI-leverancier | Fase 6 |
| Juridische bewaartermijnen/privacytekst | Fase 4 stap 7 (contactformulier live zetten) — technisch kan het door, juridisch akkoord moet er zijn vóór productie |

Zie [TODO.md](TODO.md) voor de volledige, actuele lijst met alle openstaande en vastgelegde keuzes.
