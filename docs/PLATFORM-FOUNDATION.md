# PLATFORM-FOUNDATION.md — Technische blauwdruk

> We bouwen geen homepage. We bouwen het platform dat de komende jaren de basis is voor MijnLeerlijn, MijnMonti, MijnD en toekomstige varianten. Dit document is de technische fundering die vóór de eerste component of pagina vaststaat. Geen implementatie — alleen architectuur.
>
> Bron van waarheid: [ARCHITECTURE.md](ARCHITECTURE.md) (systeemniveau), [DATA-MODEL.md](DATA-MODEL.md) (canoniek datamodel), [CONTENT-MODEL.md](CONTENT-MODEL.md), [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md), [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md), [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md), [UI-DESIGN.md](UI-DESIGN.md), [UX-DESIGN.md](UX-DESIGN.md), [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) en het werkende prototype in `website/`. Elke keuze hieronder die niet rechtstreeks uit die documenten volgt, is expliciet gemotiveerd — er wordt geen technologie toegevoegd zonder reden.
>
> **Dit is nu Fase 1 van het bouwtraject** — vóór de component library. [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) en [TODO.md](TODO.md) zijn dienovereenkomstig hernummerd (zie onderaan dit document).

## Eén vooraf besliste, gemotiveerde technologiewijziging: TypeScript

Het prototype in `website/` is bewust in JavaScript gebouwd — snelheid boven zekerheid, voor een wegwerpbaar ontwerpbewijs. De platformfundering is dat niet: het canonieke datamodel is een polymorfe structuur (`VariantOverride` die naar `article`/`section`/`block` kan wijzen, acht verschillende `ContentBlock`-typen) waar foutief gebruik pas bij runtime zichtbaar zou worden zonder types. Belangrijker nog: **Payload CMS genereert automatisch TypeScript-types uit de collection-schema's** (`payload-types.ts`, zie Fase 4/9 hieronder) — in JavaScript bouwen zou die generatie waardeloos maken en een handmatige vertaallaag verplichten die voortdurend uit sync kan raken met de echte CMS-schema's. TypeScript is daarom de taal van de platformfundering. De bestaande prototype-bestanden (`.js`/`.jsx`) worden als onderdeel van deze fase overgezet naar `.ts`/`.tsx` — zie Definition of Done.

---

## 1. Next.js-projectstructuur

```
website/
├── app/
│   ├── (public)/                         # PublicLayout — publieke schermen
│   │   ├── layout.tsx
│   │   ├── page.tsx                      # /
│   │   ├── zoeken/page.tsx               # /zoeken
│   │   ├── categorie/[slug]/page.tsx     # /categorie/[slug]
│   │   ├── artikel/[slug]/page.tsx       # /artikel/[slug]
│   │   ├── updates/page.tsx              # /updates
│   │   ├── contact/page.tsx              # /contact
│   │   └── kies-variant/page.tsx         # /kies-variant
│   ├── (admin)/                          # AdminLayout — beheeromgeving
│   │   └── beheer/
│   │       ├── page.tsx                  # /beheer (dashboard)
│   │       ├── artikelen/page.tsx
│   │       ├── artikelen/nieuw/page.tsx
│   │       ├── artikelen/[id]/page.tsx
│   │       ├── variants/page.tsx
│   │       ├── variants/[id]/page.tsx
│   │       ├── media/page.tsx
│   │       ├── ai-feedback/page.tsx
│   │       └── instellingen/page.tsx
│   ├── (payload)/admin/[[...segments]]/page.tsx   # gereserveerd, Payload-mount (fase 4)
│   ├── api/
│   │   ├── antwoord/route.ts             # gereserveerd — AI-laag (fase 6)
│   │   ├── contact/route.ts              # gereserveerd — contactformulier (fase 4)
│   │   └── revalidate/route.ts           # gereserveerd — on-demand ISR vanuit Payload
│   ├── layout.tsx                        # Root layout: html/body, fonts, <AppProviders>
│   ├── globals.css                       # Tailwind + design tokens (zie §7)
│   ├── not-found.tsx
│   └── error.tsx
├── components/                           # Fase 2 — presentational bibliotheek, domein-onwetend
│   ├── atoms/
│   ├── molecules/
│   ├── organisms/
│   └── layouts/
├── features/                             # domeinlogica per verticale, gebruikt components/
│   ├── zoeken/
│   ├── antwoord/
│   ├── artikel/
│   ├── categorie/
│   ├── contact/
│   ├── variantwissel/
│   └── beheer/
│       ├── artikelen/
│       ├── variants/
│       ├── media/
│       ├── ai-feedback/
│       └── instellingen/
├── lib/                                  # gedeelde domeinlogica zonder React
│   ├── content/merge.ts                  # DE gedeelde samenvoegfunctie (zie §8)
│   ├── variant/
│   └── format/
├── hooks/                                # gedeelde, domein-onwetende React-hooks
├── services/                             # enige laag die met de buitenwereld praat (zie §9)
│   ├── payload.ts
│   ├── retrieval.ts
│   ├── ai.ts
│   ├── auth.ts
│   ├── email.ts
│   ├── storage.ts
│   └── analytics.ts
├── providers/                            # React Context-providers + hun samenstelling
│   ├── AppProviders.tsx
│   ├── VariantProvider.tsx
│   ├── AuthProvider.tsx
│   ├── SearchProvider.tsx
│   ├── ToastProvider.tsx
│   └── AnalyticsProvider.tsx
├── styles/                               # niet-Tailwind CSS (bewust klein, zie toelichting)
├── types/                                # canoniek datamodel als TypeScript-types
│   ├── content.ts                        # Article/Section/ContentBlock/VariantOverride/Media
│   ├── variant.ts
│   ├── contact.ts
│   └── payload-generated.d.ts            # gereserveerd — Payload's auto-gegenereerde types
├── utils/                                # pure helpers, geen React, geen domeinkennis
├── config/                               # applicatieconfiguratie, geen geheimen
│   ├── variants.ts
│   ├── site.ts
│   └── env.ts
├── middleware.ts                         # variant-herkenning (root-niveau, niet in app/)
├── public/brand/                         # merkassets (al aanwezig uit het prototype)
├── next.config.ts
├── tsconfig.json
└── package.json
```

