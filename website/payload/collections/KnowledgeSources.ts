import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Ruwe kennisbronnen (PDF/video/website/release notes/handleidingen/FAQ's/
// interne documenten) die de AI kan uitlezen, samenvatten en koppelen aan
// conceptkennisartikelen — zie lib/knowledge/index-source.ts (de enige plek
// die de AI-velden hieronder schrijft, via app/api/knowledge/index) en
// payload/collections/KnowledgeDrafts.ts (het veld `knowledgeSources` daar
// is de omgekeerde kant van `knowledgeDrafts` hieronder).
//
// Bewust GEEN nieuwe entiteit in docs/DATA-MODEL.md — net als
// payload/collections/Sources.ts (citeerbaar bronmateriaal voor
// artikel-bronvermelding) is dit een aparte, expliciet toegevoegde collectie
// naast het canonieke model, met een ander doel: Sources.ts is redactionele
// citatiemetadata, deze collectie is de INVOER voor de AI-indexeerpijplijn
// (ruwe inhoud → samenvatting/trefwoorden/categorie/hoofdstukken).
//
// Sprint 4 (embeddings): `embedding` slaat TIJDELIJK de ruwe vector zelf op
// (JSON-array, geen pgvector) — zie lib/embeddings/. Zodra een echte
// vectorstore/pgvector-koppeling wordt gebouwd, is dit veld het enige dat
// vervangen hoeft te worden; `embeddingStatus`/`embeddedAt`/`embeddingModel`/
// `embeddingTextHash` blijven ongewijzigd bruikbaar. `embeddingTextHash` is
// een sha256 van de exact geëmbedde tekst — lib/embeddings/process-embedding.ts
// vergelijkt dit bij elke embed-aanroep met de actueel berekende hash om te
// bepalen of een bron al up-to-date is (skip) of opnieuw geëmbed moet worden
// (bv. na een gewijzigde PDF).
//
// Bewust volledig admin-only, zelfde reden als KnowledgeDrafts/SupportThreads:
// dit kan onbeoordeelde, AI-gegenereerde inhoud bevatten. Aanmaken (nieuwe
// bron toevoegen, PDF uploaden) mag wél via de normale admin-UI — dat is
// precies hoe "PDF uploaden"/"URL toevoegen" uit de opdracht werkt, zonder
// een aparte upload-knop nodig te hebben.
export const KnowledgeSources: CollectionConfig = {
  slug: "knowledge-sources",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "status", "aiIndexedAt"],
    group: "Beheer",
    description:
      "Kennisbronnen voor de AI (PDF's, video's, websites, release notes, handleidingen, FAQ's, interne documenten). Toevoegen via 'Create new'; indexeren via de knop hierboven in de lijst.",
    components: {
      // "Synchroniseer handleidingen" staat bewust NIET in listMenuItems
      // hieronder: dat rendert alleen binnen het ingeklapte "⋮"-popupmenu
      // van de lijst (zie node_modules/@payloadcms/ui/dist/elements/
      // ListControls/index.js — listMenuItems wordt in een <Popup>/<Dots>
      // gestopt), niet als direct zichtbare knop. Voor deze knop is dat
      // niet duidelijk genoeg (opdracht: "duidelijke knop"), dus die
      // gebruikt in plaats daarvan beforeListTable — een officieel
      // ondersteund extensiepunt (CollectionAdminOptions['components'] in
      // payload/dist/collections/config/types.d.ts) dat altijd direct
      // zichtbaar boven de documententabel rendert, zie
      // node_modules/@payloadcms/ui/dist/views/List/index.js.
      beforeListTable: [
        "@/payload/components/SyncManualsButton#SyncManualsButton",
        // Zelfde reden om buiten listMenuItems te staan als hierboven — dit
        // herstelt een storing (bv. de "Kon PDF niet ophalen (HTTP 403)"-
        // fout van vóór een private-Blob-signing-fix) en moet dus direct
        // zichtbaar zijn, niet weggestopt in het "⋮"-menu.
        "@/payload/components/RepairFailedSourcesButton#RepairFailedSourcesButton",
      ],
      // "Indexeer geselecteerde bronnen" — dekt ook herindexeren: een reeds
      // geïndexeerde bron opnieuw selecteren en klikken verwerkt 'm gewoon
      // opnieuw, zie lib/knowledge/run-indexing.ts. "Maak embeddings" is de
      // Sprint 4-tegenhanger (zie lib/embeddings/) — hetzelfde knop-component
      // wordt hergebruikt op knowledge-drafts en articles. Deze twee vereisen
      // een selectie en horen daarom wél in het "⋮"-menu (secundaire acties).
      listMenuItems: [
        "@/payload/components/IndexSelectedSourcesButton#IndexSelectedSourcesButton",
        "@/payload/components/MaakEmbeddingsButton#MaakEmbeddingsButton",
      ],
    },
  },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    { name: "title", type: "text", required: true, label: "Titel" },
    {
      name: "type",
      type: "select",
      required: true,
      defaultValue: "pdf",
      label: "Type",
      options: [
        { label: "PDF", value: "pdf" },
        { label: "Video", value: "video" },
        { label: "Website", value: "website" },
        { label: "Release notes", value: "release_notes" },
        { label: "Handleiding", value: "handleiding" },
        { label: "FAQ", value: "faq" },
        { label: "Intern document", value: "intern_document" },
      ],
    },
    {
      // Prioriteit voor de AI-assistent's zoekresultaten — bepaalt NOG NIET
      // het daadwerkelijke zoekgedrag (dat blijft lib/embeddings/
      // similarity-search.ts, bewust ongewijzigd hier); dit veld legt
      // uitsluitend de classificatie vast die een latere zoeklogica-wijziging
      // kan gebruiken. Bestaande bronnen krijgen automatisch "core": de
      // migratie zet de kolom met een DEFAULT 'core' NOT NULL neer, dus
      // bestaande rijen worden bij het toevoegen van de kolom al met "core"
      // gevuld — geen losse backfill-stap nodig.
      name: "priority",
      type: "select",
      required: true,
      defaultValue: "core",
      label: "Prioriteit",
      options: [
        { label: "Kerninhoud", value: "core" },
        { label: "Aanvullende inhoud", value: "secondary" },
        { label: "Achtergrondinformatie", value: "reference" },
      ],
      admin: {
        description:
          "Kerninhoud: belangrijkste handleidingen met praktische instructies. Aanvullende inhoud: uitsluitend als aanvulling. Achtergrondinformatie: laagste zoekprioriteit. Wordt nog niet gebruikt door de zoeklogica zelf.",
      },
    },
    {
      name: "file",
      type: "upload",
      relationTo: "media",
      label: "Bestand",
      admin: {
        description: "Verplicht voor type PDF — het document dat de AI uitleest.",
        condition: (_d, s) => s?.type === "pdf",
      },
    },
    {
      name: "url",
      type: "text",
      unique: true,
      label: "URL",
      admin: {
        description:
          "Voor alle typen behalve PDF: link naar de video, website, release notes, handleiding, FAQ of het interne document. Alternatief voor 'Directe inhoud' hieronder — vul één van beide in.",
        condition: (_d, s) => s?.type !== "pdf",
      },
    },
    {
      // Alternatief voor `url` bij bronnen die niet online staan — met name
      // interne achtergronddocumenten (zie lib/knowledge/index-source.ts: als
      // dit veld gevuld is, wordt de tekst rechtstreeks gebruikt en wordt er
      // NIET van een URL gefetcht). Bewust géén los "docx-parser"-onderdeel
      // toegevoegd aan de indexeerpijplijn: brontekst uit Word/andere
      // formaten wordt vooraf (net als bij payload/import-handleidingen/data/)
      // omgezet naar platte tekst en hier geplakt, of het brondocument wordt
      // als PDF geüpload via het type "PDF" hierboven.
      name: "content",
      type: "textarea",
      label: "Directe inhoud",
      admin: {
        description:
          "Alternatief voor URL: tekst die niet online staat rechtstreeks plakken (bv. een intern achtergronddocument). Gevuld = deze tekst wordt gebruikt, er wordt dan niet van de URL gefetcht.",
        condition: (_d, s) => s?.type !== "pdf" && s?.type !== "video",
      },
    },
    {
      // "Bronrol" voor de AI-assistent — ANDERS dan `type` hierboven: `type`
      // is de redactionele categorie/hoe-de-inhoud-wordt-opgehaald, `purpose`
      // is de rol die deze bron speelt bij het oplossen van een conflict
      // tussen bronnen (zie lib/embeddings/similarity-search.ts,
      // bepaalBronrol()). Optioneel: leeg = automatisch afgeleid van `type`
      // (handleiding/pdf/website → manual, release_notes → release-note,
      // faq → faq, intern_document → background-model). Alleen invullen om
      // die automatische afleiding te overschrijven.
      name: "purpose",
      type: "select",
      label: "Bronrol (purpose)",
      options: [
        { label: "Achtergrondmodel (visie/samenhang)", value: "background-model" },
        { label: "Handleiding (concrete stappen)", value: "manual" },
        { label: "Release note (actuele wijziging)", value: "release-note" },
        { label: "FAQ", value: "faq" },
        { label: "Support (uit supportthreads)", value: "support" },
      ],
      admin: {
        description:
          "Rol van deze bron bij het oplossen van een conflict tussen bronnen. Leeg = automatisch afgeleid van het type. Zie het commentaar in lib/embeddings/similarity-search.ts voor de precieze conflictvolgorde.",
      },
    },
    {
      // Zelfde patroon als Articles.ts's `variantContext` — leeg/central is
      // de standaard voor vrijwel alle huidige kennisbronnen (er is nog geen
      // écht werkende tweede variant, zie docs/TODO.md). Uitsluitend metadata
      // hier: er is BEWUST geen variant-gefilterde retrieval-logica gebouwd
      // (buiten scope van deze opdracht, "geen nieuwe varianten") — dit veld
      // legt alleen vast welke bronnen straks, zodra dat wél gebouwd wordt,
      // als centraal/variant-specifiek geteld moeten worden.
      name: "variantContext",
      type: "relationship",
      relationTo: "variants",
      hasMany: true,
      label: "Variantcontext",
      admin: {
        description:
          "Leeg = centraal, relevant voor alle varianten (standaard). Ingevuld = deze bron is uitsluitend bedoeld voor de gekozen variant(en). Nog niet gebruikt door de retrieval zelf — puur classificatie, zie het commentaar hiernaast.",
      },
    },
    {
      // Sprint 6 (lib/knowledge/sync-manuals.ts, POST /api/knowledge/sync-manuals):
      // repository-relatief pad (t.o.v. de website/-map, bv.
      // "handleidingen/Analyse.pdf") van bronnen die automatisch uit de
      // handleidingen/-map zijn gesynchroniseerd. Uniek zodat herhaald
      // synchroniseren van hetzelfde bestand altijd dezelfde bron bijwerkt
      // (nooit een duplicaat aanmaakt) — leeg/null voor handmatig
      // aangemaakte bronnen (meerdere NULLs zijn toegestaan in een
      // Postgres-unique-index, zelfde patroon als het veld `url` hierboven).
      name: "sourceFilePath",
      type: "text",
      unique: true,
      label: "Bestandspad (repository)",
      admin: {
        readOnly: true,
        description: "Alleen voor automatisch gesynchroniseerde bronnen — zie lib/knowledge/sync-manuals.ts.",
      },
    },
    {
      // Sha256 van de ruwe bestandsinhoud (NIET van de AI-samenvatting —
      // vergelijk embeddingTextHash verderop, dat is iets anders). Bepaalt
      // of een bestand inhoudelijk gewijzigd is (herindexeren nodig) en
      // detecteert content-duplicaten onder een andere bestandsnaam (bv.
      // "Analyse.pdf" vs. "Analyse (1).pdf") — bij een hash-match op een
      // ANDER bestandspad wordt nooit een nieuwe bron aangemaakt.
      name: "sourceFileHash",
      type: "text",
      unique: true,
      label: "Bestandshash (sha256)",
      admin: { readOnly: true, hidden: true },
    },
    { name: "description", type: "textarea", label: "Omschrijving" },
    { name: "tags", type: "text", hasMany: true, label: "Tags" },
    {
      name: "transcript",
      type: "textarea",
      label: "Transcript",
      admin: {
        description:
          "Voor video's: handmatig plakken, of automatisch opgehaald als de video-URL rechtstreeks naar platte tekst/VTT/SRT verwijst (zie lib/knowledge/video.ts). Blijft leeg als ophalen niet eenvoudig mogelijk was.",
        condition: (_d, s) => s?.type === "video",
      },
    },
    {
      name: "chapters",
      type: "array",
      label: "Hoofdstukken",
      labels: { singular: "Hoofdstuk", plural: "Hoofdstukken" },
      admin: {
        readOnly: true,
        description: "Alleen voor PDF's — automatisch herkend en samengevat door de AI.",
      },
      fields: [
        { name: "title", type: "text", required: true, label: "Hoofdstuktitel" },
        { name: "summary", type: "textarea", required: true, label: "Samenvatting" },
        { name: "order", type: "number", required: true, label: "Volgorde" },
        {
          name: "embedding",
          type: "json",
          label: "Hoofdstuk-embedding (tijdelijk)",
          admin: { readOnly: true, hidden: true },
        },
        {
          name: "embeddingTextHash",
          type: "text",
          label: "Hash van geëmbede hoofdstuktekst",
          admin: { readOnly: true, hidden: true },
        },
      ],
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "new",
      label: "Status",
      options: [
        { label: "Nieuw", value: "new" },
        { label: "Bezig met indexeren", value: "indexing" },
        { label: "Geïndexeerd", value: "indexed" },
        { label: "Fout", value: "error" },
      ],
      admin: {
        readOnly: true,
        description: "Wordt uitsluitend gezet door de indexeerroute — nooit handmatig aanpassen.",
      },
    },
    {
      name: "indexError",
      type: "textarea",
      label: "Foutmelding",
      admin: {
        readOnly: true,
        description:
          "Alleen gevuld bij status 'Fout' — technische reden, nooit brontekst of persoonsgegevens.",
      },
    },
    { name: "aiSummary", type: "textarea", label: "AI-samenvatting", admin: { readOnly: true } },
    { name: "aiKeywords", type: "text", hasMany: true, label: "AI-trefwoorden", admin: { readOnly: true } },
    {
      name: "aiCategory",
      type: "text",
      label: "AI-categorie (voorstel)",
      admin: {
        readOnly: true,
        description:
          "Vrije tekst, net als KnowledgeDrafts.category — nog geen koppeling aan de echte taxonomie.",
      },
    },
    { name: "aiModel", type: "text", label: "AI-model", admin: { readOnly: true } },
    { name: "aiIndexedAt", type: "date", label: "Geïndexeerd op", admin: { readOnly: true } },
    {
      name: "knowledgeDrafts",
      type: "relationship",
      relationTo: "knowledge-drafts",
      hasMany: true,
      label: "Gekoppelde conceptkennisartikelen",
      admin: {
        readOnly: true,
        description:
          "Concepten die deze bron als onderbouwing gebruiken — automatisch gekoppeld bij het indexeren.",
      },
    },
    {
      name: "embeddingStatus",
      type: "select",
      required: true,
      defaultValue: "pending",
      label: "Embedding-status",
      options: [
        { label: "In afwachting", value: "pending" },
        { label: "Geïndexeerd (vector)", value: "indexed" },
        { label: "Verouderd", value: "stale" },
      ],
      admin: {
        readOnly: true,
        description:
          "Wordt gezet door POST /api/knowledge/embed (lib/embeddings/process-embedding.ts) — LET OP: dit is iets anders dan het veld 'Status' hierboven (dat gaat over de AI-samenvatting uit Sprint 3, niet over embeddings).",
      },
    },
    { name: "embeddedAt", type: "date", label: "Geëmbed op", admin: { readOnly: true } },
    {
      name: "embeddingModel",
      type: "text",
      label: "Embedding-model",
      admin: { readOnly: true, description: "Bv. text-embedding-3-small — zie services/ai-client.ts." },
    },
    {
      name: "embeddingTextHash",
      type: "text",
      label: "Hash van geëmbede tekst",
      admin: {
        readOnly: true,
        hidden: true,
        description: "Sha256 van titel+samenvatting+trefwoorden+categorie — bepaalt of herembedden nodig is.",
      },
    },
    {
      name: "embedding",
      type: "json",
      label: "Embedding-vector (tijdelijk)",
      admin: {
        readOnly: true,
        hidden: true,
        description:
          "Tijdelijke ruwe vectoropslag (JSON-array) zolang er geen externe vectorstore/pgvector is — zie het commentaar bovenaan dit bestand. Nooit rechtstreeks tonen/bewerken in de admin-UI.",
      },
    },
  ],
};
