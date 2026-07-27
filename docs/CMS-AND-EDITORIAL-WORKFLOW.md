# CMS-AND-EDITORIAL-WORKFLOW.md — Beheersysteem en redactieproces

> Zie [DATA-MODEL.md](DATA-MODEL.md) voor entiteiten en [CONTENT-MODEL.md](CONTENT-MODEL.md) voor redactionele regels. Dit document gaat over het **systeem** waarin redacteuren werken.

## CMS-aanpak & motivatie

**Voorkeursrichting: Payload CMS** (self-hosted, draait native binnen Next.js, Postgres-adapter), **onder voorbehoud van de geschiktheidstoets hieronder** — dit is nog geen definitief besluit.

Motivatie:
- Het beheerteam is klein (de oprichter + enkele collega's) en niet-technisch — een kant-en-klare admin-UI met rollen, versies, concepten en planning bespaart aanzienlijke bouwtijd ten opzichte van een volledig zelfgebouwd systeem.
- Payload's **Blocks-veldtype** (een array-veld waarbinnen elk item een van meerdere geconfigureerde bloktypes kan zijn) sluit goed aan op het `ContentBlock`-model in [DATA-MODEL.md](DATA-MODEL.md) (tekst, stap, afbeelding, waarschuwing, tip, video, download, contact-doorverwijzing).
- **Belangrijk inzicht**: de samenvoegfunctie (centraal + variant-overrides → weergegeven content, zie [ARCHITECTURE.md](ARCHITECTURE.md)) en de variant-scoping voor de AI zijn **hoe dan ook eigen applicatiecode**, ongeacht CMS-keuze — Payload slaat alleen brondata op. Het risicovolste deel van dit project zit dus niet in de CMS-keuze zelf.

## Payload-geschiktheidstoets (verplichte eerste bouwtaak)

Vóór de definitieve keuze wordt onderstaande checklist als technische spike uitgevoerd. Dit is expliciet **fase 1** in [TODO.md](TODO.md), vóór verdere MVP-bouw.

| # | Vraag | Waarom relevant |
|---|---|---|
| 1 | Kan Payload het centrale-content-plus-variant-override-model (zie [DATA-MODEL.md](DATA-MODEL.md)) goed opslaan en bevragen — met name de polymorfe `VariantOverride` (`targetType` + `targetId`)? | Kernmodel van het hele platform |
| 2 | Kunnen rechten per centrale content én per variant-override apart worden afgedwongen (een variant-redacteur mag nooit in de centrale boom schrijven)? | Zie [CONTENT-MODEL.md](CONTENT-MODEL.md) §Wie mag wat schrijven — moet schema-niveau afgedwongen zijn, niet alleen UI-conventie |
| 3 | Kunnen previews per variant worden gegenereerd (een concept renderen zoals variant X het gepubliceerd zou tonen)? | Redacteuren moeten hun werk kunnen controleren vóór publicatie |
| 4 | Werken versiegeschiedenis en geplande publicatie zoals nodig (zie §Versiegeschiedenis hieronder)? | Kernvereiste vanuit de oprichter |
| 5 | Draait Payload probleemloos samen met Next.js op dezelfde Postgres-database, inclusief `pgvector`-gebruik ernaast? | Voorkomt een tweede database/operationele last |
| 6 | Blijft een latere overstap naar een andere oplossing praktisch mogelijk (geen onomkeerbare lock-in)? | Geen enkele leverancierskeuze mag definitief onomkeerbaar zijn |

**Uitkomst**: bij een positieve toets wordt Payload de definitieve CMS-keuze voor de MVP. Bij een negatieve uitkomst op een of meer punten wordt het onderstaande alternatief gevolgd — de keuze wordt vastgelegd in [TODO.md](TODO.md) zodra de toets is uitgevoerd.

## Fallback-plan bij ongeschiktheid

Een **zelfgebouwd, database-gebaseerd beheersysteem** op dezelfde Postgres-structuur:
- Schrijfrechten afgedwongen op schemaniveau (niet alleen UI) — variant-redacteuren hebben letterlijk geen schrijfpad naar de centrale boom.
- Eigen, minimalistische beheer-UI, ontworpen specifiek voor het override-model (geen generieke CMS-abstracties die "gebogen" moeten worden).
- Eigen implementatie van versie-/audit-/planninglogica volgens de regels hieronder.
- Kost meer bouwtijd dan Payload, maar behoudt volledige controle over het meest kenmerkende deel van dit platform.

## Rollen & rechten

| Rol | Rechten |
|---|---|
| `editor` (redacteur) | Concepten aanmaken/bewerken, indienen voor review, eigen variant-overrides beheren |
| `admin` (beheerder) | Alles van `editor`, plus: goedkeuren/publiceren, variant-configuratie, domeinbeheer, rollen toekennen, `aiApprovalStatus` voor pedagogische content zetten, audit-log inzien, verwijderverzoeken afhandelen |

Rolcontrole gebeurt via één gedeelde autorisatiefunctie, aangeroepen vanuit elke beheer-route/actie — niet los per pagina geïmplementeerd.

## Concept → review → publicatie → planning

```
concept ──indienen──▶ in_review ──goedkeuren──▶ gepland / gepubliceerd
   ▲                       │
   └──── wijzigingen aangevraagd ──┘
```

1. **Concept**: redacteur schrijft/bewerkt; elke opslag creëert een `ArticleVersion`-rij, maar raakt `currentVersionId` (het live-gepubliceerde) niet aan.
2. **In review**: redacteur dient in; **één andere persoon** (rol `editor` of `admin`) keurt goed of vraagt wijzigingen — gezien de kleine teamgrootte bewust een lichte, enkele goedkeuringsstap, niet een meerstaps-workflow (die is expliciet uitgesteld, zie [PROJECT.md](PROJECT.md)).
3. **Gepland of direct gepubliceerd**: bij goedkeuring kiest de redacteur "nu publiceren" of "inplannen op [datum/tijd]". Een geplande taak (bijv. Vercel Cron die een route aanroept) verwerkt geplande publicaties en triggert: bijwerken van `currentVersionId`, on-demand ISR-revalidatie, her-indexering voor de AI (zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md)), en een audit-log-vermelding.
4. Voor **pedagogische content** (`knowledgeType = pedagogisch`) is publiceren op de website **niet hetzelfde** als beschikbaar zijn voor de AI — zie [CONTENT-MODEL.md](CONTENT-MODEL.md) §Twee soorten kennis: een aparte, bewuste `aiApprovalStatus = goedgekeurd`-stap is vereist.