### Waarom elke map bestaat

- **`app/`** — Next.js App Router, routing én server-rendering. De route groups `(public)` en `(admin)` bestaan specifiek om twee volledig verschillende layouts (§4) te kunnen toepassen zonder dat dit in de URL zichtbaar wordt — `/beheer/...` blijft een schone URL, ook al leeft die onder een andere layout-boom dan `/artikel/...`.
- **`components/`** — de Fase-2-bibliotheek uit [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md), strikt presentationeel (§2). Deze map bestaat gescheiden van `features/` om één architectuurregel afdwingbaar te maken: herbruikbare UI mag nooit weten wat een "artikel" of "variant" is.
- **`features/`** — domeinlogica per verticale taak (zoeken, antwoord geven, een artikel beheren, …), elk met de eigen data-ophaling/state die specifiek is voor die taak. Deze map bestaat omdat `app/`-routes anders zelf vol zouden lopen met bedrijfslogica — een route-bestand hoort dun te zijn en een `features/`-module aan te roepen.
- **`lib/`** — domeinkennis, maar zonder React-afhankelijkheid: berekeningen en regels die overal (server, client, later misschien een los script) hergebruikt moeten kunnen worden. De gedeelde samenvoegfunctie (§8, [ARCHITECTURE.md](ARCHITECTURE.md)) hoort hier, niet in `services/`, omdat ze geen externe systemen aanroept — ze combineert data die al is opgehaald.
- **`hooks/`** — gedeelde React-hooks zonder domeinkennis (bv. `useMediaQuery`, `useDebounce`, `useLocalStorage`). Domeinspecifieke hooks (bv. `useArtikelData`) horen in de bijbehorende `features/`-map, niet hier — dit voorkomt dat `hooks/` een verzamelbak wordt.
- **`services/`** — de enige laag die met iets buiten deze applicatie praat: Payload, de retrieval-/AI-laag, e-mail, opslag, authenticatie, analytics. Deze scheiding is de technische garantie achter het providerabstractie-principe uit [ARCHITECTURE.md](ARCHITECTURE.md) — een leverancierswissel raakt precies één bestand per dienst, nooit `features/` of `components/`.
- **`providers/`** — React Context en de samenstelling ervan (§6), bewust gescheiden van `components/` zodat de presentational-laag puur blijft: een provider draagt applicatiebrede state, geen component uit `components/` mag er zelf een definiëren.
- **`styles/`** — bewust klein. Tailwind's `@theme` in `app/globals.css` is al de centrale plek voor tokens (§7); deze map is gereserveerd voor niet-Tailwind CSS die zich later aandient (bijvoorbeeld een printstylesheet voor een af te drukken artikel), niet voor tokens zelf.
- **`types/`** — het canonieke datamodel uit [DATA-MODEL.md](DATA-MODEL.md) als TypeScript-brontypes, plus later Payload's gegenereerde types. Deze map is de plek waar "wat is een Artikel in code" één keer wordt vastgelegd, door elke andere map hergebruikt.
- **`utils/`** — puur functionele helpers zonder domeinkennis en zonder React (bv. `slugify`, `formatDate`, een classnames-helper). Onderscheid met `lib/`: `utils/` weet niets over MijnLeerlijn-begrippen, `lib/` wel.
- **`config/`** — applicatiebrede constanten en configuratie (variant-defaults, site-instellingen, env-validatie) — geen geheimen, geen secrets (die leven in omgevingsvariabelen, niet in deze map).
- **`middleware.ts`** — op root-niveau omdat Next.js dat vereist; bevat de variant-herkenning uit [ARCHITECTURE.md](ARCHITECTURE.md) §Variant-herkenningsmechanisme.

