# DATA-MODEL.md — Canoniek datamodel

> Dit document is de **canonieke bron** voor het datamodel. Andere documenten ([CONTENT-MODEL.md](CONTENT-MODEL.md), [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md), [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md), [ARCHITECTURE.md](ARCHITECTURE.md)) verwijzen hiernaar en herdefiniëren het model niet. Wijzig het model op één plek: hier.
>
> Dit is een conceptueel/logisch model (velden en relaties), geen letterlijk databaseschema of ORM-definitie — dat volgt pas bij implementatie.

## Overzicht entiteiten

```
Variant ──< VariantOverride >── Article ──< Section ──< ContentBlock ──< Media
                                    │            │             │
                                    └── ArticleVersion (snapshot van de hele boom)
Variant ──< ContactSubmission ──< Attachment
*  ──< AuditLog
```

## Article (handleiding/artikel)

De centrale, enige-bron-van-waarheid tekst. Nooit per variant gekopieerd.

| Veld | Type | Toelichting |
|---|---|---|
| `id` | id | |
| `slug` | string | Uniek, stabiel pad-onderdeel |
| `title` | string | |
| `summary` | string | Korte samenvatting voor lijstweergaven (categorie-overzicht, updates) en SEO. Toegevoegd in Fase 4 (zie CMS-AND-EDITORIAL-WORKFLOW.md) |
| `category` | reference | Voor navigatie/filtering |
| `tags` | string[] | |
| `knowledgeType` | enum: `product` \| `pedagogisch` | Zie [CONTENT-MODEL.md](CONTENT-MODEL.md) §Twee soorten kennis |
| `status` | enum: `concept` \| `in_review` \| `gepland` \| `gepubliceerd` \| `gearchiveerd` | Redactionele status |
| `aiApprovalStatus` | enum: `n.v.t.` \| `in_afwachting` \| `goedgekeurd` | Verplicht `goedgekeurd` voordat `knowledgeType = pedagogisch`-content in de AI-index mag; voor `product` standaard `n.v.t.` (automatisch bruikbaar zodra gepubliceerd) |
| `currentVersionId` | reference → ArticleVersion | Actief gepubliceerde versie |
| `lastContentUpdate` | datetime | Datum van laatste inhoudelijke wijziging — verplicht getoond bij AI-bronvermelding |
| `embeddingStatus` | enum: `pending` \| `indexed` \| `stale` | Voor de AI-indexeerpijplijn, zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) |
| `createdAt`, `updatedAt` | datetime | |

## Section (sectie binnen een artikel)

| Veld | Type | Toelichting |
|---|---|---|
| `id` | id | |
| `articleId` | reference → Article | |
| `order` | integer | Volgorde binnen het artikel |
| `title` | string | |

## ContentBlock (stap of contentblok binnen een sectie)

Het kleinste redactionele en AI-indexeerbare eenheid.

| Veld | Type | Toelichting |
|---|---|---|
| `id` | id | |
| `sectionId` | reference → Section | |
| `order` | integer | Volgorde binnen de sectie |
| `type` | enum | `tekst` \| `genummerde_stap` \| `afbeelding` \| `waarschuwing` \| `tip` \| `video` \| `download` \| `contact_doorverwijzing` |
| `content` | per type | Zie hieronder |

**Content per bloktype:**
- `tekst` — vrije tekst (rich text)
- `genummerde_stap` — stapnummer + tekst
- `afbeelding` — referentie naar `Media` + bijschrift
- `waarschuwing` — tekst, visueel gemarkeerd als waarschuwing
- `tip` — tekst, visueel gemarkeerd als tip
- `video` — video-URL/embed + bijschrift
- `download` — referentie naar `Media` (bestand) + labeltekst
- `contact_doorverwijzing` — tekst + link naar het contactformulier (optioneel voorgevuld)

## Media

| Veld | Type | Toelichting |
|---|---|---|
| `id` | id | |
| `url` | string | |
| `altText` | string | Verplicht voor toegankelijkheid |
| `type` | enum: `afbeelding` \| `video` \| `download` | |
| `articleId` | reference (optioneel) | Als centraal aan een blok gekoppeld |

Variant-specifieke media loopt **niet** via een los veld op `Media`, maar via een `VariantOverride` met `action = ander_medium` — zo blijft er één plek waar "wat wijkt af per variant" wordt vastgelegd (zie hieronder).

## ArticleVersion

Onveranderlijke snapshot van de **volledige boom** (artikel + secties + blokken) op het moment van publiceren of concept-opslaan.

