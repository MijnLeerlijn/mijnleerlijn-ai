# SECURITY-AND-PRIVACY.md — Beveiliging & privacy

> **Let op**: dit document bevat een **technisch startvoorstel**, geen juridisch advies of definitief beleid. Exacte juridische teksten (privacyverklaring, voorwaarden) worden later aangeleverd namens sCoolsuite B.V. en mogen hier niet worden verzonnen. Bewaartermijnen hieronder zijn een concreet uitgangspunt voor de techniek, geen vastgesteld juridisch besluit.

## Reikwijdte & juridische context

- **Juridische entiteit**: MijnLeerlijn is onderdeel van **sCoolsuite B.V.** Deze entiteit is verantwoordelijk voor privacyverklaring, voorwaarden, verwerking van contactaanvragen, en eventuele overeenkomsten met externe leveranciers (AI-provider, opslag, e-mail).
- **Wettelijk kader**: AVG/GDPR (Nederland/EU). Dit document beschrijft de technische en procesmatige inrichting die AVG-conform gedrag **mogelijk maakt** — de formele juridische grondslag en definitieve bewaartermijnen worden apart vastgesteld.
- **sCoolsuite B.V.** hoeft niet prominent in de hoofdinterface te staan, maar komt terug in de footer en op juridische pagina's (zie [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)).

## Gegevensinventarisatie

