# CLAUDE.md

Context voor toekomstige Claude Code-sessies in deze repository.

## Wat dit project is

MijnLeerlijn AI Kennisplatform: één centraal, AI-gedreven kennisplatform (handleidingen + AI-assistent + contactformulier) dat meerdere white-label onderwijsvarianten bedient (MijnLeerlijn, MijnMonti, MijnD, een vrijeschool-variant, later meer) vanuit één codebase en één deployment. Zie [docs/PROJECT.md](docs/PROJECT.md) voor de volledige visie.

## Huidige status

**Er bestaat nog geen applicatiecode.** De repository bevat op dit moment:
- `Brand/` — brandbook (pdf) en logo's van MijnLeerlijn (leidend voor de huisstijl); `fonts/`, `icons/`, `images/`, `ui-examples/` zijn nog leeg
- `handleidingen/` — 25 bestaande handleiding-PDF's, de eerste vulling voor de centrale kennisbank
- `docs/` — de architectuur- en ontwerpdocumenten (zie hieronder)
- Verder alleen scaffold-mappen (`website/`, `scripts/`, `prompts/`) die nog leeg zijn

Zie [docs/TODO.md](docs/TODO.md) voor de actuele fase en openstaande beslissingen — lees dat bestand eerst als je wilt weten "wat is de volgende stap".

## Leesvolgorde voor nieuwe sessies

1. [docs/PROJECT.md](docs/PROJECT.md) — visie, scope, kernprincipes
2. [docs/DATA-MODEL.md](docs/DATA-MODEL.md) — **canoniek** datamodel (Article/Section/ContentBlock/VariantOverride/Variant/...). Wijzig het datamodel altijd hier eerst, andere documenten verwijzen ernaar.
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — systeemopbouw, hosting, variant-herkenning
4. [docs/CONTENT-MODEL.md](docs/CONTENT-MODEL.md), [docs/MULTI-VARIANT-STRATEGY.md](docs/MULTI-VARIANT-STRATEGY.md), [docs/CMS-AND-EDITORIAL-WORKFLOW.md](docs/CMS-AND-EDITORIAL-WORKFLOW.md), [docs/AI-KNOWLEDGE-STRATEGY.md](docs/AI-KNOWLEDGE-STRATEGY.md), [docs/SECURITY-AND-PRIVACY.md](docs/SECURITY-AND-PRIVACY.md), [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) — verdieping per onderwerp
5. [docs/TODO.md](docs/TODO.md) — status, volgende bouwtaken, openstaande beslissingen

## Belangrijkste architectuurkeuzes (samenvatting, zie docs/ voor detail)

- **Eén Next.js-app, één database, N varianten** — variant wordt per request herkend (domein/subdomein/slug), nooit gebouwd per variant.
- **Content is een boom**: Article → Section → ContentBlock, niet één groot tekstveld. Varianten schrijven uitsluitend in `VariantOverride`-records (polymorf, op article/section/block-niveau) — nooit in de centrale boom.
- **Eén gedeelde samenvoegfunctie** wordt gebruikt door paginaweergave, zoekindex én AI-index — dit is een hard vereiste, met verplichte pariteitstests.
- **De AI verzint niets**: RAG op blokniveau, harde variant-scoping op databaseniveau, verplichte bronvermelding, eerlijke doorverwijzing naar het contactformulier bij onvoldoende betrouwbare informatie. Onderwijskundige content vereist een aparte AI-goedkeuringsstap bovenop normaal publiceren.
- **CMS-voorkeur: Payload CMS**, onder voorbehoud van een geschiktheidstoets (nog niet uitgevoerd — zie docs/TODO.md fase 1).
- **Postgres + pgvector**, Vercel-voorkeur voor hosting, providers-onafhankelijke AI-laag (Anthropic/OpenAI via één abstractie).

## Conventies

- **Taal**: content, UI-teksten en documentatie zijn Nederlands. Codecommentaar minimaal houden (alleen bij niet-voor-de-hand-liggende why, niet what) zodra er code is.
- **Geen aannames over ontbrekende merkbestanden**: waar branding voor een variant nog ontbreekt (MijnMonti, MijnD, vrijeschool-variant), wordt dit altijd expliciet als placeholder gemarkeerd — nooit stilzwijgend verzonnen. Zie [docs/MULTI-VARIANT-STRATEGY.md](docs/MULTI-VARIANT-STRATEGY.md).
- **Geen juridische tekst verzinnen**: privacyverklaring/voorwaarden-teksten volgen apart via sCoolsuite B.V. — zie [docs/SECURITY-AND-PRIVACY.md](docs/SECURITY-AND-PRIVACY.md).
- **Documentwijzigingen**: als een architectuurbeslissing verandert, werk het canonieke document bij ([docs/DATA-MODEL.md](docs/DATA-MODEL.md) voor het model, het specifieke onderwerpdocument voor de rest) — niet alleen de plaats waar het toevallig opviel.
