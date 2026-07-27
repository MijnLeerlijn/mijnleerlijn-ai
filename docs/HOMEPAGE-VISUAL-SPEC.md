# HOMEPAGE-VISUAL-SPEC.md — Pixel-perfect visuele specificatie

> Redline-documentatie voor directe overdracht aan developers. Geen code — wel exacte waarden (px, hex, rgba, ms) zoals een designer ze in Figma's inspector zou aflezen. Bouwt voort op [HOMEPAGE-SPEC.md](HOMEPAGE-SPEC.md) (functioneel) en [UI-DESIGN.md](UI-DESIGN.md) (systeemtokens). Elke sectie hieronder is een uitwerking tot componentniveau van de secties uit `HOMEPAGE-SPEC.md`.

---

## 0. Basis — grid, breakpoints, tokens

**Referentie-viewports** (voor Figma-frames/dev-testing): 375px (mobiel), 768px (tablet), 1440px (desktop).

**Breakpoints**: < 640px mobiel · 640–1023px tablet · 1024–1439px desktop · ≥ 1440px breed.

**Grid**: 4 kolommen mobiel (gutter 16px) · 8 kolommen tablet (gutter 24px) · 12 kolommen desktop/breed (gutter 24px). Content max-breedte 1200px, gecentreerd.

**Pagina-marges**: 16px mobiel · 32px tablet · max(64px, (viewport − 1200px) / 2) desktop/breed.

**Basiseenheid**: 8px, afgeleid van de 4px-schaal: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96px.

**Kleuren (hex)**:
- Rood `#E10919` · Oranje `#EC6608` · Geel `#FEC905` · Groen `#53AC32` · Blauw `#1588C9` · Donkerblauw `#002641`
- Wit `#FFFFFF` · Grijs-50 `#F9FAFB` · Grijs-100 `#F1F3F5` · Grijs-200 `#E5E7EB` · Grijs-300 `#D1D5DB` · Grijs-400 `#9CA3AF` · Grijs-600 `#4B5563` · Grijs-900 `#111827`
- Sectie-achtergrond "lichtgrijsblauw" (Ontdek-sectie): `#EDF1F4`

**Typografie (Inter)**:
- Display: 40px / 48px regelhoogte / 700 — mobiel: 32px / 40px
- H1: 32px / 40px / 700
- H2: 24px / 32px / 600
- H3: 18px / 28px / 600
- Body-groot: 18px / 28px / 400
- Body: 16px / 24px / 400
- Body-klein: 14px / 20px / 400
- Label: 12px / 16px / 500, letterspacing +0,04em

**Radius**: 6px (badges/chips-rechthoekig) · 8px (knoppen/standaardvelden) · 9999px (pill-chips) · 12px (kaarten) · 16px (antwoordkaart/modals)

**Schaduw**:
- sm: `0 1px 2px rgba(17,24,39,0.06)`
- md: `0 4px 12px rgba(17,24,39,0.10)`
- lg: `0 12px 24px rgba(17,24,39,0.12)`

**Motion**: 120ms (hover/focus) · 200ms (state-wissel, fade-in) · 300ms (paginanavigatie-fade). Easing: ease-out bij binnenkomst, ease-in bij verdwijnen.

---

## 1. Header

| Eigenschap | Waarde |
|---|---|
| Hoogte | 64px default → 56px na 80px scroll (200ms ease-out transitie) |
| Achtergrond | Wit `#FFFFFF` |
| Onderrand | 1px `#E5E7EB`; vervangen door schaduw-sm zodra gescrolld |
| Horizontale padding | Gelijk aan paginamarge (16/32/64px) |
| Logo hoogte | 28px default → 24px gescrolld |
| Nav-item gap | 32px tussen items |
| Nav-tekst | Body (16px/24px/500), kleur Grijs-900, actief/huidige pagina: Blauw `#1588C9` |
| Zoekicoon (compact) | Lucide `search`, 20px, tikdoel 40×40px, kleur Grijs-600 |
| Z-index | Sticky, boven alle overige content |

**Hover** (nav-link): kleur → Blauw `#1588C9`, onderstreep verschijnt (2px, Blauw, 4px onder de tekst), 120ms.
**Focus** (toetsenbord): 2px Blauw ring, 2px offset, alleen zichtbaar bij toetsenbordnavigatie.