---

## 2. Componentarchitectuur (atomic design)

| Laag | Definitie | Voorbeelden | Mag importeren uit |
|---|---|---|---|
| **Atoms** | Kleinste, puur presentationele bouwstenen. Geen domeinkennis, geen data-fetching, geen kennis van "artikel" of "variant". | Button, Input, Badge, Chip, Icoon-wrapper, Skeleton-primitive, Avatar | Niets domeinspecifieks — alleen andere atoms (zelden) en design tokens |
| **Molecules** | Een klein samenstel van atoms met beperkt eigen gedrag, nog steeds domein-onwetend. | SearchField (input + verzendknop), FormField (label + input + foutmelding), Breadcrumb, Tabs, KennisKaart (icoon + titel + tekst), BronKaart | Atoms |
| **Organisms** | Complexe, vaak sectie-bewuste UI-blokken die weten "wat voor sectie" ze zijn, maar nog steeds via props gevuld worden — geen eigen data-fetching. | Header, Footer, Hero (incl. antwoordweergave-shell), DiscoverSection, UpdatesSection, RecentSection, DataTable (beheer), ArtikelInhoud (met TOC) | Atoms, molecules |
| **Layouts** | Combineren organisms tot een paginaskelet. | PublicLayout, KnowledgeLayout, AdminLayout | Atoms, molecules, organisms |

### Afhankelijkheidsregels (hard, niet onderhandelbaar)

1. **Atoms importeren nooit uit molecules of organisms** — geen cirkelvormige of omgekeerde afhankelijkheden.
2. **Atoms bevatten nooit domeinkennis** — geen import uit `features/`, `services/`, of domeinspecifieke delen van `types/`. Een `Button` weet niet wat een artikel is.
3. **Molecules gebruiken alleen atoms**, nooit organisms.
4. **Organisms verweven nooit rechtstreeks met andere organisms** — compositie van meerdere organisms gebeurt op paginaniveau (`app/`) of in een layout, niet door het ene organism het andere te laten importeren. Dit houdt organisms onafhankelijk herbruikbaar.
5. **`components/` (alle vier lagen) importeert nooit uit `features/`** — de afhankelijkheidsrichting is altijd `features/ → components/`, nooit andersom. Dit is de belangrijkste regel: ze voorkomt dat de herbruikbare bibliotheek vervuild raakt met eenmalige domeinlogica.
6. **`components/` roept nooit rechtstreeks `services/` aan** — geen data-fetching in de presentational-laag. Data komt altijd binnen via props, aangeleverd door `features/` of een Server Component in `app/`.

Aanbeveling voor Fase 2 (component library): deze regels handhaven met een lint-regel (bijvoorbeeld `eslint-plugin-boundaries` of een vergelijkbare import-restrictieplugin), niet alleen met documentatie — zie Definition of Done.

---

## 3. Routing