| Gegevenstype | Waar verzameld | Bevat persoonsgegevens? |
|---|---|---|
| Contactmelding (naam leerkracht, school, e-mail, probleemomschrijving) | Contactformulier | Ja |
| Bijlagen/screenshots | Contactformulier | Mogelijk (zie waarschuwing hieronder) |
| AI-vraaglogs (vraag, opgehaalde blok-ID's, variant) | AI-assistent | Beperkt — anoniem tenzij gebruiker inlogt (niet van toepassing in v1, publiek zonder login) |
| Server/toegangslogs | Infrastructuur | Beperkt (IP-adres, technisch) |
| Content-audit-log (wie wijzigde wat, wanneer) | Beheeromgeving | Ja, maar betreft redacteuren/beheerders, geen eindgebruikers — andere bewaarlogica, zie hieronder |

**Nadrukkelijk buiten scope van gegevensverzameling**: leerlinggegevens en medische persoonsgegevens horen niet in het contactformulier thuis (zie hieronder).

## Bewaartermijnen (technisch startvoorstel — juridisch nog te beoordelen)

| Gegevenstype | Voorgestelde bewaartermijn | Toelichting |
|---|---|---|
| Contactmelding (tekstvelden) | 12 maanden na afhandeling, 24 maanden indien onopgelost/vervolg nodig | Ticketstatus stuurt dit |
| Bijlagen/screenshots | 90 dagen na indiening | Verwijderd **ongeacht** ticketstatus — helpdesk moet zelf iets langer nodig relevants naar het eigen casesysteem downloaden |
| AI-vraaglogs | 6 maanden, na 30 dagen geanonimiseerd/geaggregeerd voor kwaliteitsanalyse | Nodig voor het bijstellen van de betrouwbaarheidsdrempel, zie [AI-KNOWLEDGE-STRATEGY.md](AI-KNOWLEDGE-STRATEGY.md) |
| Server-/toegangslogs | 30 dagen | Standaard operationeel/beveiligingsvenster |
| Content-audit-log | Onbeperkt | Bedrijfsadministratie over contentwijzigingen, geen persoonsgegevens van eindgebruikers — andere logica dan gebruikersdata |

Deze tabel is een **startpunt voor implementatie**, geen vastgesteld beleid — definitieve termijnen en de juridische grondslag volgen apart.

## Browser/apparaat-informatie

Alleen een **grove, herkenbare categorie** wordt vastgelegd bij een contactmelding, bijvoorbeeld:
- "Chrome op desktop"
- "Safari op iPhone"

**Nooit**: volledige user-agent strings, IP-gebaseerde locatiebepaling, of enige vorm van device fingerprinting. Dit veld dient uitsluitend om de helpdesk te helpen een probleem te reproduceren, niet om gebruikers te identificeren of te volgen.

## Opslag & toegang bijlagen

- Uploads gaan rechtstreeks naar **privé object-opslag** (bijv. Vercel Blob in privé-modus, of S3/R2 met een kortlevende, door de server uitgegeven signed-upload-URL) — **nooit** via een publiek toegankelijk pad of CDN.
- Ophalen door de helpdesk gebeurt via een kortlevende, server-gegenereerde signed-download-URL op het moment dat een melding wordt geopend — geen permanente publieke link.
- Bestanden landen in een "quarantaine"-locatie; een geplande taak verwijdert ze volgens de bewaartermijn hierboven, **ongeacht** of iemand daaraan denkt — bewaring wordt door infrastructuur afgedwongen, niet door een handmatig proces.

**Waarschuwing aan gebruikers** (verplicht zichtbaar bij omschrijving en bestandsupload): voer geen leerling-persoonsgegevens of medische gegevens in en upload geen screenshots waarin die zichtbaar zijn. Deze waarschuwing is een noodzakelijke maar **onvoldoende** waarborg op zichzelf — screenshots bevatten in de praktijk vaak onbedoeld leerlinggegevens. De technische maatregelen hierboven (privé opslag, korte bewaartermijn, geen publieke links) zijn het eigenlijke vangnet.

## Verwijderen op verzoek

Eén samenhangende actie (beheerhandeling, bij MVP-schaal eventueel een gedocumenteerd handmatig proces) die, gegeven een e-mailadres of melding-ID, in samenhang verwijdert:
1. De contactmelding (tekstvelden)
2. Alle gekoppelde bijlagen (direct hard verwijderd uit opslag)
3. Eventuele AI-vraaglogs gekoppeld aan die identiteit (alleen relevant als een gebruiker ooit ingelogd was — in v1 zijn publieke gebruikers anoniem)

De database-relaties (zie [DATA-MODEL.md](DATA-MODEL.md): `ContactSubmission` → `Attachment`) worden zo opgezet dat dit een enkele, samenhangende verwijderactie is, geen handmatige zoektocht door meerdere tabellen.

## Spam-/misbruikbeveiliging

- Honeypot-veld (onzichtbaar voor echte gebruikers) in het contactformulier.
- Onzichtbare bot-detectie aan de edge (bijv. Cloudflare Turnstile) — bewust **geen** klassieke beeld-captcha, die onnodige frictie geeft voor een professionele doelgroep (leerkrachten, IB'ers).
- Rate limiting per IP/sessie op formulierinzending.

## Auth- en rolmodel

- **Publiek** (kennisbank, zoeken, AI-assistent, contactformulier): geen inlog nodig in v1. De AI-assistent gebruikt een anoniem sessie-ID (cookie) uitsluitend voor gesprekscontinuïteit en eenvoudige rate limiting — niet voor tracking of identificatie.
- **Beheeromgeving**: verplichte authenticatie + rollen vanaf dag één (`editor`, `admin` — zie [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md)). Concrete oplossing (Auth.js vs. Clerk) is nog open, zie [TODO.md](TODO.md).
- **Later, niet nu gebouwd**: mogelijkheid om bepaalde content achter klant-login te zetten. Het datamodel staat dit toe zonder herstructurering (een toekomstig `accessLevel`-veld op `Article`), maar er wordt nu geen klant-authenticatielaag gebouwd.

## Audit-logging

Zie [DATA-MODEL.md](DATA-MODEL.md) `AuditLog` en [CMS-AND-EDITORIAL-WORKFLOW.md](CMS-AND-EDITORIAL-WORKFLOW.md). Vastgelegd: contentwijzigingen, override-wijzigingen, variant-beheer, rolwijzigingen, publicatie-/terugzetacties, verwijderverzoeken. Dit betreft bedrijfsadministratie over redacteuren/beheerders, met een andere (in principe onbeperkte) bewaarlogica dan persoonsgegevens van eindgebruikers.

## Incidentrespons (placeholder)

Nog uit te werken vóór livegang: contactpersoon/proces bij een datalek, meldplicht-stappen richting Autoriteit Persoonsgegevens waar van toepassing, en een intern draaiboek. Dit wordt aangevuld zodra de juridische kaders vanuit sCoolsuite B.V. bekend zijn — expliciet gemarkeerd als **open punt**, zie [TODO.md](TODO.md).