**Mobiel (< 640px)**: nav-links (Categorieën/Updates/Contact) vervallen uit de balk; een hamburgerpictogram (24px) verschijnt rechts naast het zoekicoon (gap 16px tussen beide). Tik opent een full-screen overlay-menu (achtergrond wit, links 48px hoog gestapeld, sluitkruis 24px rechtsboven).

---

## 2. Hero

**Container**: min-hoogte 640px desktop / 480px mobiel. Padding-top/bottom 96px desktop, 48px mobiel.

**Achtergrondcompositie** (desktop/tablet):
- Donkerblauw vlak `#002641`: linker 60% van de hero-breedte, volledige hoogte
- Groen vlak `#53AC32`: 45% breed, gepositioneerd vanaf 55% van links, 85% van de herohoogte, verticaal gecentreerd, 1 laag áchter het donkerblauwe vlak (creëert het ineengrijpende brandbook-patroon)
- L-icoon-silhouet (wit, 100% dekking): 240px breed, rechtsonder in het groene vlak

**Contentkolom**: max-breedte 560px, links uitgelijnd binnen de paginamarge.

| Element | Specificatie |
|---|---|
| Kop | Display (40/48/700), wit `#FFFFFF` |
| Marge kop → subregel | 16px |
| Subregel | Body-groot (18/28/400), wit 85% dekking `rgba(255,255,255,0.85)` |
| Marge subregel → zoekveld | 32px |

**Zoekveld** (het dominante element — groter dan een standaardveld):
- Breedte: 100% van de contentkolom (max 560px)
- Hoogte: 64px
- Radius: 12px
- Achtergrond: wit
- Rand default: 1px `rgba(255,255,255,0.3)`
- Rand focus: 2px Blauw `#1588C9` + glow `0 0 0 4px rgba(21,136,201,0.15)`
- Focus-ring extra (contrast op donkere achtergrond): witte 2px ring, 2px buiten de blauwe rand
- Interne padding: 20px links (tekst), 8px rechts (knopruimte)
- Placeholder: Body (16/24), Grijs-400
- Verzendknop in het veld: 48×48px, radius 8px, achtergrond Blauw, icoon `arrow-right` 20px wit, gecentreerd, 8px vanaf de rechterrand van het veld. Hover: achtergrond Donkerblauw, 120ms.

**Voorbeeldvraag-chips**: marge-top 16px vanaf het veld, gap 8px, wrap indien nodig.
- Hoogte 36px, horizontale padding 16px, radius 9999px (pill)
- Rand 1px `rgba(255,255,255,0.3)`, achtergrond transparant, tekst Body-klein (14/20) wit
- Hover: achtergrond `rgba(255,255,255,0.1)`, rand `rgba(255,255,255,0.5)`, 120ms
- Focus: witte 2px ring, 2px offset

**Ondergeschikte link** "Of ontdek een onderwerp": marge-top 24px, Body-klein (14/20), standaard al onderstreept (ter onderscheid van de chips), kleur `rgba(255,255,255,0.75)` → wit bij hover.

**Signatuur-tag**: marge-top 48px. Tekst "Kennis vanuit" (Body-klein, wit 70%) + pill "Inzicht" (rand 1px wit, radius 4px, padding 4px 8px, Body-klein wit). Direct eronder (marge-top 8px): gradientlijn 280px breed × 3px hoog, radius 2px, kleurverloop links→rechts Blauw→Groen→Geel→Oranje→Rood.

**Fotografie**: rechterkolom, ~40% van de hero-breedte, foto bleedt vanaf de rechterrand tot over het groene vlak, onderaan afgesneden aan de herorand (geen radius — bleedende rand).

**Mobiel (< 640px)**: gestapelde layout. Tekst + zoekveld eerst, volledige breedte binnen 16px marges (geen 560px-beperking). Foto verplaatst naar ónder de tekst als aparte band: hoogte 240px, `object-fit: cover`, edge-to-edge (geen marges), met een vlakke groene band van 8px bovenaan de foto als subtiele verwijzing naar het ineengrijpende patroon (het volledige geometrische patroon wordt niet herhaald op dit schermformaat — te complex).

---

## 3. "Aan het zoeken"-status

Verschijnt direct onder het zoekveld, marge-top 24px. Uitvoering: het zoekveld zelf "ademt" — rand-dekking pulseert 100% → 60% → 100%, cyclus 1,5s, ease-in-out, oneindig herhaald tot het antwoord arriveert. Geen spinner, geen los element.

