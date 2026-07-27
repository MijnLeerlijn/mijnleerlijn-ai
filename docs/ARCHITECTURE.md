# ARCHITECTURE.md — Systeemarchitectuur

> Zie [DATA-MODEL.md](DATA-MODEL.md) voor het canonieke datamodel. Dit document beschrijft hoe het systeem daaromheen is opgebouwd.

## Overzicht & doelen

Eén Next.js-applicatie, één database, bedient meerdere merkvarianten. Geen aparte codebase of website per variant. Kernlogica (samenvoegen van content, AI/RAG, variant-scoping) is providers-onafhankelijk waar dat expliciet is gevraagd (hosting, AI-leverancier).

## Systeemdiagram (conceptueel)

```
                         ┌─────────────────────────────┐
  Bezoeker (leerkracht,  │        Next.js App           │
  IB'er, schoolleider)   │  (App Router, op Vercel)      │
        │                │                               │
        │  request       │  Edge Middleware              │
        └───────────────▶│  → variant-herkenning         │
                         │        │                       │
                         │        ▼                       │
                         │  Server Components / Route     │
                         │  Handlers                      │
                         │  ├─ Samenvoegfunctie (§4)       │
                         │  ├─ Zoeken                      │
                         │  ├─ AI-assistent (RAG)          │
                         │  └─ Contactformulier            │
                         └───────────┬───────────────────┘
                                     │
        ┌────────────────────────────┼──────────────────────────┐
        ▼                            ▼                           ▼
  Postgres (Neon/Supabase)     Object storage (bijlagen,   Transactional e-mail
  + pgvector                   media) — privé, tijdelijk    (helpdesk@mijnleerlijn.nl)
  ├─ Content (via Payload)
  ├─ Variants / Overrides
  ├─ Contactmeldingen
  └─ Audit log
        │
        ▼
  AI-providerlaag (Vercel AI SDK-abstractie) → Anthropic / OpenAI
```

## Variant-herkenningsmechanisme

Uitgevoerd in `middleware.ts` op de Vercel Edge, op elk request:

1. Lees de `Host`-header.
2. Zoek een match in de domein→variant-tabel: eerst `customDomain`, dan `subdomain` (`*.mijnleerlijn.nl`).
3. Geen match? Val terug op **pad-gebaseerde slug**: eerste padsegment tegen `Variant.slug` (bijv. `help.mijnleerlijn.nl/mijnmonti/...`) — expliciet bedoeld als **tijdelijke** oplossing zolang een variant nog geen eigen (sub)domein heeft.
4. Geen enkele match → default-variant (MijnLeerlijn).
5. De opgeloste variant wordt als requestcontext (bijv. header) doorgegeven aan Server Components en Route Handlers — **één plek** waar variant-resolutie gebeurt, niet verspreid over de applicatie.

**Caching**: de domein→variant-tabel is klein en wijzigt zelden. Cache deze read-through aan de edge (Vercel Edge Config of KV), ongeldig gemaakt zodra een variant wordt opgeslagen in de beheeromgeving — dit voorkomt een database-call per request.

**Domeinmigratie**: elke variant heeft een `domainStatus` (`slug_path` → `subdomain` → `custom_domain`). Bij migratie zijn redirects verplicht, zodat gedeelde links (bijv. een bookmark van een leerkracht) blijven werken. Zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md).

## Rendering-strategie

- **Publieke kennisbank-pagina's** (artikelen, homepage, zoeken): ISR, herberekend **op publicatiemoment** via on-demand revalidation — niet op een vaste timer. Content verandert zelden; dit houdt kosten en laadtijd laag.
- **AI-assistent**: streaming antwoorden via serverless/edge functions (Vercel AI SDK-streamingprimitieven).
- **Beheeromgeving**: volledig dynamisch (SSR), geen caching, achter authenticatie.

## Hosting & deployment

**Vercel** is de voorkeur, gemotiveerd in de vergelijking hieronder. Randvoorwaarde: geen Vercel-exclusieve API's in de kernlogica buiten Edge Middleware/Edge Config — beide hebben directe alternatieven elders, zodat overstappen een configuratiewijziging blijft, geen herbouw.

**Vercel vs. Netlify voor deze toepassing:**

| Aspect | Vercel | Netlify |
|---|---|---|
| Next.js SSR/ISR + on-demand revalidation | Eerstepartij-ondersteuning, meest volledig | Werkt via adapter, doorgaans iets achter op nieuwste App Router/ISR-functies |
| Image optimization | Native `next/image`-integratie | Via adapter, van oudsher meer randgevallen |
| Edge functions voor variant/domein-routering | Edge Middleware, laag-latency, integreert met Edge Config | Edge Functions bestaan, minder naadloze Next.js-middleware-koppeling |
| Serverless-kosten bij AI-streaming | Functieduur-facturering, vraagt bewuste timeout/regio-configuratie | Vergelijkbaar model |
| Preview-deployments voor contentreview | Automatisch per branch/PR, combineert goed met DB-branching (Neon) | Ook beschikbaar, DB-branch-koppeling minder ingebakken |

## Omgevingen & preview-workflow

- **Development / Preview / Productie** als gescheiden omgevingen, elk met eigen database (of DB-branch bij Neon).
- **Contentpreview** (niet hetzelfde als een code-preview-deployment): een beveiligde previewlink/-token die een niet-gepubliceerde versie rendert binnen de productie-app, zodat een redacteur een concept ziet zoals het er straks uitziet — werkt onafhankelijk van welke hostingpartij wordt gebruikt. Zie [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md).

## Eén gedeelde samenvoegfunctie

**Verplicht principe, niet optioneel.** Paginaweergave, zoekindex en AI-index gebruiken **letterlijk dezelfde functie** om — gegeven een `(article, variant)`-combinatie — de samengestelde content te bepalen volgens de regels in [CONTENT-MODEL.md](CONTENT-MODEL.md) en het model in [DATA-MODEL.md](DATA-MODEL.md):

```
samengesteldeContent = centraleContent
                      + gecontroleerdeTerminologie
                      + aanvullingen
                      + vervangingen
                      − uitsluitingen
                      + variantMedia
```

**Verplichte geautomatiseerde tests** borgen dat de AI-index nooit afwijkt van wat een gebruiker daadwerkelijk op de pagina ziet voor dezelfde variant — dit is de belangrijkste technische waarborg tegen zowel contentdrift als variant-lekkage (zie Risico's in het architectuurvoorstel en [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md)).

## Providerabstracties

| Laag | Abstractie | Reden |
|---|---|---|
| AI-model | Eigen interne service (`getChatModel`), gebouwd op de Vercel AI SDK | Wisselen tussen Anthropic/OpenAI wordt een configuratiewijziging, zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) |
| E-mail | Eigen verzendservice-interface | Wisselen tussen bijv. Resend/Postmark zonder de contactformulierlogica te raken |
| Objectopslag (bijlagen/media) | Eigen opslagservice-interface | Wisselen tussen bijv. Vercel Blob/S3/R2 zonder uploadlogica te raken |
| Vectoropslag | `pgvector` binnen dezelfde Postgres | Geen apart vector-databaseproduct nodig op deze schaal — zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) |

## Niet-doelen / bewust uitgesteld

Zie [PROJECT.md](PROJECT.md) §Fasering en [TODO.md](TODO.md) voor de volledige, actuele lijst. Architectuurniveau, expliciet **niet nu gebouwd**: klant-authenticatie voor afgeschermde content (het contentmodel staat dit al toe via een toekomstig `accessLevel`-veld, zonder herstructurering), meerstaps-goedkeuringsworkflows, geavanceerde analytics-infrastructuur.