## Versiegeschiedenis & terugzetten

- Elke opslag creëert een onveranderlijke `ArticleVersion` (volledige boom-snapshot, zie [DATA-MODEL.md](DATA-MODEL.md)).
- De beheeromgeving biedt een diff-weergave tussen versies en een "deze versie terugzetten"-actie.
- Terugzetten creëert **altijd een nieuwe versie** op basis van de oudere snapshot — nooit een destructieve overschrijving, zodat de geschiedenis eerlijk en lineair blijft.

## Audit-log

Eén gedeelde, generieke `AuditLog`-tabel (zie [DATA-MODEL.md](DATA-MODEL.md)), gevuld via een gedeelde service-functie die vanuit **elk** wijzigingspad wordt aangeroepen — niet iets dat een individuele route "moet onthouden" te doen. Dekt: artikel-wijzigingen, override-wijzigingen, variant-aanmaak/-wijziging, rolwijzigingen, publicatie-/terugzet-acties. Antwoord op "wie heeft wanneer wat gewijzigd" is hiermee altijd reconstrueerbaar.

## Preview-mechanisme (per variant)

Een beveiligde previewlink/-token (bijv. `?previewVersion=<versionId>&variant=<variantId>`) die, ongeacht cache, de opgegeven conceptversie rendert **zoals een bezoeker van die specifieke variant** hem zou zien — inclusief de op dat moment ingevoerde (nog niet gepubliceerde) variant-overrides. Dit is nodig omdat contentreview iets anders is dan code-preview: een redacteur moet het resultaat van de samenvoegfunctie (zie [ARCHITECTURE.md](ARCHITECTURE.md)) kunnen controleren vóór publicatie, per variant waarin het artikel zichtbaar is.