| Route | Scherm (UX-DESIGN.md) | Layout |
|---|---|---|
| `/` | 1. Homepage | PublicLayout |
| `/zoeken` | 2. Zoekresultaten | PublicLayout |
| `/categorie/[slug]` | 6. Categorie-overzicht | KnowledgeLayout |
| `/artikel/[slug]` | 3. Handleiding | KnowledgeLayout |
| `/updates` | 7. Updates | PublicLayout |
| `/contact` | 5. Contactformulier | PublicLayout |
| `/kies-variant` | 9. Variantwissel (publieke kiezer) | PublicLayout (minimale variant) |
| `/beheer` | 10. Dashboard | AdminLayout |
| `/beheer/artikelen`, `/beheer/artikelen/nieuw`, `/beheer/artikelen/[id]` | 11. Artikelen beheren | AdminLayout |
| `/beheer/variants`, `/beheer/variants/[id]` | 12. Variants beheren | AdminLayout |
| `/beheer/media` | 13. Media beheren | AdminLayout |
| `/beheer/ai-feedback` | 14. AI feedback beoordelen | AdminLayout |
| `/beheer/instellingen` | 15. Instellingen | AdminLayout |
| `/admin/**` | Payload's eigen admin-UI (gereserveerd, fase 4) | Payload's eigen shell |

**AI-chat (scherm 4) en "geen antwoord" (scherm 8) hebben geen eigen route** — dit is bewust: de in-place antwoordervaring uit [HOMEPAGE-SPEC.md](HOMEPAGE-SPEC.md) leeft binnen `/` (en desgewenst `/zoeken`), niet als losse pagina. Zie ook de eerdere beslissing om nergens de woorden AI/chat in gebruikersgerichte routes of teksten te gebruiken.

**Variant-onafhankelijke URL-structuur**: deze routes zijn identiek voor elke variant — `middleware.ts` bepaalt de actieve variant vóór de route rendert (domein → subdomein → pad-slug-fallback, zie [ARCHITECTURE.md](ARCHITECTURE.md)). Bij de tijdelijke pad-slug-fallback (bijv. `help.mijnleerlijn.nl/mijnmonti/artikel/...`) herschrijft de middleware het pad intern naar de canonieke route en zet de variant-context in een header — geen enkele `app/`-route hoeft zelf variant-prefixen te parsen.

**Toekomstige uitbreidingen, padnamen gereserveerd maar niet gebouwd** (zie [PROJECT.md](PROJECT.md) §Fasering — bewust uitgesteld): `/academy`, `/inspiratie`. Wanneer deze starten, volgen ze dezelfde PublicLayout-conventie.

**API-routes** (`app/api/`): reservering voor de integratiepunten uit §9 — `antwoord`, `contact`, `revalidate`. Geen enkele hiervan wordt in deze fase geïmplementeerd.

---

## 4. Layouts

| Layout | Bevat | Gebruikt door |
|---|---|---|
| **PublicLayout** | Header, `<main>`, Footer | `/`, `/zoeken`, `/updates`, `/contact`, `/kies-variant` |
| **KnowledgeLayout** | PublicLayout + sticky inhoudsopgave-/breadcrumb-slot | `/artikel/[slug]`, `/categorie/[slug]` |
| **AdminLayout** | Zijnavigatie, gebruikersmenu, variant-contextselector — **geen** publieke Header/Footer | Alles onder `/beheer` |

`KnowledgeLayout` is technisch een uitbreiding van `PublicLayout` (zelfde Header/Footer, extra content-slot voor de inhoudsopgave-sidebar uit [UX-DESIGN.md](UX-DESIGN.md) scherm 3/6) — geen aparte Header/Footer-implementatie.

**Gedeeld tussen layouts**:
- Het meldingen-/toast-systeem (`ToastProvider`, §6) — beschikbaar in zowel publieke als admin-schermen.
- De variant-badge/indicator-component — dezelfde component, andere plaatsing (header bij publiek, zijnavigatie-context bij admin).

**Niet gedeeld, en waarom**: de `DemoSwitcher` uit het prototype is uitsluitend een ontwerpbeoordelings-hulpmiddel. Die verhuist in Fase 2 niet mee naar de echte layouts — hij wordt verwijderd of expliciet achter een `process.env.NODE_ENV !== "production"`-guard gezet, nooit onderdeel van `PublicLayout`/`AdminLayout` zelf.

---

## 5. State management

