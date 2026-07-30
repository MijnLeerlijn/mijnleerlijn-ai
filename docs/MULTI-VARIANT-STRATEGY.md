# MULTI-VARIANT-STRATEGY.md — Varianten

> Zie [DATA-MODEL.md](DATA-MODEL.md) voor het `Variant`-model en [ARCHITECTURE.md](ARCHITECTURE.md) voor het herkenningsmechanisme. Dit document beschrijft het concept, de levenscyclus en hoe je een nieuwe variant toevoegt.

## Variant-concept & terminologie

Een **variant** is een configuratie van dezelfde onderliggende software en kennisbank onder een ander merk, gericht op een ander onderwijsconcept. Een variant is **geen** aparte website, geen aparte codebase en geen kopie van de content. Wat een variant uniek maakt, staat volledig in het `Variant`-record en in `VariantOverride`-records (zie [DATA-MODEL.md](DATA-MODEL.md)):

- Productnaam, logo, accentkleur ("branding")
- Domein of subdomein (of tijdelijk: een slug-pad)
- Onderwijstype (bijv. montessori, dalton, vrijeschool)
- Terminologie-woordenboek
- Content-afwijkingen (aanvullingen, vervangingen, uitsluitingen, eigen media) per sectie/stap/blok

**Huidige en verwachte varianten:**

| Variant | Onderwijstype | Merkstatus |
|---|---|---|
| MijnLeerlijn | algemeen | Volledig — brandbook in `Brand/`, leidend |
| MijnMonti | montessori | Tweede MVP-variant; merkbestanden volgen later, tot dan placeholder (zie hieronder) |
| MijnD | dalton | Verwacht jaar 1, nog geen merkbestanden |
| Vrijeschool-variant | vrijeschool (Steiner) | Verwacht jaar 1, **merknaam nog niet vastgesteld** — behandeld als configureerbare variant zonder definitieve naam (werktitel volstaat) |
| Toekomstige varianten | — | Geen vast maximum; de architectuur mag hier niet op begrensd zijn |

## Domein/subdomein/slug-regels

Zie [ARCHITECTURE.md](ARCHITECTURE.md) §Variant-herkenningsmechanisme voor de technische uitwerking. Samengevat, in volgorde van voorkeur:

1. **Eigen domein** (bijv. `help.mijnmonti.nl`) — einddoel per variant.
2. **Subdomein** (bijv. `mijnmonti.mijnleerlijn.nl`) — tussenstap wanneer een eigen domein nog niet geregeld is.
3. **Pad-gebaseerde slug** (bijv. `help.mijnleerlijn.nl/mijnmonti`) — expliciet **tijdelijk**, bedoeld om een variant meteen te kunnen simuleren/testen zonder op DNS te wachten.

Elke variant heeft een `domainStatus`-veld dat deze fase bijhoudt. Bij het promoveren van slug → subdomein → eigen domein zijn **verplichte redirects** onderdeel van de migratie, zodat eerder gedeelde links (bijv. een bookmark van een leerkracht, of een link in een e-mail) blijven werken.

## Levenscyclus van een variant

```
concept  →  configureren  →  actief  →  (domeinmigratie: slug → subdomein → eigen domein)  →  gearchiveerd
```

1. **Concept**: variant aangemaakt in de beheeromgeving met minimaal naam, slug en onderwijstype. Nog niet zichtbaar voor bezoekers.
2. **Configureren**: branding (ook placeholder, zie hieronder), terminologie-woordenboek, en eerste content-overrides worden ingevoerd.
3. **Actief**: variant is bereikbaar (via slug/subdomein/domein) en verschijnt in zoekresultaten/AI-antwoorden voor die variant.
4. **Domeinmigratie**: optioneel, wanneer eigen domein beschikbaar komt — met redirects.
5. **Gearchiveerd**: variant niet langer actief; content en overrides blijven bewaard (geen destructieve verwijdering) voor het geval de variant terugkeert.

## Branding- en terminologiemodel

- **Branding is nooit verplicht compleet** om een variant te kunnen aanmaken of testen — zie `branding.isPlaceholder` in [DATA-MODEL.md](DATA-MODEL.md). Ontbrekende definitieve logo's/kleuren worden **nooit stilzwijgend vervangen door aannames**: een placeholder-variant toont duidelijk (in de beheeromgeving én, indien relevant, met een subtiele markering in de preview) dat de branding nog niet definitief is.
- **Basisstijl blijft herkenbaar MijnLeerlijn** ook wanneer een variant eigen accentkleuren heeft — zie [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) §Variant-theming-mechanisme. Een variant vervangt dus nooit het volledige ontwerpsysteem, alleen accentkleur/logo/naam binnen datzelfde systeem.
- **Terminologie-woordenboek**: eenvoudige lijst van centraal begrip → variant-begrip (bijv. "leerdoel" → ander woord binnen een onderwijsconcept). Wordt automatisch toegepast op alle centrale tekst binnen die variant (zie [CONTENT-MODEL.md](CONTENT-MODEL.md)), tenzij per element uitgeschakeld.

## MijnMonti als referentievoorbeeld (MVP)