---

## 4. Antwoordweergave (in-place "zoekresultaat")

Dit platform toont nooit een losse resultatenlijst — elke zoekactie levert één samenhangend antwoordblok op, in dezelfde hero-ruimte.

**Container**:
- Marge-top 24px vanaf het zoekveld
- Achtergrond wit, radius 16px, padding 32px (24px mobiel)
- Breedte: gelijk aan de contentkolom (560px desktop, volledige breedte-minus-marges mobiel)
- Schaduw-lg (zwaarder dan standaardkaarten — benadrukt "zwevend boven de donkere hero-achtergrond")
- Animatie bij verschijnen: opacity 0→100%, translateY 8px→0px, 200ms ease-out

| Onderdeel | Specificatie |
|---|---|
| Antwoordtekst | Body-groot (18/28), Grijs-900. Max-hoogte 400px zichtbaar; langere antwoorden krijgen interne scroll (geen paginascroll) |
| Marge antwoord → bronnenkop | 24px |
| Bronnenkop | Label-stijl, "BRONNEN", 12/16/500, letterspacing +0,04em, Grijs-600 |
| Bronnenkaart | Achtergrond Grijs-50, radius 8px, padding 12px, marge tussen kaarten 8px |
| — icoon | Lucide `file-text`, 20px, Blauw, links uitgelijnd |
| — titel | Body-klein/14/600, Blauw, underline bij hover |
| — sectie-context | Body-klein/12, Grijs-600 |
| — datum | Body-klein/12, Grijs-400 |
| — thumbnail (optioneel) | 48×48px, radius 6px, rechts uitgelijnd |
| Feedback-duimen | Marge-top 24px, 2 iconknoppen (`thumbs-up`/`thumbs-down`, 20px), tikdoel 36×36px, gap 8px, default Grijs-400, hover/actief Blauw (omhoog) / Rood (omlaag, gedempt — geen felle waarschuwingskleur) |

**Meerdere bronnen**: zelfde container, meerdere bronnenkaarten onder elkaar (nooit losse antwoordblokken naast elkaar). Bij een ambigue vraag: na de feedback-duimen, marge-top 16px, een extra regel Body-klein "Bedoelde je misschien ook…" gevolgd door 1–2 tekstlinks (Blauw, underline bij hover).

**"Geen betrouwbaar antwoord"-variant**:
- Zelfde containerafmetingen, maar: achtergrond Grijs-50 (niet wit — direct visueel anders), rand 1px dashed Grijs-200 in plaats van schaduw (oogt bewust minder "definitief")
- Icoon bovenaan: `info` (Lucide, 24px, Grijs-400) in cirkel 40px, achtergrond Grijs-100
- Tekst: Body (16/24), Grijs-600, marge-top 12px
- CTA-knop "Stel je vraag via het contactformulier": primaire knopstijl (zie [UI-DESIGN.md](UI-DESIGN.md) §7), marge-top 16px
- Gerelateerde-onderwerpen-chips (indien aanwezig): marge-top 16px, zelfde chipvorm als de voorbeeldvragen maar in Grijs-100/Grijs-900 in plaats van wit-op-donker

---

## 5. Sectie "Verder waar je gebleven was"

| Eigenschap | Waarde |
|---|---|
| Achtergrond | Wit |
| Padding-top/bottom | 64px desktop / 32px mobiel |
| Sectiekop | H3 (24/32/600), Grijs-900, marge-bottom 24px |
| Kaartenrij | Flex, gap 16px. Desktop: 4 kaarten, elk `calc(25% - 12px)`. Mobiel: horizontaal scrollend, kaartbreedte 240px, snap-scroll, laatste kaart deels zichtbaar als scroll-hint |

**Compacte kenniskaart**:
- Achtergrond wit, rand 1px Grijs-200 (géén schaduw — vlakke stijl), radius 12px, padding 16px
- Titel: Body/14/600, Grijs-900, max 2 regels met ellipsis
- Sectie-context: Body-klein/12, Grijs-600, marge-top 4px
- Datum: Body-klein/12, Grijs-400, rechts uitgelijnd onderaan de kaart
- Hover: randkleur → Blauw, 120ms, géén lift (compacte kaarten blijven vlak)

---

## 6. Sectie "Ontdek een onderwerp"