| Type | Wanneer | Voorbeelden | Waarom |
|---|---|---|---|
| **React state** (`useState`/`useReducer`) | Lokale, vluchtige UI-state die nooit buiten de component + directe kinderen hoeft te bestaan | Mobiel menu open/dicht, actieve tab, formulierinvoer vóór versturen | Geen reden voor iets zwaarders — dit is de default, niet de uitzondering |
| **Context** | Gedeelde, laag-frequent wijzigende state die door veel, niet-aangrenzende componenten gelezen wordt, zonder dat die uit de server/URL komt | Actieve variant (`VariantProvider`), ingelogde gebruiker/rol (`AuthProvider`), toast-meldingen | Voorkomt prop-drilling voor iets dat de hele boom nodig heeft |
| **Server Components** (React Server Components, App Router-default) | Alles wat content/data uit Payload of de AI-laag toont | Artikelen, categorieën, initiële zoekresultaten, dashboardcijfers | Geen client-bundle-kosten, directe toegang tot `services/` zonder een aparte API-laag te bouwen voor de eigen frontend, sluit aan bij de al gekozen ISR-strategie ([ARCHITECTURE.md](ARCHITECTURE.md)) |
| **URL state** (`searchParams`) | Alles wat deelbaar of bookmarkbaar moet zijn, of samenhangt met navigatiehistorie | Zoekterm en filters op `/zoeken`, categoriefilter | Als een gebruiker de exacte schermstaat zou willen kunnen delen via een link, hoort het in de URL — niet in Context of React state (zo werkte de state-switcher in het prototype al) |
| **Caching** | Publieke content: Next.js' ingebouwde data cache + on-demand ISR (revalidatie bij publiceren vanuit Payload, via `/api/revalidate`). Admin-mutaties: Server Actions + `revalidatePath`/`revalidateTag` | Artikelpagina's, dashboardcijfers na een publicatie-actie | — |

**Expliciet niet toegevoegd: een aparte client-side data-library (React Query/SWR).** Server Components en Next.js' eigen caching dekken de behoefte al; een tweede caching-paradigma naast Next.js' model zou complexiteit toevoegen zonder aantoonbare meerwaarde op deze schaal. Deze beslissing wordt herzien als de admin-beheeromgeving in de praktijk behoefte blijkt te hebben aan client-side optimistic updates die Server Actions niet comfortabel dekken — niet eerder.

---

## 6. Providers

| Provider | Verantwoordelijkheid | Actief in |
|---|---|---|
| `VariantProvider` | Stelt de door `middleware.ts` herkende variant (branding, terminologie, feature-flags) beschikbaar, server-side gevuld en als initiële waarde naar de client doorgegeven | Overal (root layout) |
| `AuthProvider` | Sessie/rol van de ingelogde redacteur of beheerder | Alleen binnen `(admin)` |
| `SearchProvider` | Lokale (niet-server) staat van de in-place antwoordervaring: huidige vraag, laadstatus, laatst getoonde antwoord- of "geen antwoord"-staat. Bewaart **geen** antwoordinhoud buiten de sessie — zie [SECURITY-AND-PRIVACY.md](SECURITY-AND-PRIVACY.md) over AI-vraaglogs | Publieke schermen met een zoekveld |
| `ToastProvider` | Gedeeld meldingensysteem (zie [UI-DESIGN.md](UI-DESIGN.md) §15) | Overal |
| `AnalyticsProvider` | Dunne event-tracking-abstractie; nu een no-op-implementatie (uitgebreide analytics is uitgesteld, zie [PROJECT.md](PROJECT.md)), zodat componenten later niet hoeven te wachten op een leverancierskeuze | Overal |

**Expliciet geen `ThemeProvider`**: er is geen donkere modus (zie [UI-DESIGN.md](UI-DESIGN.md) §31, een bewust genomen beslissing) — een lege themacontext zou premature abstractie zijn.

Alle providers worden op één plek samengesteld: `providers/AppProviders.tsx`, aangeroepen vanuit `app/layout.tsx`. Dit is de enige plek waar provider-volgorde en -nesting wordt bepaald, niet los per pagina.

---

## 7. Design tokens — centraal beheer