| Veld | Type | Toelichting |
|---|---|---|
| `id` | id | |
| `articleId` | reference → Article | |
| `treeSnapshot` | JSON | Volledige boom op dat moment |
| `editedBy` | reference → gebruiker | |
| `editedAt` | datetime | |
| `changeNote` | string (optioneel) | |
| `publishedAt` | datetime (nullable) | `null` = concept-versie, niet gepubliceerd |

Terugzetten ("rollback") maakt altijd een **nieuwe** versie op basis van een oudere snapshot — nooit een destructieve overschrijving. Zo blijft de geschiedenis lineair en betrouwbaar.

## VariantOverride

**Eén polymorf mechanisme** voor alle variant-afwijkingen, op elk niveau van de boom. Geen aparte tabel per niveau (dus geen `SectionVariantOverride`/`BlockVariantOverride` naast elkaar).

| Veld | Type | Toelichting |
|---|---|---|
| `id` | id | |
| `variantId` | reference → Variant | |
| `targetType` | enum: `article` \| `section` \| `block` | Op welk niveau deze override werkt |
| `targetId` | id | ID van het centrale element waarop dit inhaakt |
| `action` | enum | Zie tabel hieronder |
| `payload` | JSON | Inhoud afhankelijk van `action` (vervangende/aanvullende/ingevoegde blokinhoud, of media-referentie bij `ander_medium`) |
| `termOverridesApplied` | boolean | Standaard `true` — terminologie-substitutie is een orthogonale laag, geen aparte `action` |
| `status` | enum: `concept` \| `gepubliceerd` | Eigen mini-workflow, zelfde patroon als `Article.status` |
| `createdAt`, `updatedAt`, `editedBy` | | |

**Actietypes** (`action`), zie ook [CONTENT-MODEL.md](CONTENT-MODEL.md) voor redactionele voorbeelden:

| Action | Effect |
|---|---|
| `onveranderd` | Centraal element ongewijzigd zichtbaar (impliciet ook het gedrag bij *geen* override-record) |
| `aanvullen` | Override-inhoud verschijnt direct ná het centrale element, visueel gemarkeerd als aanvulling — centrale tekst blijft ongewijzigd |
| `vervangen` | Inhoud van het element wordt vervangen door de override-payload; positie in de boom blijft gelijk |
| `verbergen` | Element (en bij `targetType = article`/`section` ook alles eronder) valt volledig weg — uit pagina, zoekindex én AI-index |
| `ander_medium` | Alleen de media-referentie van dit blok wordt vervangen |
| `invoegen_voor` | Een volledig variant-eigen blok wordt vóór het centrale element geplaatst, zonder dat element aan te raken |
| `invoegen_na` | Zelfde, maar ná het centrale element |

**Regel**: per `(targetType, targetId, variantId)`-combinatie bestaat maximaal één `VariantOverride`-record. Er is dus nooit samenloop van twee structurele acties op hetzelfde element — wel altijd te combineren met de terminologielaag (`termOverridesApplied`).

De volledige prioriteits-/samenvoegregels (in welke volgorde dit wordt toegepast, en hoe `verbergen` cascadeert) staan in [CONTENT-MODEL.md](CONTENT-MODEL.md) §Samenvoegalgoritme en worden geïmplementeerd als één gedeelde functie — zie [ARCHITECTURE.md](ARCHITECTURE.md) §Eén gedeelde samenvoegfunctie.

## Terminologie-woordenboek

Onderdeel van `Variant` (zie hieronder), geen aparte entiteit: een lijst `{ centralTerm, variantTerm }`-paren. Wordt als vervangingslaag toegepast op alle getoonde centrale tekst binnen die variant, tenzij een specifieke `VariantOverride.termOverridesApplied = false` dit voor dat element uitschakelt.

## Variant

| Veld | Type | Toelichting |
|---|---|---|
| `id` | id | |
| `slug` | string | Gebruikt in de pad-gebaseerde fallback-route |
| `name` | string | Productnaam, bijv. "MijnMonti" |
| `status` | enum: `concept` \| `actief` \| `gearchiveerd` | |
| `domain` | object | `{ type: custom_domain \| subdomain \| slug_path, value, domainStatus }` |
| `branding` | object | `{ logoUrl, accentColor, productName, tagline, isPlaceholder }` — `isPlaceholder = true` zolang definitieve merkbestanden ontbreken, zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md) |
| `educationType` | string | Bijv. "montessori", "dalton", "vrijeschool", "algemeen" |
| `terminologyDictionary` | array | `[{ centralTerm, variantTerm }]` |
| `contactEmail` | string (optioneel) | Override van het standaard helpdesk-adres |
| `createdAt`, `createdBy` | | |