| Eigenschap | Waarde |
|---|---|
| Achtergrond | `#EDF1F4` |
| Padding-top/bottom | 96px desktop / 48px mobiel |
| Sectiekop | H2 (24/32/600) + horizontale lijn 1px Grijs-300 die na de tekst doorloopt tot de sectierand, met een gradientsegment van 60px × 3px direct ná de tekst, vóór de grijze lijn verdergaat |
| Kolommen | 2 (Onderwerpen / Populaire vragen), gap 48px desktop; gestapeld, gap 32px mobiel |

**Categorie-kaart** (kolom Onderwerpen, grid 2×3/4 desktop, 1 kolom mobiel, gap 16px):
- Achtergrond wit, radius 12px, padding 20px, schaduw-sm
- Icoon: 24px Lucide, in cirkel 40px, achtergrond = categorie-kleur op 8% dekking, icoon in volle categorie-kleur (kleur per categorie vast toegewezen, nooit willekeurig)
- Titel: Body/16/600, marge-top 12px
- Hover: schaduw-md, translateY −2px, 120ms ease-out

**Populaire-vraag-regel** (kolom Populaire vragen, lijst):
- Padding-verticaal 12px, onderrand 1px Grijs-100 (laatste item zonder rand)
- Tekst: Body (16/24), Grijs-900
- Chevron-icoon rechts: `chevron-right`, 16px, Grijs-400
- Hover: tekstkleur → Blauw, chevron schuift 4px naar rechts, 120ms

---

## 7. Sectie "Net bijgewerkt"

| Eigenschap | Waarde |
|---|---|
| Achtergrond | Wit |
| Padding-top/bottom | 96px / 64px desktop (minder onderpadding — lager in hiërarchie), 48px / 32px mobiel |
| Kaartenrij | 3 kolommen desktop, gap 24px; 1 kolom mobiel, gap 16px |

**Update-kaart**:
- Achtergrond wit, radius 12px, `overflow: hidden` (voor de onderrand-balk), schaduw-sm; hover: schaduw-md + translateY −2px
- Badge "Nieuw" (achtergrond Groen 8% dekking, tekst Groen) of "Bijgewerkt" (Blauw-variant): pill, padding 4px 10px, Label-stijl (12/500), positioned top-left binnen 16px padding
- Titel: Body-groot/18/600, marge-top 12px, horizontale padding 16px, max 2 regels ellipsis
- Datum: Body-klein/12, Grijs-400, marge-top 8px, padding-bottom 16px
- Onderrand: 4px hoog, volle breedte, gradient Blauw→Rood; direct erboven (laatste 40px van de kaart) tekst "Lees verder ▸▸", Body-klein/14/600, Blauw, padding 12px 16px; hover: tekst schuift 4px naar rechts

---

## 8. Footer

| Eigenschap | Waarde |
|---|---|
| Achtergrond | Donkerblauw `#002641` |
| Padding-top | 64px desktop / 48px mobiel |
| Padding-bottom | 32px (compacter dan top — copyright-regel volgt met eigen ruimte) |
| Kolommen | Logo (33%) · Sitemap 2 sub-kolommen (33%) · Social (33%) desktop; gestapeld, gap 32px, mobiel |
| Logo | Witte variant, hoogte 32px |
| Links | Body-klein/14, `rgba(255,255,255,0.8)`, regelhoogte 32px (tikdoel), hover: wit + underline |
| Social-icoon | Cirkel 36×36px, rand 1px `rgba(255,255,255,0.3)`, icoon 16px wit; hover: achtergrond wit 10%, rand wit 60% |
| Gradientlijn | Volle breedte, 3px hoog, marge-top 32px, marge-bottom 16px |
| Copyright-regel | Body-klein/12, `rgba(255,255,255,0.6)`; desktop: `justify-content: space-between` (copyright links, "Webdesign"-credit rechts); mobiel: gecentreerd, gestapeld |

---

## 9. Iconografie-inventaris (deze pagina)

| Icoon (Lucide) | Formaat | Gebruik |
|---|---|---|
| `search` | 20px | Header zoekicoon |
| `arrow-right` | 20px | Verzendknop in het zoekveld |
| `thumbs-up` / `thumbs-down` | 20px | Antwoord-feedback |
| `file-text` | 20px | Bronnenkaart |
| `info` | 24px | "Geen antwoord"-status |
| `chevron-right` | 16px | Populaire-vraag-regel |
| `menu` (hamburger) | 24px | Mobiele navigatie |
| `x` (sluiten) | 24px | Mobiel menu sluiten |
| Categorie-iconen | 24px | Vast per categorie, uit de Lucide-set, geen mix met andere iconenstijlen |
| `instagram` / `linkedin` / `facebook` | 16px | Footer social |