| Categorie | Waar | Mechanisme |
|---|---|---|
| Kleuren, radius, schaduw, typografie-schaal | `app/globals.css`, Tailwind v4 `@theme`-blok | Al toegepast in het prototype, letterlijk overgenomen uit [HOMEPAGE-VISUAL-SPEC.md](HOMEPAGE-VISUAL-SPEC.md) §0 — dit ís de bron van waarheid, geen los JS-tokenobject ernaast (zou een tweede, mogelijk-uit-sync bron creëren) |
| Iconen | `lucide-react`, per icoon geïmporteerd (niet de hele set, i.v.m. bundlegrootte) + een dun mapping-bestand (naar het patroon van `CategorieIcoon` uit het prototype) voor domeinspecifieke icoon-toewijzing | Eén plek waar "welk icoon hoort bij welke categorie" beheerd wordt |
| Typografie (lettertype) | `next/font/google` (Inter) in `app/layout.tsx`, doorgegeven als CSS-variabele aan Tailwind | Al toegepast in het prototype |
| Animaties | Timing-waarden (120/200/300ms) als Tailwind arbitrary values; zodra hergebruik toeneemt over te zetten naar losse CSS custom properties (bv. `--duration-hover`) | Bewust nog niet vooraf geabstraheerd — YAGNI, pas invoeren bij aantoonbare herhaling |
| **Variant-specifieke accentkleur** | CSS custom property (bv. `--variant-accent`), server-side geïnjecteerd op de `<html>`- of `<body>`-tag vanuit de actieve `Variant`-data; Tailwind-utilities verwijzen ernaar (`bg-[var(--variant-accent)]`) | **Sleutelbeslissing**: Tailwind's `@theme`-tokens zijn build-time/statisch, maar de variant-accentkleur is runtime (per request/domein bepaald). CSS custom properties lossen deze spanning op — de merk-brede semantische kleuren (succes/waarschuwing/fout/tip, zie [UI-DESIGN.md](UI-DESIGN.md) §6) blijven wél statische Tailwind-tokens, want die veranderen nooit per variant |

---

## 8. Variant-architectuur

Hoe MijnLeerlijn, MijnMonti en MijnD dezelfde componenten gebruiken maar andere content en styling tonen:

1. **Componenten zijn volledig variant-onwetend.** Een `Button` of `KennisKaart` "weet" niet welke variant actief is. Merk-brede kleuren komen uit de statische Tailwind-tokens; de enige variant-afhankelijke waarde (de accentkleur) komt binnen via de CSS custom property uit §7 — nooit via een `if (variant === "mijnmonti")` in componentcode.
2. **Content komt altijd al samengesteld binnen.** De gedeelde samenvoegfunctie (`lib/content/merge.ts`, zie [ARCHITECTURE.md](ARCHITECTURE.md) en [CONTENT-MODEL.md](CONTENT-MODEL.md)) is de **enige** plek waar centrale content en variant-overrides samenkomen. `features/` en `app/`-routes roepen deze functie aan met `(article, variantId)` en krijgen kant-en-klare content terug; componenten renderen alleen het resultaat en weten niets van "overrides", "centraal" of "variant".
3. **Terminologie-substitutie is onderdeel van diezelfde functie**, niet van componenten. Een `KennisKaart`-component ontvangt al-gesubstitueerde tekst.
4. **Herkenning gebeurt één keer, vroeg**: `middleware.ts` bepaalt de variant per request en vult `VariantProvider` — geen enkele component of feature hoeft zelf domein/subdomein/slug te interpreteren.
5. **Wat wél per variant verschilt op technisch niveau**: alleen de CSS custom property (accentkleur) en het logo-asset (opgehaald uit de `Variant`-data, nooit hardcoded per variant in code). Structuur, layout en componentkeuze verschillen nooit per variant.
6. **Gevolg**: een nieuwe variant toevoegen vereist nooit nieuwe code of componenten — alleen nieuwe data (een `Variant`-record en eventuele `VariantOverride`-records), precies het principe dat al in [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md) is vastgelegd, nu technisch geborgd.

---

## 9. Integratiepunten (architectuur, geen implementatie)

