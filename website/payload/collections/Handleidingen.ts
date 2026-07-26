import type { CollectionConfig } from "payload";
import {
  lexicalEditor,
  BoldFeature,
  LinkFeature,
  OrderedListFeature,
  UnorderedListFeature,
  ParagraphFeature,
} from "@payloadcms/richtext-lexical";
import { adminOnly, anyEditor, publishedOverrideOrEditor } from "../access/roles";
import { bepaalPublicatieVelden } from "@/lib/knowledge/handleiding-publicatie";

// Handleidingbouwer (livegang-afwerking, zie het gesprek): de PRIMAIRE bron
// voor nieuwe handleidingen — gestructureerde stappen met tekst en
// afbeeldingen, dezelfde records die zowel de publieke pagina
// (/handleidingen/[slug]) als de AI-retrieval (lib/embeddings/similarity-
// search.ts) gebruiken. Bewust ÉÉN systeem: geen aparte "chunking"-tabel
// naast de CMS-stappen.
//
// Bestaande PDF-handleidingen (KnowledgeSources) blijven ongewijzigd als
// legacy-bron werken — deze collectie komt ernaast, niet in de plaats van.
//
// GEEN Payload versions.drafts hier — dat zou dezelfde Postgres-enum-
// naamsbotsing geven die Articles.ts dwong tot het hernoemen van `status`
// naar `articleStatus` (zie het commentaar daar). Zonder versions.drafts is
// een gewoon veld `status` veilig, en dit is bewust ook geen volwaardig
// versiebeheer — alleen drie eenvoudige velden (`versie`/`gepubliceerdOp`/
// `gepubliceerdDoor`) als fundament voor later.
export const Handleidingen: CollectionConfig = {
  slug: "handleidingen",
  admin: {
    useAsTitle: "internTitel",
    defaultColumns: ["internTitel", "categorie", "status", "zichtbaarInSidebar", "laatstBijgewerkt"],
    group: "Content",
    description:
      "Handleidingen opgebouwd uit losse stappen met tekst en afbeeldingen — de opvolger van PDF-handleidingen.",
    components: {
      listMenuItems: ["@/payload/components/MaakEmbeddingsButton#MaakEmbeddingsButton"],
    },
  },
  access: {
    read: publishedOverrideOrEditor,
    create: anyEditor,
    update: anyEditor,
    delete: adminOnly,
  },
  fields: [
    { name: "internTitel", type: "text", required: true, label: "Interne titel" },
    { name: "titel", type: "text", required: true, label: "Publieke titel" },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      label: "Slug",
      admin: { description: "Voor de publieke URL: /handleidingen/{slug}" },
    },
    { name: "korteOmschrijving", type: "textarea", required: true, label: "Korte omschrijving" },
    {
      name: "categorie",
      type: "relationship",
      relationTo: "categories",
      required: true,
      label: "Categorie",
      admin: { position: "sidebar" },
    },
    {
      name: "variantContext",
      type: "relationship",
      relationTo: "variants",
      hasMany: true,
      label: "Variantcontext",
      admin: {
        position: "sidebar",
        description: "Leeg = relevant voor alle varianten (standaard).",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "concept",
      label: "Status",
      admin: { position: "sidebar" },
      options: [
        { label: "Concept", value: "concept" },
        { label: "Gepubliceerd", value: "gepubliceerd" },
        { label: "Gearchiveerd", value: "gearchiveerd" },
      ],
    },
    {
      name: "previewLink",
      type: "ui",
      label: "Preview",
      admin: {
        position: "sidebar",
        components: { Field: "@/payload/components/HandleidingPreviewLink#HandleidingPreviewLink" },
      },
    },
    {
      name: "zichtbaarInSidebar",
      type: "checkbox",
      defaultValue: false,
      label: "Zichtbaar in Handleidingen-sidebar",
      admin: {
        position: "sidebar",
        description:
          "Alleen bronnen die hier aangevinkt zijn, verschijnen voor bezoekers in de 'Handleidingen'-sidebar. Heeft geen invloed op wat de AI intern mag gebruiken om te antwoorden.",
      },
    },
    {
      name: "volgorde",
      type: "number",
      label: "Volgorde (Handleidingen-sidebar)",
      admin: {
        position: "sidebar",
        description: "Laag = hoger in de lijst binnen de categorie. Leeg = alfabetisch op titel, onderaan.",
      },
    },
    { name: "zoekwoorden", type: "text", hasMany: true, label: "Zoekwoorden" },
    {
      name: "laatstBijgewerkt",
      type: "date",
      label: "Laatst bijgewerkt",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "legacyBron",
      type: "relationship",
      relationTo: "knowledge-sources",
      label: "Gekoppelde legacy-PDF",
      admin: {
        position: "sidebar",
        description:
          "Optioneel: een bestaande PDF-handleiding die dit vervangt/aanvult. Toont een downloadlink op de publieke pagina. Geen automatische import — alleen een koppeling.",
      },
    },
    {
      name: "versie",
      type: "number",
      label: "Versie",
      admin: {
        position: "sidebar",
        readOnly: true,
        description:
          "Eenvoudige teller, geen volwaardig versiebeheer — wordt op 1 gezet bij de eerste publicatie en daarna opgehoogd bij elke volgende publicatie. Leeg zolang de handleiding nog nooit gepubliceerd is.",
      },
    },
    {
      name: "gepubliceerdOp",
      type: "date",
      label: "Gepubliceerd op",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "gepubliceerdDoor",
      type: "relationship",
      relationTo: "users",
      label: "Gepubliceerd door",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "stappen",
      type: "array",
      label: "Stappen",
      labels: { singular: "Stap", plural: "Stappen" },
      minRows: 1,
      admin: {
        description:
          "Sleep aan de rijen om te herordenen. Elke stap krijgt automatisch een vaste, permanente id die nooit verandert door herordenen of een titelwijziging — de AI verwijst naar die id, niet naar de titel.",
      },
      fields: [
        { name: "titel", type: "text", required: true, label: "Stap-titel" },
        {
          name: "uitleg",
          type: "richText",
          required: true,
          label: "Uitleg",
          editor: lexicalEditor({
            features: () => [
              ParagraphFeature(),
              BoldFeature(),
              LinkFeature(),
              UnorderedListFeature(),
              OrderedListFeature(),
            ],
          }),
          admin: {
            description:
              "Beperkte opmaak: vet, lijst, link. Wordt automatisch naar platte tekst omgezet voor de AI.",
          },
        },
        {
          name: "media",
          type: "array",
          label: "Media",
          labels: { singular: "Media-item", plural: "Media" },
          admin: {
            description:
              "Screenshots bij deze stap. Bewust 'media' genoemd (niet 'afbeeldingen') zodat hier later ook video bij kan — voor nu wordt alleen een afbeelding ondersteund.",
          },
          fields: [
            { name: "bestand", type: "upload", relationTo: "media", required: true, label: "Afbeelding" },
            { name: "onderschrift", type: "text", label: "Onderschrift" },
          ],
        },
        { name: "waarschuwing", type: "textarea", label: "Waarschuwing" },
        { name: "tip", type: "textarea", label: "Tip" },
        {
          name: "knopOfSchermnaam",
          type: "text",
          label: "Knop-/menupad/schermnaam",
          admin: { description: "Bijv. 'Beheer > Hoofdgebiedprofielen' of 'Nieuw profiel'." },
        },
        { name: "zoekwoorden", type: "text", hasMany: true, label: "Zoekwoorden" },
        {
          name: "variantContext",
          type: "relationship",
          relationTo: "variants",
          hasMany: true,
          label: "Variantcontext",
          admin: { description: "Leeg = relevant voor alle varianten." },
        },
        {
          name: "interneNotitie",
          type: "textarea",
          label: "Interne notitie",
          admin: { description: "Nooit publiek zichtbaar en nooit gebruikt in AI-antwoorden." },
        },
        {
          name: "verborgen",
          type: "checkbox",
          defaultValue: false,
          label: "Tijdelijk verbergen",
          admin: {
            description:
              "Verbergt deze stap op de publieke pagina en in AI-antwoorden, zonder hem te verwijderen.",
          },
        },
        {
          name: "embeddingStatus",
          type: "select",
          defaultValue: "pending",
          label: "Embedding-status",
          admin: { readOnly: true, hidden: true },
          options: [
            { label: "In afwachting", value: "pending" },
            { label: "Geïndexeerd", value: "indexed" },
            { label: "Verouderd", value: "stale" },
          ],
        },
        {
          name: "embeddingTextHash",
          type: "text",
          label: "Hash van geëmbede staptekst",
          admin: { readOnly: true, hidden: true },
        },
        {
          name: "embedding",
          type: "json",
          label: "Stap-embedding (tijdelijk)",
          admin: { readOnly: true, hidden: true },
        },
      ],
    },
    {
      name: "embeddingStatus",
      type: "select",
      required: true,
      defaultValue: "pending",
      label: "Embedding-status",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Wordt automatisch gezet bij publiceren — nooit handmatig aanpassen.",
      },
      options: [
        { label: "In afwachting", value: "pending" },
        { label: "Geïndexeerd", value: "indexed" },
        { label: "Verouderd", value: "stale" },
      ],
    },
    { name: "embeddedAt", type: "date", label: "Geëmbed op", admin: { position: "sidebar", readOnly: true } },
    {
      name: "embeddingModel",
      type: "text",
      label: "Embedding-model",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "embeddingTextHash",
      type: "text",
      label: "Hash van geëmbede tekst",
      admin: { readOnly: true, hidden: true },
    },
    {
      name: "embedding",
      type: "json",
      label: "Embedding-vector (tijdelijk)",
      admin: { readOnly: true, hidden: true },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc, req }) => {
        data.laatstBijgewerkt = new Date().toISOString();

        // Zie lib/knowledge/handleiding-publicatie.ts voor de kernregel
        // (los getest): alleen bij de ECHTE overgang naar "gepubliceerd"
        // worden versie/gepubliceerdOp/gepubliceerdDoor gezet.
        Object.assign(
          data,
          bepaalPublicatieVelden({
            huidigeStatus: data.status,
            vorigeStatus: originalDoc?.status,
            vorigeVersie: originalDoc?.versie,
            gebruikerId: req.user?.id,
          })
        );

        return data;
      },
    ],
    afterChange: [
      // Publiceren/bewerken triggert (her)indexeren — "pas opnieuw indexeren
      // bij publiceren, niet bij iedere toetsaanslag": embedHandleiding()
      // embed alleen als status "gepubliceerd" is (zie lib/embeddings/
      // process-embedding.ts) en slaat via de hash-vergelijking een
      // ongewijzigde stap/handleiding gewoon over, dus een save van een
      // reeds-gepubliceerde, verder ongewijzigde handleiding kost niets.
      //
      // Zelf-begrensde recursie, bewust: embedHandleiding() roept zelf
      // payload.update() aan op dit document, wat deze afterChange-hook
      // NOGMAALS triggert — de tweede aanroep vindt dan niets gewijzigd
      // (hash-skip) en doet zelf geen update meer, dus stopt daar. Geen
      // extra OpenAI-aanroepen, alleen één goedkope hash-vergelijking extra.
      async ({ doc, req }) => {
        if (doc.status !== "gepubliceerd") return;
        const { embedHandleiding } = await import("@/lib/embeddings/process-embedding");
        await embedHandleiding(req.payload, doc.id, req).catch((error) => {
          req.payload.logger.error(
            `[handleidingen:afterChange] embedHandleiding(${doc.id}) mislukt: ${error}`
          );
        });
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const { ruimHandleidingMediaOp } = await import("@/lib/knowledge/delete-handleiding");
        await ruimHandleidingMediaOp(req.payload, doc, req);
      },
    ],
  },
};