Strokewidth overal 1,5–2, conform [UI-DESIGN.md](UI-DESIGN.md) §35.

---

## 10. Fotografie-richtlijnen (deze pagina)

- Hero-foto: bleedt over het groene blok (desktop) of vormt een edge-to-edge band (mobiel) — nooit vrijstaand in een kader.
- Geen tekst-op-foto op deze pagina (tekst en foto delen op geen enkel breekpunt dezelfde ruimte), dus **geen overlay/scrim nodig**. Mocht dat later wijzigen: donkere overlay van 40% zwart voor voldoende contrast, niet eerder.
- Kleurbehandeling: geen filters/kleurcorrectie buiten standaard kleurprofiel — foto's blijven natuurlijk, geen brand-kleur-duotone-effecten.
- Alt-tekst verplicht, betekenisvol (niet decoratief-leeg), zie [DATA-MODEL.md](DATA-MODEL.md) `Media.altText`.

---

## 11. Hover states — overzicht

| Element | Effect | Duur |
|---|---|---|
| Nav-link (header) | Kleur → Blauw, onderstreep verschijnt | 120ms |
| Zoekveld-verzendknop | Achtergrond → Donkerblauw | 120ms |
| Voorbeeldvraag-chip | Achtergrond → 10% wit, rand → 50% wit | 120ms |
| Ondergeschikte link | Kleur → vol wit | 120ms |
| Categorie-kaart | Schaduw-sm → md, translateY −2px | 120ms |
| Compacte kenniskaart | Randkleur → Blauw (geen lift) | 120ms |
| Populaire-vraag-regel | Tekst → Blauw, chevron +4px | 120ms |
| Update-kaart | Schaduw-sm → md, translateY −2px | 120ms |
| Bronnenkaart-titel | Underline verschijnt | 120ms |
| Footer-link/social-icoon | Kleur/achtergrond intensiveert | 120ms |

## 12. Focus states — overzicht

- Universeel: 2px Blauw `#1588C9` ring, 2px offset, alleen zichtbaar bij toetsenbordnavigatie (niet bij muisklik).
- Uitzondering — elementen op de donkerblauwe hero-achtergrond (zoekveld, chips, ondergeschikte link): witte 2px ring i.p.v. blauw, voor voldoende contrast tegen de donkere achtergrond.
- Tab-volgorde hero: zoekicoon (header) → logo → nav-links → zoekveld → verzendknop → chips (volgorde van links naar rechts) → ondergeschikte link.

---

## 13. Mobiele versie — overzicht van afwijkingen

| Element | Desktop | Mobiel (< 640px) |
|---|---|---|
| Header-navigatie | Inline links | Hamburgermenu (full-screen overlay) |
| Zoekveld-toegang tijdens scroll | Compact icoon in sticky header | Identiek — géén los floating-actionbutton, consistent met "één zoekveld, nooit een kopie" |
| Hero-achtergrond | Ineengrijpende rechthoeken (donkerblauw/groen) | Effen donkerblauw blok; foto verplaatst naar een aparte band eronder met een 8px groene bovenband als verwijzing |
| Contentkolom-breedte hero | Max 560px | Volledige breedte minus 16px marges |
| Sectie "Ontdek": kolommen | 2 naast elkaar | Gestapeld, "Onderwerpen" eerst |
| Sectie "Verder waar je gebleven was" | 4 kaarten in een rij | Horizontaal scrollend, snap-scroll |
| Update-kaarten | 3 naast elkaar | 1 kolom |
| Footer-kolommen | 3 naast elkaar | Gestapeld, 32px gap |
| Sectie-padding (verticaal) | 96px (hero/Ontdek), 64px (overige) | 48px (hero/Ontdek), 32px (overige) |

Alle kleur-, typografie-, radius- en schaduwwaarden blijven identiek tussen breekpunten — alleen layout, afstand en navigatiepatroon veranderen, conform [UI-DESIGN.md](UI-DESIGN.md) §4 "Responsive gedrag".
