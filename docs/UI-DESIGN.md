# UI-DESIGN.md — Visuele interface

> Uitsluitend tekst. Geen code, geen HTML/CSS/React, geen afbeeldingen. Gebaseerd op het brandbook (`Brand/mijn-leerlijn-brandbook .pdf`), [UX-DESIGN.md](UX-DESIGN.md), [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) en [PROJECT.md](PROJECT.md).
>
> **Herkomst van waarden**: merkkleuren, logo en gradient komen letterlijk uit het brandbook. Concrete tokens die het brandbook niet bevat (afstandsschaal, randradius, schaduwen, motion-timing, neutrale grijstinten, semantische kleurtoewijzing) zijn **aanvullende ontwerpkeuzes**, consistent afgeleid uit de brandbook-toon ("rustig, professioneel, helder") en [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Waar dat extra relevant is, wordt dit expliciet benoemd.
>
> Elk onderdeel volgt hetzelfde sjabloon: doel, uiterlijk, gedrag, afmetingen, varianten, toegankelijkheid, wanneer wel, wanneer niet.

## Designtokens (fundament voor alle onderdelen hieronder)

**Kleuren — merk (letterlijk brandbook)**: Rood `#E10919` · Oranje `#EC6608` · Geel `#FEC905` · Groen `#53AC32` · Blauw `#1588C9` · Donkerblauw `#002641`.

**Semantische toewijzing (aanvullend, gebruikt de brandbook-kleuren functioneel in plaats van nieuwe kleuren te introduceren)**: Primaire actie/links = Blauw `#1588C9`. Donkere vlakken/koppen/footer = Donkerblauw `#002641`. Succes = Groen `#53AC32`. Tip = Geel `#FEC905`. Waarschuwing = Oranje `#EC6608`. Foutmelding/kritiek = Rood `#E10919`. Info-accent = Blauw `#1588C9`.

**Neutrale schaal (aanvullend, niet in brandbook)**: Wit `#FFFFFF` · Grijs-50 `#F9FAFB` (achtergrond) · Grijs-100 `#F1F3F5` · Grijs-200 `#E5E7EB` (randen) · Grijs-400 `#9CA3AF` (placeholder-tekst) · Grijs-600 `#4B5563` (secundaire tekst) · Grijs-900 `#111827` (primaire tekst).

**Typografie**: Inter. Basis 16px/1,5 regelhoogte. Schaal: Display 40/48px (700) · H1 32/40px (700) · H2 24/32px (600) · H3 18/28px (600) · Body-groot 18/28px (400) · Body 16/24px (400) · Body-klein 14/20px (400) · Label/caption 12/16px (500, letterspacing +0,04em, vaak hoofdletters — geïnspireerd op de gelabelde meta-tekst onderaan elke brandbook-pagina).

**Afstandsschaal (4px-basis)**: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96px (xs/sm/md/lg/xl/2xl/3xl/4xl).

**Grid**: 12 kolommen. Max content-breedte 1200px (marketing/leescontent), 1440px (databrede beheerschermen zoals tabellen). Gutter 24px (16px mobiel). Marges: 16px mobiel, 32px tablet, 64px desktop.

**Breakpoints**: Mobiel < 640px · Tablet 640–1023px · Desktop 1024–1439px · Breed ≥ 1440px.

**Randradius**: 6px (badges/chips) · 8px (knoppen/velden) · 12px (kaarten) · 16px (modals/dialogen).

**Schaduw**: sm (subtiel, kaarthover) · md (dropdowns, actieve kaarten) · lg (modals, slide-in panelen) — altijd zacht en laag-contrast, passend bij "rustig, professioneel".

**Motion**: 120ms (hover/focus-micro-interacties) · 200ms (dropdown/accordion/tabwissel) · 300ms (modal/paneel-transities, pagina-elementen). Easing: ease-out bij binnenkomen, ease-in bij verdwijnen. Nooit bounce/speelse easing (zie principes).

**Iconen**: Lucide, strokewidth 1,5–2. Maten 16px (inline/labels) · 20px (standaard UI) · 24px (koppen/primaire acties) · 32px (lege-staat-illustraties).

---

## 1. Designprincipes

**Doel**: één consistente visuele taal die "rustig, professioneel, helder" voelt (zie [PROJECT.md](PROJECT.md) §Kernprincipes), terwijl het kleurrijke merk herkenbaar blijft.

**Uiterlijk**: overwegend wit/grijs-50 oppervlakken, veel witruimte, kleur als accent (knoppen, iconen, badges, de gradientbalk) — nooit als grote kleurvlakvulling in werkschermen.

**Gedrag**: voorspelbaar en stil — animaties bevestigen een actie, ze trekken nooit aandacht zonder aanleiding.

**Afmetingen**: n.v.t. (principeniveau) — komt terug in de tokens hierboven.

**Varianten**: n.v.t. — principes gelden identiek voor alle varianten (MijnLeerlijn, MijnMonti, …), alleen accentkleur/logo wisselen (zie [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) §Variant-theming-mechanisme).

**Toegankelijkheid**: WCAG 2.1 AA als ondergrens, overal in dit document.

**Wanneer wel**: bij elke ontwerpbeslissing als toetssteen — "voegt dit rust of ruis toe?".

**Wanneer niet**: n.v.t.

---

## 2. Grid

**Doel**: consistente uitlijning en voorspelbare layoutritmiek over alle schermen.

**Uiterlijk**: onzichtbaar raster, 12 kolommen, zichtbaar alleen via de uitlijning van content.

**Gedrag**: content-kolombreedte voor leesteksten (handleidingen) blijft smaller dan de volledige gridbreedte voor optimale leesbaarheid (~680px), ongeacht schermbreedte.

**Afmetingen**: max-breedte 1200px (publiek/marketing-achtige schermen), 1440px (databrede beheerschermen: tabellen, media-grid). Gutter 24px (16px mobiel), marges 16/32/64px per breakpoint.

**Varianten**: content-grid (12 kolommen, leescontent), admin-grid (12 kolommen, bredere max-breedte, meer kolommen tegelijk zichtbaar zoals in scherm 11 "Artikelen beheren").

**Toegankelijkheid**: reflow tot één kolom op smalle schermen, geen horizontaal scrollen behalve bewust bij brede tabellen (zie §22).

**Wanneer wel**: elk scherm, zonder uitzondering.

**Wanneer niet**: n.v.t. — het grid is altijd de basis, ook als een scherm er "vrij" uitziet.

---

## 3. Afstanden

**Doel**: consistente, voorspelbare witruimte tussen elementen, zodat de interface nooit willekeurig aanvoelt.

**Uiterlijk**: ruimte tussen gerelateerde elementen (bijv. label + veld) klein (4–8px), tussen ongerelateerde elementen/secties groot (32–64px) — hiërarchie via afstand, niet alleen via lijnen/kaders.

**Gedrag**: afstand schaalt mee met breakpoint (bijv. sectie-afstand 96px desktop → 48px mobiel), nooit willekeurig anders.

**Afmetingen**: zie afstandsschaal in Designtokens — geen tussenwaarden buiten deze schaal gebruiken.

**Varianten**: "compact" (14/16px componentpadding — CMS-tabellen, dashboards, veel data tegelijk) vs. "comfortabel" (16/24px componentpadding — publieke schermen, minder dichtheid, prioriteit op leesbaarheid).

**Toegankelijkheid**: voldoende tikdoelgrootte (zie §7 Knoppen) blijft gegarandeerd ook bij "compact"-afstand.

**Wanneer wel**: overal — de afstandsschaal is nooit optioneel.

**Wanneer niet**: nooit negatieve/willekeurige marges gebruiken om iets "net te laten passen" — dat is een signaal dat de layout zelf moet worden aangepast.

---

## 4. Responsive gedrag

**Doel**: dezelfde functionaliteit en informatie op elk schermformaat, met per breakpoint passende dichtheid (zie ook elk scherm in [UX-DESIGN.md](UX-DESIGN.md) §Mobiele/Desktop versie).

**Uiterlijk**: content herschikt (kolommen → gestapeld), navigatie verdicht (header-links → hamburgermenu, tabs → dropdown), maar toont nooit minder informatie — alleen anders geordend.

**Gedrag**: mobile-first opgebouwd; desktop voegt kolommen/ruimte toe, verbergt nooit functionaliteit die mobiel wel bestaat (en andersom).

**Afmetingen**: breakpoints zoals in Designtokens (640/1024/1440px).

**Varianten**: publieke schermen zijn volledig mobiel-geoptimaliseerd (primaire doelgroep gebruikt soms telefoon/tablet); de beheeromgeving is desktop-eerst met een werkende, geen "verminkte", mobiele fallback (zie [UX-DESIGN.md](UX-DESIGN.md) scherm 11 §Mobiele versie).

**Toegankelijkheid**: zoom tot 200% zonder verlies van functionaliteit of horizontaal scrollen (behalve bewuste brede tabellen).

**Wanneer wel**: elk scherm ontwerpen vanuit de kleinste breedte omhoog.

**Wanneer niet**: nooit een los "mobiele site" met andere navigatiestructuur dan desktop — het is dezelfde interface, anders geschikt.

---

## 5. Typografie

**Doel**: uitstekende leesbaarheid en een rustige, professionele toon (zie [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) §Typografie — Inter, aanvullende keuze, geen brandbook-regel).

**Uiterlijk**: één lettertypefamilie (Inter) voor alles — geen decoratief tweede lettertype. Het brandbook-woordmerk zelf (het vette "MIJNLEERLIJN"-logo) is een vaste beeldasset, geen los te gebruiken interface-font.

**Gedrag**: koppen altijd 600–700 gewicht, body altijd 400, nadruk via 600 (nooit cursief voor nadruk — cursief oogt minder rustig/professioneel op scherm).

**Afmetingen**: zie schaal in Designtokens. Regellengte voor leesteksten max. ~75 tekens (~680px bij 18px body-groot).

**Varianten**: Display (marketing-hero, homepage-titel) · H1–H3 (paginatitels/sectiekoppen) · Body-groot (artikel-introducties, chat-antwoorden) · Body (standaardtekst, formulieren) · Body-klein (metadata, tijdstempels) · Label (badges, tabelkoppen, eyebrow-tekst).

**Toegankelijkheid**: minimale bodytekst 16px (nooit kleiner voor leesbare content); regelhoogte 1,5 voor body; voldoende contrast (zie §6).

**Wanneer wel**: Display alleen op de homepage-hero; Label-stijl (hoofdletters+letterspacing) alleen voor korte metatekst (max. 2–3 woorden), nooit voor lopende tekst.

**Wanneer niet**: geen tekst volledig in hoofdletters buiten Label-gebruik (leesbaarheid); geen decoratieve/script-lettertypen.

---

## 6. Kleuren

**Doel**: herkenbaar merk, functioneel en toegankelijk kleurgebruik, geen "regenboog-ruis" in de werkinterface.

**Uiterlijk**: overwegend wit/grijs-50/grijs-100 oppervlakken met grijs-900 tekst; brandkleuren verschijnen als accenten (knop-achtergrond, iconen, badges, links, gradientbalk) — zie semantische toewijzing in Designtokens.

**Gedrag**: elke brandkleur heeft precies één betekenis in de UI (blauw = actie/link, groen = succes, geel = tip, oranje = waarschuwing, rood = fout) — nooit dezelfde kleur voor twee verschillende betekenissen door elkaar gebruiken.

**Afmetingen**: n.v.t. — zie contrastregels onder Toegankelijkheid.

**Varianten**: per onderwijsvariant wisselt alleen de **accentkleur** (bijv. de kleur van primaire knoppen/links) binnen ditzelfde systeem — zie [MULTI-VARIANT-STRATEGY.md](MULTI-VARIANT-STRATEGY.md); de semantische kleuren (succes/tip/waarschuwing/fout) blijven altijd de vaste brandbook-kleuren, ook als de primaire accentkleur per variant verschilt, zodat betekenis consistent blijft over varianten heen.

**Toegankelijkheid**: minimaal 4,5:1 contrast voor lopende tekst, 3:1 voor grote tekst/iconen; elke variant-accentkleur wordt bij het instellen (zie [UX-DESIGN.md](UX-DESIGN.md) scherm 12) gecontroleerd op contrast tegen wit en donkerblauw.

**Wanneer wel**: kleur gebruiken om betekenis/hiërarchie te versterken (primaire knop, statuslabel, waarschuwing).

**Wanneer niet**: kleur nooit als enige informatiedrager (altijd ook icoon/tekstlabel, zie [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) §Toegankelijkheid); geen brandkleur-vlakvulling achter lopende tekst in de werkinterface (wel toegestaan op de marketing-achtige homepage-hero, spaarzaam).

---

## 7. Knoppen

**Doel**: duidelijk maken welke actie primair, secundair of destructief is.

**Uiterlijk**: **Primair** — gevulde achtergrond in de actieve accentkleur (standaard Blauw `#1588C9`), witte tekst, 8px radius. **Secundair** — witte achtergrond, 1px rand in grijs-200 of accentkleur, tekst in grijs-900/accentkleur. **Tertiair/tekstlink** — geen achtergrond/rand, alleen accentkleurige tekst, underline bij hover. **Destructief** — gevuld/omrand in Rood `#E10919`, gereserveerd voor onomkeerbare acties (bijv. gebruiker verwijderen, media verwijderen).

**Gedrag**: hover = 8% donkerder/lichter + subtiele schaduw (sm); actief/pressed = 12% donkerder, geen schaduw; disabled = grijs-200 achtergrond, grijs-400 tekst, geen hover-effect, cursor "not-allowed"; laadstaat = spinner vervangt/staat naast label, knop uitgeschakeld (zie [UX-DESIGN.md](UX-DESIGN.md) scherm 5 §Loading states).

**Afmetingen**: hoogte 40px (standaard), 32px (compact, in tabellen/CMS-dichte schermen), 48px (primaire CTA op marketing-achtige schermen zoals de homepage-hero). Horizontale padding 16–24px. Minimale tikdoelgrootte 44×44px op touch-apparaten (indien visuele hoogte kleiner is, wordt de tikzone onzichtbaar vergroot).

**Varianten**: primair/secundair/tertiair/destructief × standaard/compact/groot; met-icoon (icoon+label) en icoon-only (met verplicht aria-label).

**Toegankelijkheid**: focus-ring altijd zichtbaar (zie §34); disabled-knoppen blijven door screenreaders aangekondigd als "niet beschikbaar", niet volledig verborgen; icoon-only-knoppen altijd met `aria-label`.

**Wanneer wel**: precies één primaire knop per scherm/sectie (bijv. "Versturen" op het contactformulier, "Nieuw artikel" in het beheer) — dit dwingt duidelijke prioriteit af.

**Wanneer niet**: nooit meerdere primaire knoppen naast elkaar in dezelfde context; destructieve stijl nooit voor niet-destructieve acties (verwarrend/beangstigend).

---

## 8. Formulieren

**Doel**: snel en foutloos invullen, met name het contactformulier ([UX-DESIGN.md](UX-DESIGN.md) scherm 5) en variant-/artikelconfiguratie in het beheer.

**Uiterlijk**: labels altijd zichtbaar boven het veld (nooit alleen placeholder — zie toegankelijkheid), 1px rand grijs-200, 8px radius, witte achtergrond; focus = accentkleurige rand + subtiele glow; foutstaat = rode rand + rode inline-tekst onder het veld met een klein foutpictogram.

**Gedrag**: validatie bij "blur" (veld verlaten) voor directe feedback, niet pas bij versturen; verplichte velden met `*` én tekstuele indicatie; groot tekstveld (textarea) auto-groeit tot een maximum, daarna interne scroll.

**Afmetingen**: veldhoogte 40px (single-line), textarea minimaal 96px hoog; labelgrootte Body-klein (14px, 500-gewicht); verticale afstand tussen velden 16px, tussen secties 32px (zie §3).

**Varianten**: tekstveld, textarea, select/dropdown, bestand-upload-dropzone, kleurkiezer (zie [UX-DESIGN.md](UX-DESIGN.md) scherm 12), toggle/checkbox, radiogroep (override-acties, zie scherm 11).

**Toegankelijkheid**: elk veld met een echt gekoppeld `<label>`; foutmeldingen gekoppeld via `aria-describedby`; foutmeldingen zowel kleur als tekst/icoon; volledige toetsenbordbediening, logische tab-volgorde.

**Wanneer wel**: elk datainvoermoment, publiek én beheer.

**Wanneer niet**: nooit placeholder-tekst als vervanging voor een label; nooit meer dan één verplicht veld tegelijk zonder duidelijke groepering (secties, zie scherm 5).

---

## 9. AI-chat

**Doel**: het antwoordproces visueel vertrouwen wekken — duidelijk onderscheid tussen een "echt" antwoord en onzekerheid (zie [UX-DESIGN.md](UX-DESIGN.md) schermen 4 en 8).

**Uiterlijk**: gebruikersbubbels rechts uitgelijnd, lichte accentkleur-achtergrond (bijv. Blauw op 8% dekking), grijs-900 tekst; AI-bubbels links uitgelijnd, witte/grijs-50 achtergrond met subtiele rand, geen felle kleur (rust boven "AI-hype"-esthetiek). Bronnenkaart binnen de AI-bubbel: apart kader, iets donkerder achtergrond (grijs-50 op grijs-100), met documenticoon.

**Gedrag**: antwoord streamt woord-voor-woord in; bronnenkaart verschijnt met een korte fade-in ná het volledige antwoord (niet eerder, om niet te suggereren dat het antwoord al "af" is voordat het dat is); "denkend"-indicator = drie zacht pulserende puntjes, geen spinner (rustiger).

**Afmetingen**: bubbel max-breedte 75% van het paneel/scherm (nooit edge-to-edge, blijft leesbaar); bronnenkaart-thumbnail 64×64px; invoerveld hoogte 48px, sticky onderaan.

**Varianten**: normaal antwoord (met bronnenkaart), "geen betrouwbaar antwoord"-variant (neutrale/grijze kaart, geen bronnenkaart, zie §15/§16 en scherm 8), welkomstbericht met voorbeeldvraag-chips.

**Toegankelijkheid**: nieuwe berichten in een `aria-live`-region; duim-omhoog/omlaag-knoppen met aria-label; voldoende contrast tussen gebruikers- en AI-bubbel zonder alleen op kleur te vertrouwen (ook uitlijning + eventueel klein "Jij"/"AI"-label voor screenreaders).

**Wanneer wel**: altijd bronvermelding tonen bij een echt antwoord (nooit optioneel, zie §28).

**Wanneer niet**: nooit de "onzeker"-variant in dezelfde visuele stijl als een normaal antwoord tonen — het verschil moet in één oogopslag duidelijk zijn.

---

## 10. Zoekresultaten

**Doel**: snel kunnen scannen welk resultaat relevant is (zie [UX-DESIGN.md](UX-DESIGN.md) scherm 2).

**Uiterlijk**: resultaatkaart zonder zware kaderlijn (alleen een dunne onderrand ter scheiding), titel in accentkleur (linkstijl), sectie/stap-context als kleine grijze metatekst erboven, snippet met de zoekterm vetgedrukt (niet gemarkeerd met achtergrondkleur — rustiger).

**Gedrag**: hover = titel underline + lichte grijs-50-achtergrond over de hele kaart (duidelijk klikbaar gebied); resultaten laden incrementeel (skeleton → echte content) zonder layout-sprong.

**Afmetingen**: resultaatkaart verticale padding 16px, volledige breedte van de contentkolom (max. ~800px, iets breder dan leestekst voor scanbaarheid).

**Varianten**: standaardresultaat, "0 resultaten"-staat (zie §16), AI-suggestiebalk (apart, lichtjes accentgekleurd kader tussen/onder de resultaten).

**Toegankelijkheid**: resultaatteller aangekondigd via live-region bij nieuwe zoekopdracht; snippet-nadruk niet uitsluitend via kleur.

**Wanneer wel**: op elk publiek zoekmoment, inclusief zoeken vanuit de header op elk scherm.

**Wanneer niet**: geen kaartachtige schaduw/omranding per resultaat (te zwaar voor een lijst van 10+ items — rust boven decoratie).

---

## 11. Handleidingen

**Doel**: de sectie/stap-boomstructuur (zie [DATA-MODEL.md](DATA-MODEL.md)) visueel navigeerbaar en scanbaar maken (zie [UX-DESIGN.md](UX-DESIGN.md) scherm 3).

**Uiterlijk**: sectiekoppen H2-stijl met wat extra ruimte erboven (32px); genummerde stappen met een ronde accentkleurige nummer-badge (28px diameter) links van de stap-tekst; waarschuwing-/tipblokken als kaders met linkeraccentrand (4px, oranje resp. geel) en icoon; "aanvulling"-kader (variant-override) met een dunne gestippelde of getinte rand + klein badge-label ("Aanvulling voor [variant]") zodat het duidelijk een toevoeging is, niet centrale tekst.

**Gedrag**: sticky inhoudsopgave met scroll-spy (actieve sectie gemarkeerd in accentkleur + linkeraccentstreep); "kopieer link naar deze sectie" verschijnt bij hover op een sectiekop.

**Afmetingen**: leescontentbreedte max. ~680px; stap-nummer-badge 28px; afbeeldingen vol-breedte van de contentkolom met 8px radius.

**Varianten**: per `ContentBlock.type` (tekst/genummerde_stap/afbeelding/waarschuwing/tip/video/download/contact_doorverwijzing) een eigen visuele stijl, zie [UX-DESIGN.md](UX-DESIGN.md) §Componentenbibliotheek §Content-weergave.

**Toegankelijkheid**: correcte koppenhiërarchie; stap-nummers ook semantisch als geordende lijst (niet alleen visueel genummerd); waarschuwing/tip altijd met tekstlabel, niet alleen kleur.

**Wanneer wel**: consistent op elk artikel, ongeacht lengte.

**Wanneer niet**: geen decoratieve iconen die geen betekenis toevoegen (bijv. geen los sier-icoon naast elke sectiekop zonder functie).

---

## 12. Kenniskaarten

**Doel**: content laagdrempelig laten browsen — categoriekaarten (homepage), "nieuw/bijgewerkt"-kaarten, gerelateerde-artikelen-kaarten (zie [UX-DESIGN.md](UX-DESIGN.md) schermen 1, 3, 6).

**Uiterlijk**: witte kaart, 12px radius, schaduw sm, 24px interne padding; klein accentkleurig icoon (Lucide, 24px) bovenaan, titel (H4/600-gewicht) eronder, korte omschrijving in Body-klein/grijs-600.

**Gedrag**: hover = schaduw md + lichte lift (2–4px translate-y), 120ms; volledige kaart is klikbaar (niet alleen de titel).

**Afmetingen**: kaartbreedte responsief binnen het grid (3–4 kolommen desktop, 1 kolom mobiel — zie §2/§4); minimale hoogte zodat kaarten in een rij visueel gelijk zijn, ook bij verschillende tekstlengtes.

**Varianten**: categoriekaart (icoon+titel+omschrijving), updatekaart (badge Nieuw/Bijgewerkt + titel + datum), gerelateerd-artikel-kaart (compacter, geen icoon), AI-teaserkaart (met accentkleurige achtergrond op lage dekking, iets afwijkend om als "actie-uitnodiging" te lezen).

**Toegankelijkheid**: kaart als geheel focusbaar/klikbaar element met duidelijke focus-ring, niet alleen de titel-tekst.

**Wanneer wel**: bij het aanbieden van een beperkt aantal (3–8) gelijksoortige, doorklikbare items.

**Wanneer niet**: niet gebruiken voor lange lijsten (>10 items) — dan een lijst/tabel (zie §10, §22), kaarten worden dan onoverzichtelijk en zwaar.

---

## 13. Breadcrumbs

**Doel**: locatie binnen de site-/contenthiërarchie tonen en snel terugnavigeren.

**Uiterlijk**: kleine tekst (Body-klein, grijs-600), `>`-scheidingsteken, laatste item (huidige pagina) in grijs-900 niet-klikbaar, overige items als tekstlinks in grijs-600 met accentkleur bij hover.

**Gedrag**: bij lange paden op mobiel: alleen "← Vorige niveau" tonen in plaats van het volledige pad (ruimtebesparing).

**Afmetingen**: hoogte binnen de reguliere paginakop-ruimte, geen apart balkje met eigen achtergrondkleur (rust — geen extra visueel blok).

**Varianten**: publiek (Home > Categorie > Artikel), beheer (Sectienaam > Detail, zie [UX-DESIGN.md](UX-DESIGN.md) §Navigatie).

**Toegankelijkheid**: als `<nav aria-label="Breadcrumb">` met geordende lijst; huidige pagina met `aria-current="page"`.

**Wanneer wel**: op elk scherm met meer dan één navigatieniveau diepte (artikel, categorie-detail, beheer-detailschermen).

**Wanneer niet**: niet op de homepage of top-level schermen (geen zinloze "Home"-only breadcrumb).

---

## 14. Tabs

**Doel**: gerelateerde subsecties binnen één scherm schakelen zonder te navigeren (zie variant-detail scherm 12, instellingen scherm 15, AI-feedback scherm 14).

**Uiterlijk**: horizontale rij tekstlabels, actieve tab met een 2px accentkleurige onderstreep + grijs-900 tekst (600-gewicht), inactieve tabs grijs-600 (400-gewicht), geen kaderomranding per tab (platte stijl, rustiger dan "pill"-tabs).

**Gedrag**: klik/toetsenbord wisselt content direct (geen paginaherlaad), korte fade (150ms) bij content-wissel.

**Afmetingen**: tabhoogte 44px (incl. onderstreep-ruimte), horizontale padding per tab 16px.

**Varianten**: horizontale tabs (desktop), dropdown-vervanging (mobiel, zie [UX-DESIGN.md](UX-DESIGN.md) §Mobiele versie per scherm).

**Toegankelijkheid**: ARIA-tablist/tab/tabpanel-structuur, pijltjestoetsen wisselen tussen tabs, actieve tab met `aria-selected="true"`.

**Wanneer wel**: 2–5 gelijkwaardige subsecties van dezelfde entiteit (bijv. Branding/Domein/Terminologie van één variant).

**Wanneer niet**: niet voor een lineair proces (gebruik dan een stappenindicator, niet-toegepast in dit platform bij deze schaal); niet bij meer dan 5–6 items (dan een ander navigatiepatroon, bijv. zijnavigatie).

---

## 15. Meldingen

**Doel**: systeemstatus communiceren (succes, fout, waarschuwing, info) zonder de gebruiker te onderbreken tenzij noodzakelijk.

**Uiterlijk**: **Inline melding** (bij een veld/sectie) — kleine tekst + icoon in de semantische kleur, geen kader. **Bannermelding** (paginaniveau, bijv. "Versturen mislukt") — volle breedte van de content, lichte semantische achtergrondkleur (8% dekking), icoon + tekst + evt. actieknop, 8px radius. **Toast** (tijdelijk, bijv. "Opgeslagen") — rechtsonder of bovenaan, verdwijnt na ~4 seconden of handmatig te sluiten.

**Gedrag**: toast schuift in (200ms) en faded uit; bannermeldingen blijven zichtbaar tot de gebruiker de onderliggende actie oplost of ze sluit; fouten worden nooit automatisch weggetimed (de gebruiker moet ze kunnen lezen).

**Afmetingen**: bannerpadding 16px, toastbreedte max. 360px.

**Varianten**: succes (groen), fout (rood), waarschuwing (oranje), info (blauw) — zie [UX-DESIGN.md](UX-DESIGN.md) §Componentenbibliotheek "Toast/bannermelding".

**Toegankelijkheid**: `aria-live="polite"` voor toasts/succes, `aria-live="assertive"` voor foutmeldingen; kleur nooit de enige drager (altijd icoon + tekst).

**Wanneer wel**: elke actie met een systeemgevolg (opslaan, versturen, verwijderen, fout).

**Wanneer niet**: geen toast voor acties die al direct zichtbaar visueel resultaat hebben (bijv. geen "Tekst getypt"-toast) — alleen bij niet-vanzelfsprekende bevestiging.

---

## 16. Empty states

**Doel**: uitleggen waarom een scherm leeg is en een duidelijke volgende stap bieden (zie elk "Lege statussen"-veld in [UX-DESIGN.md](UX-DESIGN.md)).

**Uiterlijk**: gecentreerd blok — een eenvoudig lijn-icoon (Lucide, 32px, grijs-400, géén illustratie/tekening, zie §36), korte titel (H4), één zin toelichting (Body, grijs-600), optioneel één primaire actieknop.

**Gedrag**: statisch, geen animatie nodig behalve een zachte fade-in bij verschijnen.

**Afmetingen**: verticale padding 64–96px rondom het blok (ruim, geen gedrongen leegte).

**Varianten**: "nog geen data" (bijv. geen media geüpload), "0 resultaten" (zoeken), "niets gevonden voor deze filter" (AI-feedback, updates), "eerste keer"-staat met sterkere CTA (bijv. dashboard zonder activiteit).

**Toegankelijkheid**: titel als echte koptekst (h2/h3 afhankelijk van contextniveau) zodat screenreader-gebruikers de lege staat niet missen.

**Wanneer wel**: elke lijst/overzicht die leeg kán zijn.

**Wanneer niet**: nooit een empty state tonen tijdens het laden (dat is een loading state, zie §17) — expliciet onderscheiden, anders lijkt data-laden op "geen data".

---

## 17. Loading states

**Doel**: duidelijk maken dat content onderweg is, zonder layout-sprongen wanneer de content arriveert.

**Uiterlijk**: skeleton-vormen (grijs-100/grijs-200 pulserend blok) die exact de vorm/afmeting van de uiteindelijke content innemen (kaart-skeleton, regel-skeleton, tabel-rij-skeleton); geen generieke spinner voor content die een voorspelbare vorm heeft.

**Gedrag**: zachte puls-animatie (opacity 100%→60%→100%, ~1,5s cyclus); vervangt direct door echte content zodra beschikbaar, geen extra "klaar"-animatie.

**Afmetingen**: identiek aan de uiteindelijke content (kaart-skeleton = kaartafmetingen, regel-skeleton = tekstregelhoogte).

**Varianten**: skeleton-kaart, skeleton-regel, skeleton-tabelrij, knop-laadstaat (spinner in de knop, zie §7), chat-"denkend"-indicator (§9, bewust anders: drie puntjes, geen skeleton — een gesprek heeft geen voorspelbare vorm).

**Toegankelijkheid**: laadstatus aangekondigd via `aria-busy`/live-region ("Bezig met laden…"), niet alleen visueel.

**Wanneer wel**: elke asynchrone data-ophaling langer dan ~300ms.

**Wanneer niet**: geen skeleton tonen voor bliksemsnelle lokale interacties (bijv. een tab wisselen dat al volledig client-side beschikbaar is) — dat oogt onrustig.

---

## 18. Dialogen

**Doel**: bevestiging vragen vóór een belangrijke of onomkeerbare actie (bijv. gebruiker verwijderen, media verwijderen die in gebruik is, zie [UX-DESIGN.md](UX-DESIGN.md) schermen 13/15).

**Uiterlijk**: kleiner dan een modal (§19), gecentreerd, max-breedte ~400px, 16px radius, schaduw lg; titel (H4), korte toelichtende tekst, twee knoppen naast elkaar (secundair "Annuleren" links, primair/destructief rechts).

**Gedrag**: verschijnt met een korte scale+fade (200ms), pagina-achtergrond verdonkert (overlay 40% zwart); sluiten via Annuleren, klik buiten de dialoog, of Escape-toets.

**Afmetingen**: interne padding 24px; knoppen standaardhoogte (40px, zie §7).

**Varianten**: bevestigingsdialoog (2 knoppen), informatiedialoog (1 knop "Begrepen").

**Toegankelijkheid**: focus verplaatst automatisch naar de dialoog bij openen en keert terug naar het triggerende element bij sluiten (focus trap binnen de dialoog); `role="alertdialog"` bij destructieve bevestigingen.

**Wanneer wel**: bij acties die data verwijderen of moeilijk terug te draaien zijn.

**Wanneer niet**: nooit voor routinematige, omkeerbare acties (bijv. niet bij elke "opslaan") — overmatig gebruik van dialogen ondermijnt hun signaalwaarde.

---

## 19. Modals

**Doel**: een taak in context afronden zonder de onderliggende pagina te verlaten (bijv. "gebruiker uitnodigen", "bestand uploaden", zie [UX-DESIGN.md](UX-DESIGN.md) scherm 15).

**Uiterlijk**: groter dan een dialoog, gecentreerd of als slide-in-paneel (zie §onder), max-breedte 480–640px afhankelijk van inhoud, 16px radius, schaduw lg, duidelijke sluitknop (✕) rechtsboven.

**Gedrag**: zelfde overlay/focus-trap-gedrag als dialogen (§18); formulier-modals behouden ingevoerde data bij een validatiefout (nooit resetten).

**Afmetingen**: interne padding 32px; koptekst + inhoud + actieknoppen onderaan (rechts uitgelijnd, primair uiterst rechts).

**Varianten**: centrale modal (formulieren, uitnodigen), slide-in paneel vanaf de zijkant (AI-chat op desktop, media-detail — zie [UX-DESIGN.md](UX-DESIGN.md) schermen 4/13, iets minder onderbrekend dan een centrale modal omdat de context zichtbaar blijft).

**Toegankelijkheid**: zelfde focus-trap/Escape-gedrag als dialogen; modal-titel gekoppeld via `aria-labelledby`.

**Wanneer wel**: korte, afgebakende taken die niet een volledige paginanavigatie rechtvaardigen.

**Wanneer niet**: nooit voor lange, complexe formulieren (zoals de volledige artikel-editor, scherm 11) — dat blijft een eigen pagina, een modal zou daar te beperkend voelen.

---

## 20. CMS interface

**Doel**: de beheeromgeving (schermen 10–15) een consistente, dichte maar rustige werkinterface geven, duidelijk visueel onderscheiden van de publieke, luchtigere schermen.

**Uiterlijk**: vaste linker zijnavigatie (grijs-50 achtergrond, donkerblauw actieve-item-indicator), lichte grijze werkachtergrond (grijs-50), content in witte kaarten/panelen; minder decoratieve ruimte dan publieke schermen (compacte afstandsvariant, zie §3), geen hero's/gradients (die zijn gereserveerd voor publieke/marketing-achtige momenten, zie §38).

**Gedrag**: navigatie tussen beheerschermen zonder volledige paginaherlaad-gevoel (snelle overgangen, 200ms); statuswijzigingen (concept→review→gepubliceerd) altijd met directe visuele bevestiging (badge-kleur wisselt, toast, zie §15).

**Afmetingen**: zijnavigatie-breedte 240px (desktop, vast), content-area vult de rest tot max. 1440px.

**Varianten**: standaard beheerscherm (lijst + detail), driekoloms editor (alleen scherm 11, zie §onder), dashboard-widgetgrid (§21).

**Toegankelijkheid**: zijnavigatie als `<nav>`-landmark met huidige-pagina-indicatie; consistente kop-structuur zodat screenreader-gebruikers snel tussen beheerschermen kunnen navigeren.

**Wanneer wel**: voor elk scherm achter login.

**Wanneer niet**: geen publieke merkelementen (grote gradient-hero, marketing-toon) in de CMS — de beheeromgeving communiceert functionaliteit, niet merk naar buiten toe.

---

## 21. Dashboard

**Doel**: in één oogopslag redactionele status en aandachtspunten tonen (zie [UX-DESIGN.md](UX-DESIGN.md) scherm 10).

**Uiterlijk**: statuskaarten in een rij (desktop) — groot cijfer (H1-achtig, 32px/700) + kleine tekstuele label eronder, elk kaart klikbaar naar de gefilterde lijst; activiteitenlijst als eenvoudige, compacte regel-voor-regel lijst (avatar/initialen + actie + tijdstip); signaalkaart met een subtiele accentkleurige linkerrand (waarschuwing-achtig, maar niet alarmerend rood).

**Gedrag**: cijfers/kaarten laden onafhankelijk van elkaar (één trage widget blokkeert de rest niet, zie [UX-DESIGN.md](UX-DESIGN.md) scherm 10 §Foutmeldingen).

**Afmetingen**: statuskaart minimaal 160×100px, in een rij van 4 op desktop / 2×2 op tablet / gestapeld op mobiel.

**Varianten**: leeg dashboard (nieuw account, zie §16), gevuld dashboard, dashboard met actief AI-signaal.

**Toegankelijkheid**: cijfers met een tekstueel `aria-label` dat het cijfer in context plaatst ("4 concepten, bekijk lijst"), niet alleen een los getal.

**Wanneer wel**: als startscherm na inloggen.

**Wanneer niet**: geen dashboard-widgets die geen actie mogelijk maken (elke widget moet naar iets doorklikbaar zijn — puur decoratieve statistiek hoort hier niet, zie ook uitgestelde uitgebreide analytics in [PROJECT.md](PROJECT.md)).

---

## 22. Tabellen

**Doel**: grote lijsten data (artikelen, variants, media, gebruikers) scanbaar en sorteerbaar tonen.

**Uiterlijk**: geen zware kaderlijnen — alleen een dunne onderrand per rij (grijs-100), koprij in grijs-50 achtergrond met Label-stijl kolomkoppen (12px, 500-gewicht, grijs-600); statuskolommen met badges (zie §12/§15-stijl badges), niet losse gekleurde tekst.

**Gedrag**: hover op een rij = lichte grijs-50-achtergrond; sorteerbare kolommen met een klein pijl-icoon dat richting toont; klik op een rij (buiten actieknoppen) opent het detailscherm.

**Afmetingen**: rijhoogte 48px (standaard) / 40px (compact-dichte CMS-lijsten); celpadding 12–16px horizontaal.

**Varianten**: standaardtabel, tabel met inline-acties (bewerken/verwijderen-iconen rechts uitgelijnd), tabel met bulk-selectie (checkbox-kolom, alleen indien nodig — niet standaard in v1 gezien beperkte teamgrootte).

**Toegankelijkheid**: correcte `<table>`-semantiek met `<th>`/scope, sorteerbare koppen met `aria-sort`, rijen met voldoende contrast bij hover (niet alleen een subtiele tint die onder AA-drempel zakt voor eventuele tekstwijziging).

**Wanneer wel**: lijsten van gelijksoortige, vergelijkbare items met meerdere attributen (status, datum, type) die de gebruiker wil kunnen vergelijken/sorteren.

**Wanneer niet**: niet voor een kleine set (<5) items zonder vergelijkbare kolommen — dan een eenvoudige lijst/kaartset (zie §12).

---

## 23. Filters

**Doel**: grote lijsten (zoekresultaten, artikelen, media, AI-feedback) snel verkleinen tot het relevante subset.

**Uiterlijk**: dropdown-select-stijl (label + huidige waarde + chevron-icoon), gegroepeerd in een horizontale rij boven de lijst/tabel (desktop); actieve filters tonen het aantal/de waarde direct in de dropdown-knop zelf (geen apart "actieve filters"-badge-rijtje nodig bij slechts 2–3 filters).

**Gedrag**: filter past de lijst direct toe (geen apart "Toepassen"-knop bij eenvoudige dropdown-filters); URL/staat onthoudt de filterkeuze bij terugnavigeren.

**Afmetingen**: filterknop-hoogte 36–40px, gelijk aan naastgelegen zoek-/actie-elementen.

**Varianten**: enkelvoudige dropdown-filter, mobiele "Filters"-knop die een bottom-sheet/modal met alle filters opent (zie [UX-DESIGN.md](UX-DESIGN.md) §Mobiele versie, scherm 2/6).

**Toegankelijkheid**: elke filter als `<label>`+`<select>` of geëquivalente ARIA-combobox, wijziging aangekondigd via live-region ("12 resultaten" → "4 resultaten").

**Wanneer wel**: lijsten die typisch >10 items bevatten met onderscheidende attributen.

**Wanneer niet**: geen filters tonen voor lijsten die zelden meer dan een handvol items bevatten (bijv. de variantenlijst in de vroege MVP-fase) — overbodige UI, zie [UX-DESIGN.md](UX-DESIGN.md) principe "geen zinloze UI met precies één optie".

---

## 24. Navigatie

**Doel**: overal in het platform duidelijk maken waar je bent en snel ergens anders naartoe kunnen (zie [UX-DESIGN.md](UX-DESIGN.md) §Navigatie voor de structuur).

**Uiterlijk**: publieke header (wit/lichte achtergrond, logo + zoekbalk + acties), beheer-zijnavigatie (grijs-50, verticale lijst met iconen+labels, actief item met donkerblauwe linkeraccentstreep + subtiele achtergrondtint).

**Gedrag**: actieve navigatie-item altijd visueel gemarkeerd; sticky header op publieke schermen (blijft zichtbaar bij scrollen, iets verkleind na scroll-drempel voor meer leesruimte).

**Afmetingen**: headerhoogte 64px (72px met gradient-accentbalk eronder, zie §38); zijnavigatie-itemhoogte 44px.

**Varianten**: publieke header, beheer-zijnav, mobiele hamburger-navigatie (§25).

**Toegankelijkheid**: `<nav>`-landmarks met onderscheidende `aria-label` ("Hoofdnavigatie", "Beheernavigatie"); huidige pagina met `aria-current="page"`.

**Wanneer wel**: consistent op elk scherm binnen hetzelfde deel (publiek of beheer).

**Wanneer niet**: nooit de publieke en beheer-navigatiestijl door elkaar tonen — een gebruiker moet direct visueel aanvoelen in welk deel van het platform hij zich bevindt.

---

## 25. Mobiele navigatie

**Doel**: dezelfde navigatiemogelijkheden op een klein scherm, zonder de ruimte te overladen.

**Uiterlijk**: hamburgerpictogram (24px) linksboven of rechtsboven naast het logo; bij openen: full-screen of slide-in menu-overlay met grote, goed aantikbare links (48px hoogte), gestapeld.

**Gedrag**: menu opent met een slide/fade (250ms), sluit via ✕-icoon, klik buiten het menu, of het selecteren van een link; sticky AI-chat-toegangsknop blijft zichtbaar op publieke schermen ook met het menu gesloten (primair pad, zie [UX-DESIGN.md](UX-DESIGN.md) §Navigatie).

**Afmetingen**: menu-overlay volledige schermbreedte of ≥85% met een subtiele restrand zodat duidelijk is dat het een overlay is; tikdoelen minimaal 44×44px.

**Varianten**: publiek hamburgermenu (Categorieën, Updates, Contact + variant-indicator), beheer-hamburgermenu (dezelfde items als de desktop-zijnavigatie).

**Toegankelijkheid**: menu-knop met `aria-expanded`-status; focus verplaatst naar het menu bij openen en keert terug bij sluiten; Escape sluit het menu.

**Wanneer wel**: onder de tablet-breakpoint (640px) altijd; tussen 640–1023px afhankelijk van het aantal navigatie-items (kan nog inline passen).

**Wanneer niet**: nooit de sticky AI-chat-knop verbergen achter het hamburgermenu — dat is een primaire actie, geen secundaire navigatie.

---

## 26. Footer

**Doel**: secundaire navigatie, juridische links en merkvertrouwen bieden (zie [UX-DESIGN.md](UX-DESIGN.md) §Navigatie, [PROJECT.md](PROJECT.md) §Relatie tot sCoolsuite B.V.).

**Uiterlijk**: donkerblauwe achtergrond (`#002641`, consistent met de brandbook-voorbeeldpagina's die het logo wit-op-donkerblauw tonen), witte/lichtgrijze tekst, logo (witte variant) linksboven, kolommen met links (Categorieën, Updates, Contact, Privacy/Voorwaarden), kleine juridische regel onderaan ("Onderdeel van sCoolsuite B.V.") — subtiel, niet prominent (zie [PROJECT.md](PROJECT.md)).

**Gedrag**: statisch, geen animatie; social-iconen (indien van toepassing, zie brandbook "Volg ons"-pagina) met dezelfde vierkante omkaderde stijl als in het brandbook.

**Afmetingen**: verticale padding 64px desktop / 32px mobiel; kolommen naast elkaar op desktop, gestapeld op mobiel.

**Varianten**: publieke footer (uitgebreid, zoals hierboven); beheeromgeving heeft geen decoratieve footer, alleen een minimale statusregel indien nodig (bijv. versienummer — optioneel, niet essentieel).

**Toegankelijkheid**: voldoende contrast wit-op-donkerblauw (dit combo is al AA-conform bij de brandbook-kleurwaarden); footer als `<footer>`-landmark.

**Wanneer wel**: onderaan elk publiek scherm, consistent.

**Wanneer niet**: geen herhaling van de volledige hoofdnavigatie in de footer — alleen de belangrijkste secundaire links, om overload te voorkomen.

---

## 27. Header

**Doel**: primaire navigatie- en actie-ingang op elk publiek scherm (zie [UX-DESIGN.md](UX-DESIGN.md) §Navigatie).

**Uiterlijk**: witte achtergrond, dunne onderrand (grijs-100) of een subtiele schaduw sm bij scrollen; van links naar rechts: logo (variant-specifiek) — zoekbalk (gecentreerd of direct na het logo) — AI-chat-toegang — Contact-link — variant-indicator/wisselaar (indien >1 actieve variant).

**Gedrag**: sticky bij scrollen; comprimeert licht (bijv. 64px → 56px hoogte) na een scroll-drempel om meer leesruimte te geven zonder de header te laten verdwijnen.

**Afmetingen**: hoogte 64px (72px inclusief de dunne gradient-accentbalk direct eronder, zie §38); logo-hoogte ~28–32px.

**Varianten**: publieke header (zoals hierboven), beheer-header (smaller, alleen gebruikersmenu + variant-contextselector + eventueel een terug-naar-publieke-site-link, geen zoekbalk/AI-chat-knop — dat hoort bij het publieke deel).

**Toegankelijkheid**: logo-link met `aria-label` ("Naar de homepage van [variant]"); zoekbalk direct bereikbaar via toetsenbord vanaf paginalaad (logische eerste tab-stop na skip-link).

**Wanneer wel**: op elk publiek scherm, identiek gepositioneerd.

**Wanneer niet**: geen brede marketing-elementen (grote gradient-vlakken, campagnebanners) in de header zelf — dat hoort, indien ooit nodig, in de hero van de homepage, niet in de globale navigatie.

---

## 28. AI-bronvermelding

**Doel**: het "de AI verzint niets"-principe visueel voelbaar en controleerbaar maken (zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md), [PROJECT.md](PROJECT.md) §Kernprincipes).

**Uiterlijk**: apart kader binnen/onder het AI-antwoord, kop "Bronnen" (Label-stijl), per bron: documenticoon + artikeltitel (accentkleur, klikbaar) + sectie/stap-context (Body-klein, grijs-600) + "Bijgewerkt: [datum]" (Body-klein, grijs-400) + optionele screenshot-miniatuur (64×64px, 6px radius).

**Gedrag**: klik op een bron navigeert naar het artikel, gescrold en kort gemarkeerd bij de exacte sectie (zie [UX-DESIGN.md](UX-DESIGN.md) scherm 3); meerdere bronnen worden als losse, gestapelde kaartjes getoond, niet samengevoegd tot één onduidelijke lijst.

**Afmetingen**: bronnenkaart interne padding 12px, verticale afstand tussen meerdere bronnen 8px.

**Varianten**: bron met screenshot, bron zonder screenshot (thumbnail-ruimte wordt dan niet gereserveerd, geen lege placeholder).

**Toegankelijkheid**: elke bron als een volledig gelabelde link ("Open [artikeltitel], sectie [sectienaam]"), niet alleen een titel die "toevallig" klikbaar is.

**Wanneer wel**: bij elk AI-antwoord dat daadwerkelijk op kennisbankcontent is gebaseerd — nooit optioneel/verbergbaar.

**Wanneer niet**: nooit tonen bij de "geen betrouwbaar antwoord"-staat (scherm 8) — daar is er per definitie geen citeerbare bron, en het tonen van een lege/zwakke bronnenkaart zou misleidend zekerder ogen dan de situatie is.

---

## 29. Screenshots

**Doel**: productscreenshots in handleidingen en AI-bronvermeldingen consistent en duidelijk tonen.

**Uiterlijk**: vol-breedte van de contentkolom (of kleiner indien de afbeelding van nature smaller is — nooit uitgerekt), 8px radius, dunne grijs-100-rand (geeft afbeeldingen met een witte/lichte productinterface voldoende visuele afbakening tegen de paginaeachtergrond), optioneel bijschrift eronder (Body-klein, grijs-600, cursief vermeden — gewoon regulier).

**Gedrag**: klik op een screenshot vergroot deze in een lichtbox/overlay (zwarte overlay 80%, afbeelding gecentreerd, sluitbaar via ✕/Escape/klik-buiten).

**Afmetingen**: standaard weergave max. contentkolombreedte (~680px in artikelen); lichtbox-weergave tot 90% van de viewport.

**Varianten**: inline artikelscreenshot, AI-bronvermelding-miniatuur (64×64px, geen lichtbox nodig — klik gaat naar de bron zelf), contactformulier-bijlage-thumbnail (in de beheeromgeving bij het bekijken van een melding).

**Toegankelijkheid**: verplichte, betekenisvolle alt-tekst (zie [DATA-MODEL.md](DATA-MODEL.md) `Media.altText`, verplicht veld); lichtbox met focus-trap en toetsenbord-sluitbaar.

**Wanneer wel**: bij elke stap waar een visuele referentie het begrip merkbaar versnelt.

**Wanneer niet**: geen decoratieve/sfeerscreenshots zonder informatiewaarde — elke afbeelding in een handleiding moet een concrete stap/interface-onderdeel tonen.

---

## 30. Video-weergave

**Doel**: video-uitleg (bloktype `video`, zie [DATA-MODEL.md](DATA-MODEL.md)) consistent tonen.

**Uiterlijk**: 16:9-embed, vol-breedte van de contentkolom, 8px radius, met een statische thumbnail + centraal afspeel-icoon vóór het starten (geen automatisch afspelende video — rust, en bewuste keuze van de gebruiker).

**Gedrag**: klik start inline afspelen (geen automatische wisseling naar een aparte pagina); standaard video-bediening (play/pause/volume/ondertiteling/volledig scherm) blijft beschikbaar.

**Afmetingen**: 16:9 aspect ratio behouden op elk schermformaat.

**Varianten**: embed met ondertiteling (voorkeur, zie toegankelijkheid), embed zonder ondertiteling (te vermijden waar mogelijk).

**Toegankelijkheid**: ondertiteling/transcript waar beschikbaar; video nooit de enige uitlegvorm voor een kritieke stap — bij voorkeur altijd ook een tekstuele stap-beschrijving ernaast/eronder.

**Wanneer wel**: bij complexe, multi-stap-interacties die met tekst alleen lastig te volgen zijn.

**Wanneer niet**: niet als vervanging voor korte, simpele stappen — tekst+screenshot is dan sneller te scannen dan een video bekijken.

---

## 31. Donkere modus

**Advies: bewust niet bouwen voor v1.**

**Doel**: (indien ooit gebouwd) minder schermbelasting bij langdurig gebruik.

**Uiterlijk/gedrag/afmetingen/varianten**: n.v.t. voor nu.

**Redenering**: het merk is opgebouwd rond een heldere, kleurrijke, optimistische gradient en overwegend witte/lichte oppervlakken (zie brandbook-voorbeeldpagina's); de primaire doelgroep gebruikt het platform doorgaans in een klaslokaal/kantooromgeving bij daglicht, vaak kort en doelgericht (een antwoord zoeken), niet in langdurige avondsessies waarbij donkere modus het meest waardevol is; het staat bovendien niet in de MVP-scope (zie [PROJECT.md](PROJECT.md) §Fasering) en zou nu vooral engineering-tijd kosten zonder aantoonbare vraag.

**Toegankelijkheid**: n.v.t. voor nu, maar zie hieronder.

**Wanneer wel heroverwegen**: als gebruiksdata na livegang laat zien dat de **beheeromgeving** (CMS, eigen werktool met potentieel lange sessies) hier specifiek baat bij heeft — dat is een aparte, kleinere afweging dan een donkere modus voor het hele publieke merk. Omdat de neutrale kleurwaarden al als losse tokens zijn vastgelegd (zie Designtokens), is een latere donkere-modus-toevoeging voor met name de CMS technisch relatief goedkoop.

**Wanneer niet**: niet voor het publieke, merkgerichte deel van het platform — dat zou de kleurrijke merkidentiteit (gradient, brandkleuren) verzwakken.

---

## 32. Animaties

**Doel**: interacties bevestigen en oriëntatie behouden bij overgangen, zonder de "rustige" toon te doorbreken.

**Uiterlijk**: subtiel — fades, korte translate/scale-bewegingen (max. 4–8px verplaatsing), nooit bouncy/elastic easing, nooit lange (>400ms) animaties op interactieve elementen.

**Gedrag**: micro-interacties (hover/focus) 120ms; component-overgangen (dropdown, accordion, tab) 200ms; paginaniveau/modal-overgangen 300ms; content die binnenkomt (skeleton→data) een korte fade, geen slide/bounce.

**Afmetingen**: n.v.t. — zie timing hierboven.

**Varianten**: entrance (fade+lichte translate, ease-out), exit (fade, ease-in, iets sneller dan entrance), state-change (kleur-/randovergang bij hover/focus/actief).

**Toegankelijkheid**: respecteer `prefers-reduced-motion` — bij die systeeminstelling worden animaties vervangen door directe (0ms) toestandswisselingen, geen enkele functionaliteit hangt af van een animatie.

**Wanneer wel**: om een statuswijziging, laadproces of navigatie-overgang te bevestigen.

**Wanneer niet**: geen animatie puur decoratief (bijv. geen doorlopende achtergrondanimaties, geen "aandachttrekkende" pulsen op niet-urgente elementen); geen animatie die interactie vertraagt (nooit wachten op een animatie voordat een volgende actie mogelijk is).

---

## 33. Hover states

**Doel**: op desktop/muis-apparaten aangeven dat een element interactief is vóór de klik.

**Uiterlijk**: knoppen — kleurverdieping + schaduw sm (zie §7); kaarten — schaduw md + lichte lift (zie §12); links/tekst — underline verschijnt of accentkleur intensiveert; tabelrijen — lichte grijs-50-achtergrond (zie §22); tabs — kleurverdieping van de tekst, onderstreep blijft alleen bij de actieve tab.

**Gedrag**: overgang altijd 120ms, geen abrupte kleursprong.

**Afmetingen**: n.v.t.

**Varianten**: per component zoals hierboven beschreven bij de betreffende sectie.

**Toegankelijkheid**: hover is nooit de enige manier om een interactieve staat te tonen — elk hover-effect heeft een equivalent focus-effect (§34) voor toetsenbordgebruikers, en interactiviteit is ook zonder hover al herkenbaar (cursor, onderliggende stijl zoals een knopvorm).

**Wanneer wel**: op elk klikbaar/interactief element op met-muis-bediende schermformaten.

**Wanneer niet**: geen hover-only-informatie (bijv. geen tooltip die uitsluitend op hover verschijnt zonder toetsenbord-/touch-alternatief) — zie ook §34.

---

## 34. Focus states

**Doel**: toetsenbordgebruikers te allen tijde laten zien waar de focus zich bevindt — een harde toegankelijkheidseis, geen esthetische bijzaak.

**Uiterlijk**: 2px zichtbare ring in de accentkleur (Blauw `#1588C9` of de actieve variant-accentkleur, mits voldoende contrast — zie §6), met 2px witruimte tussen het element en de ring (offset), zodat de ring nooit "verdwijnt" tegen een gelijkkleurige rand.

**Gedrag**: verschijnt direct bij toetsenbordnavigatie (Tab), verschijnt bewust **niet** bij muisklik (via `:focus-visible`-achtig gedrag) om visuele ruis voor muisgebruikers te vermijden zonder toegankelijkheid te verliezen.

**Afmetingen**: ringdikte 2px, offset 2px, radius volgt het onderliggende element +2px.

**Varianten**: standaard focus-ring (knoppen, links, kaarten), veld-focus (accentkleurige rand + subtiele glow, zie §8 — iets anders dan de ring omdat velden al een rand hebben), modal/dialoog-focus-trap (§18/§19).

**Toegankelijkheid**: dit ís het toegankelijkheidsmechanisme zelf — nooit `outline: none` zonder een evenwaardig alternatief; volgorde van focus altijd logisch (visuele volgorde = DOM-volgorde = tab-volgorde).

**Wanneer wel**: op elk interactief element, uitzonderingsloos.

**Wanneer niet**: nooit weglaten, ook niet "omdat het er mooier uitziet zonder".

---

## 35. Iconengebruik

**Doel**: snel scanbare, betekenisvolle visuele ondersteuning bij tekst en acties (zie [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) §Iconografie — Lucide, aanvullende keuze).

**Uiterlijk**: consistente lijnstijl (Lucide, strokewidth 1,5–2), altijd in grijs-600 (neutraal) of de relevante semantische/accentkleur, nooit als gevulde/solid iconen door elkaar met lijniconen.

**Gedrag**: statisch, behalve functionele micro-animatie (bijv. chevron die 180° draait bij het openen van een accordeon/dropdown, 150ms).

**Afmetingen**: 16px (inline bij tekst/labels), 20px (standaard UI-knoppen/navigatie), 24px (kopregels, primaire acties, kaart-iconen), 32px (empty-state-illustraties, zie §36).

**Varianten**: functioneel icoon (zoeken, sluiten, chevron), semantisch icoon (waarschuwing, tip, succes, fout — altijd gekoppeld aan de bijbehorende kleur), decoratief-maar-betekenisvol icoon (categoriekaart-icoon, zie §12).

**Toegankelijkheid**: icoon-only-elementen altijd met `aria-label`; decoratieve iconen (die naast al aanwezige tekst staan) met `aria-hidden="true"` om dubbele screenreader-aankondiging te voorkomen.

**Wanneer wel**: waar een icoon herkenning versnelt (statuslabels, navigatie, acties) of een tekstlabel visueel ondersteunt.

**Wanneer niet**: nooit een icoon als enige informatiedrager zonder tekstlabel of `aria-label`; geen iconen "omdat het leeg oogt" zonder functionele betekenis.

---

## 36. Illustraties

**Doel**: n.v.t. als apart illustratiesysteem — dit platform gebruikt bewust **geen** aangepaste illustraties.

**Uiterlijk**: waar een empty state of onboarding-moment visuele ondersteuning nodig heeft (zie §16), wordt een eenvoudig Lucide-lijnicoon (32px, grijs-400) gebruikt in plaats van een aangepaste illustratie.

**Gedrag/afmetingen/varianten**: zie §16, §35.

**Redenering**: het brandbook bevat geen illustratiestijl (zie [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) §Ontbreekt) en de gewenste toon is "rustig, professioneel, helder" — een eigen illustratiesysteem zou een aanzienlijke aanvullende ontwerp- en onderhoudsinspanning vergen die niet in verhouding staat tot de MVP-scope, en risicovol is om te "verzinnen" zonder brandbook-kader.

**Toegankelijkheid**: n.v.t.

**Wanneer wel**: alleen als de oprichter later expliciet een illustratiestijl laat ontwikkelen (bijv. als onderdeel van een uitgebreider merktraject) — dan wordt deze sectie herzien.

**Wanneer niet**: nu, overal — gebruik in plaats daarvan iconen (§35), foto's (§37) of het beeldmerk (§38) voor visuele ondersteuning.

---

## 37. Afbeeldingen

**Doel**: het gebruik van foto's (bijv. op de homepage-hero, in de stijl van de brandbook-voorbeeldpagina's) consistent en merkgetrouw houden.

**Uiterlijk**: foto's van leerlingen/klaslokaal-sfeer worden, waar gebruikt, "gemaskeerd" binnen de L-vorm van het beeldmerk (letterlijke brandbook-toepassingsstijl, zie [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) §Merkbasis) — dit is de enige plek waar foto's decoratief/marketing-achtig worden ingezet; productscreenshots (§29) volgen een eigen, functionele stijl.

**Gedrag**: statisch, geen parallax/zware scroll-effecten (rust boven spektakel).

**Afmetingen**: hero-foto's volgen de brandbook-voorbeeldverhouding (L-vormmasker, variabel per compositie); geen vaste aspect ratio buiten deze maskervorm.

**Varianten**: hero-foto (homepage, evt. marketing-achtige momenten), geen fotogebruik in de CMS/beheeromgeving (functioneel, geen marketing-toon, zie §20).

**Toegankelijkheid**: decoratieve hero-foto's met `alt=""` (puur decoratief, geen informatiewaarde) tenzij ze functionele informatie dragen; voldoende contrast voor eventuele tekst-over-foto (donker overlay indien nodig).

**Wanneer wel**: uitsluitend op de publieke, merkgerichte momenten (homepage-hero) — en alleen met echte, aangeleverde beeldbank-foto's (zie [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) §Ontbreekt: `Brand/images/` is nu leeg — dit onderdeel wacht op aanlevering, er wordt hier geen foto-inhoud verzonnen).

**Wanneer niet**: nooit stockfoto-achtige sfeerbeelden in functionele/data-schermen (zoeken, artikelen, beheer) — daar leidt het af van de taak.

---

## 38. Gebruik van de MijnLeerlijn-gradient

**Doel**: het meest herkenbare merkaccent bewust en spaarzaam inzetten, zonder de "rustige, professionele" werkinterface te verstoren.

**Uiterlijk**: de vaste 45°-regenbooggradient (blauw→groen→geel→oranje→rood, letterlijk uit het brandbook) verschijnt als: (1) een **dunne accentbalk** (4–6px) direct onder de header op publieke schermen, en tussen grote secties op de homepage-hero — de meest gebruikte, terughoudende toepassing; (2) **zelden**, als vol vlak-achtergrond, uitsluitend op sterk marketing-achtige, low-frequency momenten die dicht bij de brandbook-voorbeeldpagina's liggen (bijv. een eventuele welkomst-/introductiepagina voor een nieuwe variant) — nooit op schermen die de gebruiker herhaaldelijk bezoekt voor taakgericht werk.

**Gedrag**: statisch, geen geanimeerde/bewegende gradient (zou de rust doorbreken en snel afleidend/gedateerd aanvoelen).

**Afmetingen**: accentbalk 4–6px hoog, volle breedte van het element waaronder hij staat.

**Varianten**: accentbalk (meest gebruikt), vol-vlak (zeldzaam, marketing-achtig), gebruikt in het beeldmerk zelf (het L-logo, altijd als vaste asset, nooit los "nagemaakt" met eigen kleurstops).

**Toegankelijkheid**: gradient nooit als achtergrond direct achter lopende tekst (contrast is over de breedte van een regenbooggradient onmogelijk consistent AA-conform te houden); tekst op een gradient-vlak altijd in een effen, voldoende contrasterend kader/overlay (zoals in de brandbook-voorbeeldpagina's, waar tekst in een wit kader op de gradient staat).

**Wanneer wel**: header-accentbalk (elk publiek scherm, subtiel, consistent), homepage-hero (spaarzaam, prominent maar begrensd).

**Wanneer niet**: nooit in de beheeromgeving/CMS (zie §20); nooit als achtergrond van een lijst, tabel, formulier of ander taakgericht scherm; nooit herhaald op elk scherm in volle kracht — dat zou het accent uithollen tot ruis.

---

## 39. Gebruik van witruimte

**Doel**: rust en leesbaarheid — de belangrijkste, meest onderschatte drager van de gewenste "rustige, professionele" toon.

**Uiterlijk**: ruime marges rond content-blokken, generieuze afstand tussen ongerelateerde secties (zie afstandsschaal, §3), geen verdichting van elementen puur om "meer op het scherm te passen".

**Gedrag**: witruimte schaalt bewust mee met schermformaat (meer marge op grote schermen, niet hetzelfde vaste aantal pixels overal) — zie §2/§4.

**Afmetingen**: zie afstandsschaal in Designtokens; vuistregel: hoe belangrijker/prominenter een element (bijv. een primaire CTA of paginatitel), hoe meer geïsoleerde witruimte eromheen.

**Varianten**: "comfortabel" (publiek, meer witruimte, prioriteit leesbaarheid) vs. "compact" (CMS/data-dichte schermen, minder maar nog steeds bewuste witruimte) — zie §3.

**Toegankelijkheid**: voldoende witruimte rond tikdoelen voorkomt per-ongeluk-tikken op naastgelegen elementen (mede-bepalend voor de 44×44px-tikdoelregel, zie §7).

**Wanneer wel**: overal — witruimte is nooit "verspilde ruimte" in dit ontwerpsysteem.

**Wanneer niet**: witruimte nooit gebruiken om een gebrek aan inhoud/structuur te verbergen (een leeg scherm met veel witruimte is nog steeds een lege staat, zie §16 — dat lost het probleem niet op, het maskeert het).

---

## 40. Componentvarianten

**Doel**: overzicht van hoe componenten systematisch variëren, zodat een designer nooit een "eenmalige" ad-hoc variant hoeft te verzinnen.

**Uiterlijk**: elke component in dit document kent maximaal deze variatie-assen, consistent toegepast: **grootte** (compact/standaard/groot, zie §3), **nadruk** (primair/secundair/tertiair/destructief, zie §7), **status** (default/hover/focus/actief/disabled/laden, zie §32–§34), **context** (publiek/beheer, zie §20/§27).

**Gedrag**: een nieuwe variant van een bestaand component (bijv. een nieuw badge-type) moet passen binnen deze vier assen — niet een geheel nieuwe stijl introduceren.

**Afmetingen**: zie de per-component secties hierboven voor concrete maten per grootte-variant.

**Varianten (samenvattend overzicht)**:
- **Knoppen** (§7): primair/secundair/tertiair/destructief × compact/standaard/groot × met/zonder icoon
- **Badges/labels** (§15, §22): succes/tip/waarschuwing/fout/info/neutraal, elk met vaste kleur+icoon-koppeling
- **Kaarten** (§12): categorie/update/gerelateerd/AI-teaser, alle op dezelfde basis-kaartstijl
- **Content-blokken** (§11): 8 vaste typen, 1:1 met `ContentBlock.type` in [DATA-MODEL.md](DATA-MODEL.md), plus de "aanvulling"-overlay-variant voor `VariantOverride`-acties
- **Meldingen** (§15): inline/banner/toast × succes/fout/waarschuwing/info
- **Navigatie** (§24–§27): publiek/beheer × desktop/mobiel

**Toegankelijkheid**: elke variant behoudt dezelfde toegankelijkheidsgaranties als de basisvariant (focus-ring, contrast, aria-labels) — variatie in uiterlijk mag nooit variatie in toegankelijkheid betekenen.

**Wanneer wel**: een nieuwe variant toevoegen wanneer een echt nieuw functioneel scenario dat vraagt (bijv. een nieuw bloktype in een toekomstige contentmodel-uitbreiding).

**Wanneer niet**: nooit een eenmalige, scherm-specifieke stijlafwijking maken "omdat het net iets beter past" op dat ene scherm — dat ondermijnt de consistentie die dit hele document borgt. Elke afwijking gaat via een update van dit document, niet via een lokale uitzondering.