MijnMonti is de concrete tweede variant in de MVP en moet aantoonbaar het volgende laten zien (zie ook het architectuurvoorstel):

- Eigen (of duidelijk gemarkeerd tijdelijk) logo en productnaam
- Eigen URL/slug
- Aangepaste accentkleur **indien beschikbaar** — anders erft de variant de MijnLeerlijn-kleur, zichtbaar gemarkeerd als "nog niet aangepast"
- Minstens één terminologie-afwijking
- Minstens één contentblok met `action = aanvullen` én minstens één met `action = vervangen`
- Minstens één afwijkend screenshot (`action = ander_medium`)
- Een AI-antwoord dat aantoonbaar de MijnMonti-context gebruikt: ander terminologiegebruik en/of een variant-specifieke aanvulling zichtbaar in het antwoord en de bronvermelding

Dit dient als de praktijktest die bewijst dat het multi-variant-model werkt vóór er meer varianten bijkomen.

## Placeholder-branding-regels

Zolang definitieve merkbestanden voor een variant ontbreken (van toepassing op MijnMonti, MijnD en de vrijeschool-variant totdat aangeleverd):

1. `branding.isPlaceholder = true` wordt gezet en blijft zichtbaar in de beheeromgeving totdat een beheerder deze bewust op `false` zet na het uploaden van definitieve bestanden.
2. Placeholder-logo: de MijnLeerlijn-woordmerktekst met de variant-productnaam erbij, geen verzonnen logo-ontwerp.
3. Placeholder-accentkleur: erft het MijnLeerlijn-kleurenpalet ([DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)) — er wordt nooit een kleur "verzonnen" die niet uit het brandbook of een aangeleverd variant-brandbook komt.
4. Content en AI-functionaliteit werken volledig ook met placeholder-branding — branding-onvolledigheid mag de functionele test van het multi-variant-model niet blokkeren.

## Nieuwe publieke functionaliteit — variant is een architectuurprincipe, geen toevoeging achteraf

**Variant is een website-breed concept, geen AI-specifieke of losse toevoeging.** Elke nieuwe publieke pagina of component moet **vanaf het begin** de actieve variant gebruiken — niet er later bij bouwen. Concreet:

- Server components roepen `getActiveVariant()` aan (`lib/variant/get-active-variant.ts`), client components gebruiken `useVariant()` (`providers/VariantProvider.tsx`) — dit zijn de **enige** centrale plekken waar variant-informatie vandaan komt. Nieuwe code bouwt nooit een eigen, parallelle manier om de actieve variant te bepalen.
- Publiek zichtbare tekst (titels, introteksten, placeholders, foutmeldingen, metadata) hoort niet hardcoded in een component te staan als de tekst per variant kan/moet verschillen — gebruik `variant.branding.productName` en/of `variant.websiteTeksten.*` (zie [DATA-MODEL.md](DATA-MODEL.md) §Variant). Interne admin-teksten, logging, databasevelden en code-comments hoeven **niet** variant-bewust te zijn.
- Content- en kennisretrieval die een nieuwe collectie introduceert die ooit variant-specifiek kan zijn, gebruikt het vaste `variantContext`-patroon (zie [DATA-MODEL.md](DATA-MODEL.md) §`variantContext`) — leeg = centraal/gedeeld, gevuld = uitsluitend die variant(en). Elke publieke zoek-/retrievalquery op zo'n collectie filtert altijd op "leeg OF bevat de actieve variant": kennis van de ene variant mag nooit doorsijpelen naar het antwoord van een andere variant.
- Hostname-/pad-resolutie (welke variant hoort bij dit verzoek) loopt uitsluitend via de `VariantResolver`-interface (`lib/variant/variant-resolver.ts`) — nieuwe code roept nooit rechtstreeks een concrete implementatie aan, zodat de resolutiestrategie later vervangen kan worden (bijv. Edge Config) zonder de rest van de applicatie te wijzigen.
- De standaardvariant (MijnLeerlijn) blijft altijd bereikbaar: elke nieuwe plek die de actieve variant bepaalt, moet bij een niet-gevonden of niet-actieve standaardvariant terugvallen op de vaste `defaultVariant` (`config/variants.ts`) in plaats van de publieke site te laten breken. Voor elke andere variant geldt dit expliciet **niet** — die mag zichtbaar falen bij een configuratiefout.

## Nieuwe variant toevoegen (stappenplan voor redacteuren)

1. Maak een nieuwe `Variant` aan in de beheeromgeving: naam, slug, onderwijstype.
2. Vul branding in (of laat op placeholder staan) en het terminologie-woordenboek.
3. Bepaal welke centrale artikelen relevant zijn; voeg alleen overrides toe waar de variant daadwerkelijk afwijkt (zie [CONTENT-MODEL.md](CONTENT-MODEL.md)) — kopieer nooit een volledige handleiding.
4. Zet de variant op `actief` zodra de basis (branding of placeholder, minimale content-dekking) klaar is.
5. Test het AI-antwoordgedrag binnen die variant expliciet (zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) §Retrieval & variant-scoping) — controleer dat er geen content van een andere variant doorsijpelt.

**Geen redeploy of codewijziging is nodig** om deze stappen uit te voeren — dat is de kern van dit architectuurprincipe.