| Integratie | Service-bestand | Aanroeppunt | Fase |
|---|---|---|---|
| Payload CMS | `services/payload.ts` — enige plek die de Payload local API/REST aanroept | `features/*` en Server Components in `app/`, nooit rechtstreeks | 4 |
| Zoekmachine/retrieval | `services/retrieval.ts` — abstracte interface `zoek(query, variantId)` | `features/antwoord` | 6 |
| AI | `services/ai.ts` — de providerabstractie uit [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md); `app/api/antwoord/route.ts` als aanroeppunt vanuit de homepage-antwoordervaring | `features/antwoord` | 6 |
| Authenticatie | `services/auth.ts` + uitbreiding van `middleware.ts` voor route-bescherming van `(admin)`; `AuthProvider` leest hieruit | `(admin)`-routes | 4 |
| Analytics | `services/analytics.ts`, nu een no-op-implementatie | `AnalyticsProvider` | Later (uitgesteld, zie [PROJECT.md](PROJECT.md)) |
| E-mail (contactformulier) | `services/email.ts` | `app/api/contact/route.ts` | 4 |
| Bijlage-opslag | `services/storage.ts` | `app/api/contact/route.ts`, media-beheer | 4 |

**De rode draad**: `features/` en `components/` praten nooit rechtstreeks met een externe dienst — uitsluitend via `services/`. Dit is de architecturale garantie achter het providerabstractie-principe uit [ARCHITECTURE.md](ARCHITECTURE.md): een leverancierswissel (bijvoorbeeld Anthropic → OpenAI, of Vercel Blob → S3) raakt precies één bestand.

**Payload's mount-punt** (`app/(payload)/admin/[[...segments]]/page.tsx`) wordt in deze fase alleen als lege route gereserveerd — Payload v3 integreert native in een Next.js-app via zo'n catch-all route; het daadwerkelijk inrichten gebeurt in Fase 4, inclusief de geschiktheidstoets uit [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md).

---

## 10. Definition of Done — wanneer is de foundation gereed?

Pas wanneer al het onderstaande staat, beginnen we aan Fase 2 (component library):

- [ ] Volledige mappenstructuur (§1) staat, elke belangrijke map bevat minimaal een `.gitkeep` of een minimaal indexbestand zodat de structuur zelf zichtbaar en vastgelegd is.
- [ ] Bestaande prototype-bestanden (`website/`) overgezet van `.js`/`.jsx` naar `.ts`/`.tsx`; `tsconfig.json` met strikte modus geconfigureerd.
- [ ] `next.config.ts`, ESLint, en (aanbevolen) een import-boundary-lint-regel voor §2's afhankelijkheidsregels geconfigureerd.
- [ ] `middleware.ts` met het variant-resolutieskelet (mag een hardcoded/dummy variant teruggeven — de structuur van domein→subdomein→slug→default moet kloppen, niet per se al echte data raadplegen).
- [ ] `providers/AppProviders.tsx` samengesteld met alle providers uit §6 (mogen no-op/dummy-implementaties bevatten).
- [ ] `PublicLayout`, `KnowledgeLayout`, `AdminLayout` bestaan en renderen (leeg of met placeholder-content is voldoende).
- [ ] Eén voorbeeld-atom, -molecule en -organism gebouwd volgens de regels uit §2, als bewijs dat de lagenscheiding werkt.
- [ ] Alle routes uit §3 bestaan als klikbare, navigeerbare pagina's (lege/placeholder-inhoud toegestaan) — de volledige navigatiestructuur moet doorlopen kunnen worden.
- [ ] `types/content.ts` bevat het canonieke datamodel uit [DATA-MODEL.md](DATA-MODEL.md) als TypeScript-types.
- [ ] `lib/content/merge.ts` bestaat met de juiste functiesignatuur (`(article, variantId) => samengesteldeContent`) — implementatie mag nog een placeholder zijn, de plek en het contract liggen vast.
- [ ] Geen enkele overtreding van de afhankelijkheidsregels uit §2 (bij voorkeur afgedwongen via lint, anders handmatig geverifieerd).
- [ ] Dit document spreekt [ARCHITECTURE.md](ARCHITECTURE.md), [DATA-MODEL.md](DATA-MODEL.md) en de overige bestaande documentatie nergens tegen.

---

## Gevolg voor de fasering

Deze fase schuift vóór de bestaande Fase 1 (component library) uit [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md). [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) en [TODO.md](TODO.md) zijn hernummerd: Fase 1 = Platform Foundation (dit document), Fase 2 = Component library, Fase 3 = Pagina's met dummydata, Fase 4 = Payload CMS, Fase 5 = Contentstructuur, Fase 6 = AI-laag, Fase 7 = Bewust uitgesteld.