## ContactSubmission (contactmelding)

Zie [SECURITY-AND-PRIVACY.md](SECURITY-AND-PRIVACY.md) voor bewaartermijnen en verwerking.

| Veld | Type | Toelichting |
|---|---|---|
| `id` | id | |
| `teacherName` | string | Verplicht |
| `schoolName` | string | Verplicht |
| `email` | string | Verplicht |
| `requestType` | enum/reference | "Soort vraag" |
| `subject` | string | |
| `problemDescription` | string | Uitleg van het probleem |
| `expected` | string | Wat de gebruiker verwacht |
| `actual` | string | Wat de gebruiker daadwerkelijk ziet/ervaart |
| `pageUrl` | string | URL van de softwarepagina waar het probleem optreedt |
| `variantId` | reference → Variant | Automatisch meegestuurd |
| `helpCenterUrl` | string | Automatisch meegestuurd |
| `submittedAt` | datetime | |
| `deviceInfo` | string | Alleen grove categorie (bijv. "Chrome op desktop"), nooit fingerprinting |
| `status` | enum: `nieuw` \| `in_behandeling` \| `afgehandeld` | Stuurt de bewaartermijn (zie SECURITY-AND-PRIVACY.md) |

## Attachment (bijlage)

| Veld | Type | Toelichting |
|---|---|---|
| `id` | id | |
| `contactSubmissionId` | reference → ContactSubmission | |
| `storageKey` | string | Verwijzing naar privé object-opslag, nooit een publieke URL |
| `filename`, `mimeType`, `sizeBytes` | | |
| `uploadedAt` | datetime | |

## AuditLog

Eén generieke tabel, geschreven door een gedeelde service-functie vanuit elk wijzigingspad (niet los per route/actie geïmplementeerd).

| Veld | Type | Toelichting |
|---|---|---|
| `id` | id | |
| `entityType` | string | Bijv. `Article`, `VariantOverride`, `Variant`, `User` |
| `entityId` | id | |
| `action` | string | Bijv. `created`, `published`, `rolled_back`, `role_changed` |
| `actorId` | reference → gebruiker | |
| `diffSummary` | JSON/text | |
| `timestamp` | datetime | |

## Kennistype & AI-goedkeuring — samenvatting

Zie [CONTENT-MODEL.md](CONTENT-MODEL.md) en [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) voor de volledige redactionele en AI-technische uitwerking. Kort:

- `Article.knowledgeType = product` → automatisch bruikbaar voor de AI zodra gepubliceerd.
- `Article.knowledgeType = pedagogisch` → pas bruikbaar voor de AI nadat `aiApprovalStatus = goedgekeurd` **expliciet** is gezet — een aparte stap bovenop normaal publiceren.

## Mapping naar Payload-collecties (indicatief)

Bij gebruik van Payload CMS (voorkeursrichting, zie [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md)) is de verwachte, niet-bindende mapping:

| Entiteit hierboven | Payload-collectie |
|---|---|
| `Article` (incl. `Section`/`ContentBlock` als genest **Blocks-veld**) | Collectie `articles`, met Payload's `versions`/`drafts`-functionaliteit aan |
| `VariantOverride` | Eigen collectie `variant-overrides`, met relationele velden naar `variantId` en een polymorfe verwijzing (`targetType` + `targetId`) |
| `Media` | Collectie `media` (Payload's ingebouwde upload-collectie) |
| `Variant` | Collectie `variants` |
| `ContactSubmission` / `Attachment` | Eigen collecties, of buiten Payload om rechtstreeks in Postgres — te bepalen bij implementatie |
| `AuditLog` | Payload's ingebouwde audit-achtige logging indien toereikend, anders eigen tabel |

`Section` en `ContentBlock` worden in Payload naar verwachting **niet** als aparte collecties gemodelleerd, maar als een genest `blocks`-veld binnen `articles` (Payload's Blocks-veldtype is hier specifiek voor bedoeld). Dit wordt bevestigd of bijgesteld tijdens de Payload-geschiktheidstoets (zie [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md)).

De **samenvoegfunctie** (centraal + overrides → weergegeven content) is in alle gevallen eigen applicatiecode buiten Payload om — Payload slaat alleen brondata op, het samenvoegen gebeurt in de queryless applicatielaag die door pagina, zoekindex en AI-index gedeeld wordt.
