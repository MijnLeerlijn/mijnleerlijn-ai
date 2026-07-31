# Changelog

Bijgehouden vanaf 2026-07-31. Beschrijft gebruikers-/beheerder-zichtbare wijzigingen en de belangrijkste onderliggende fixes; geen volledige commit-geschiedenis (zie git log daarvoor).

## 2026-07-31

### Fix: variantlogo-upload en -weergave

- **Probleem**: het uploaden van een logo voor een variant (of een gewone media-upload, of een screenshot in de Handleidingbouwer) gaf de generieke foutmelding "Something went wrong." en sloeg niet op.
- **Oorzaak**: de gebruikte opslag-plugin (`@payloadcms/storage-vercel-blob`) ondersteunde uitsluitend publiek toegankelijke bestandsopslag, terwijl de Blob-store van dit project bewust privé is. Elke gewone Payload-upload naar de Media-collectie botste daardoor structureel op deze store.
- **Oplossing**: een nieuwe, uniforme private-uploadarchitectuur voor de Media-collectie, gebaseerd op dezelfde al bestaande, beproefde private-opslagmethode die Downloadbeheer's PDF-upload al gebruikte. Media-bestanden zijn voortaan overal bereikbaar via één stabiele URL (`/api/media/{id}`), die achter de schermen een kortlevende, veilige link naar het bestand opvraagt — een privé-opslagadres komt nooit rechtstreeks in de publieke pagina's terecht.
- **Tweede deel**: nadat uploaden weer werkte, verscheen een nieuw geüpload variantlogo nog niet op de publieke pagina. Oorzaak was geen bug, maar een ontbrekende stap: het uploaden van een bestand slaat de variant zelf nog niet op — daarvoor is een aparte "Opslaan" op het varianteditscherm nodig. Bevestigd en opgelost door de koppeling alsnog op te slaan; de volledige weergaveketen (opslag → variantdata → paginaweergave) is end-to-end geverifieerd.
- **Geverifieerd in productie**: MijnMonti toont zijn eigen logo; MijnLeerlijn en varianten zonder eigen logo vallen correct terug op het standaardlogo; bestaande PDF-downloads (Downloadbeheer) bleven ongewijzigd werken; geen enkele privé-opslag-URL is zichtbaar in de publieke HTML.
