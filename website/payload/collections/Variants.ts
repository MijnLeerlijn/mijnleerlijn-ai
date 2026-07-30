import type { CollectionAfterChangeHook, CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Multi-brand variants (2026-07-30): bij het aanmaken van een nieuwe variant
// automatisch een eigen Knowledge Source aanmaken ("Kennisbasis
// {productnaam}"), zodat een beheerder direct een plek heeft om
// variant-eigen achtergrondkennis in te vullen — zonder los, handmatig een
// bron aan te maken en de variantContext zelf te moeten instellen.
// `type: "intern_document"` is het enige type met een direct-bewerkbaar
// `content`-tekstveld (geen PDF/URL nodig); `purpose` blijft leeg — wordt
// automatisch afgeleid tot "background-model" (zie het commentaar bij
// `purpose` in KnowledgeSources.ts), exact de rol die de bestaande centrale
// "Kennisbasis MijnLeerlijn" ook speelt. Blokkerend (niet non-blocking zoals
// de publieke telling elders) — dit is een beheerdersactie, mag best iets
// langzamer zijn, maar niet stilzwijgend een halve variant achterlaten
// zonder eigen kennisbron. Geëxporteerd als losse functie (zelfde patroon
// als HelpdeskVragen.ts's vulVraagNormalizedIn) zodat dit rechtstreeks,
// zonder een echte Payload-instantie, getest kan worden.
export const maakAutomatischeKennisbron: CollectionAfterChangeHook = async ({ operation, doc, req }) => {
  if (operation !== "create") return;
  try {
    const productNaam = doc.branding?.productName || doc.name;
    await req.payload.create({
      collection: "knowledge-sources",
      overrideAccess: true,
      draft: false,
      // req meegeven is hier verplicht: zonder req draait deze geneste
      // create() in een eigen transactie, los van de nog-openstaande
      // transactie waarin deze hook wordt aangeroepen — de zojuist
      // aangemaakte variant-rij is dan voor déze insert nog niet zichtbaar,
      // wat de FK-check op variantContext (variants_id) laat mislukken.
      // Ontdekt via een echte (niet-gemockte) variant-aanmaak lokaal.
      req,
      data: {
        title: `Kennisbasis ${productNaam}`,
        type: "intern_document",
        priority: "core",
        status: "new",
        embeddingStatus: "pending",
        content: "",
        variantContext: [doc.id],
      },
    });
  } catch (error) {
    req.payload.logger.error(
      `[Variants] Aanmaken van de automatische Knowledge Source voor variant "${doc.name}" (id ${doc.id}) is mislukt: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

// Zie docs/DATA-MODEL.md §Variant en docs/MULTI-VARIANT-STRATEGY.md.
// Variant-configuratie is uitsluitend een Beheerder-bevoegdheid (zie
// docs/CONTENT-MODEL.md §Wie mag wat schrijven) — een redacteur, ook een
// centrale redacteur, mag hier nooit in schrijven.
export const Variants: CollectionConfig = {
  slug: "variants",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "slug", "status", "educationType"],
    group: "Varianten",
    description:
      "Elke onderwijsvariant (MijnLeerlijn, MijnMonti, MijnD, …) — branding, domein en terminologie.",
  },
  access: {
    read: () => true, // publiek nodig: branding, variantwissel-scherm
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      label: "Naam",
      admin: { description: "Bijv. 'MijnMonti'." },
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      label: "Slug",
      admin: { description: "Gebruikt in de pad-gebaseerde fallback-route, bijv. 'mijnmonti'." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "concept",
      label: "Status",
      options: [
        { label: "Concept", value: "concept" },
        { label: "Actief", value: "actief" },
        { label: "Gearchiveerd", value: "gearchiveerd" },
      ],
      admin: {
        description:
          "Redactionele levenscyclus. Bepaalt NIET of bezoekers deze variant kunnen bereiken — zie het 'Actief'-veld hieronder daarvoor.",
      },
    },
    {
      // Multi-brand variants (2026-07-30): los van `status` (de bredere
      // redactionele levenscyclus, concept/actief/gearchiveerd) — `actief`
      // is de ENIGE schakelaar die lib/variant/in-memory-variant-resolver.ts
      // en lib/variant/get-active-variant.ts daadwerkelijk raadplegen om te
      // bepalen of bezoekers deze variant kunnen bereiken. Bewust een apart
      // veld i.p.v. `status` te hergebruiken: voorkomt dat een toekomstige
      // wijziging aan de bredere workflow-status per ongeluk de
      // bereikbaarheid beïnvloedt. De standaardvariant (MijnLeerlijn) blijft
      // altijd bereikbaar, ook als dit veld hier per ongeluk op false komt
      // te staan — zie de expliciete uitzondering in get-active-variant.ts.
      name: "actief",
      type: "checkbox",
      defaultValue: false,
      label: "Actief",
      admin: {
        description:
          "Bepaalt of bezoekers deze variant via hostname/pad kunnen bereiken en of de Helpdesk-AI 'm gebruikt. De standaardvariant (MijnLeerlijn) blijft altijd bereikbaar, ongeacht dit veld.",
      },
    },
    {
      name: "educationType",
      type: "text",
      required: true,
      label: "Onderwijstype",
      admin: { description: "Bijv. 'algemeen', 'montessori', 'dalton', 'vrijeschool'." },
    },
    {
      name: "domain",
      type: "group",
      label: "Domein",
      fields: [
        {
          name: "type",
          type: "select",
          required: true,
          defaultValue: "slug_path",
          options: [
            { label: "Eigen domein", value: "custom_domain" },
            { label: "Subdomein", value: "subdomain" },
            { label: "Pad-gebaseerde slug", value: "slug_path" },
          ],
        },
        { name: "value", type: "text", required: true, label: "Waarde (domein/subdomein/slug)" },
        {
          name: "domainStatus",
          type: "select",
          required: true,
          defaultValue: "slug_path",
          label: "Migratiefase",
          options: [
            { label: "Pad-gebaseerde slug", value: "slug_path" },
            { label: "Subdomein", value: "subdomain" },
            { label: "Eigen domein", value: "custom_domain" },
          ],
        },
      ],
    },
    {
      name: "branding",
      type: "group",
      label: "Merk",
      fields: [
        { name: "logo", type: "upload", relationTo: "media", label: "Logo/beeldmerk" },
        {
          name: "accentColor",
          type: "text",
          required: true,
          defaultValue: "#1588c9",
          label: "Accentkleur",
          admin: {
            description:
              "Hexcode. Zolang isPlaceholder aan staat: erft het MijnLeerlijn-kleurenpalet, nooit een verzonnen kleur — zie docs/MULTI-VARIANT-STRATEGY.md §Placeholder-branding-regels.",
          },
        },
        { name: "productName", type: "text", required: true, label: "Productnaam" },
        { name: "tagline", type: "text", required: true, label: "Tagline" },
        {
          name: "isPlaceholder",
          type: "checkbox",
          defaultValue: true,
          label: "Branding is nog placeholder",
          admin: {
            description:
              "Blijft aan totdat een beheerder definitieve merkbestanden heeft geüpload en dit bewust uitzet.",
          },
        },
      ],
    },
    {
      name: "terminologyDictionary",
      type: "array",
      label: "Terminologie-woordenboek",
      labels: { singular: "Term", plural: "Termen" },
      admin: {
        description:
          "Centraal begrip → variant-begrip. Wordt automatisch toegepast op alle centrale tekst binnen deze variant.",
      },
      fields: [
        { name: "centralTerm", type: "text", required: true, label: "Centraal begrip" },
        { name: "variantTerm", type: "text", required: true, label: "Variant-begrip" },
      ],
    },
    {
      // Multi-brand variants (2026-07-30): elk veld hier is optioneel — leeg
      // blijft leeg in de database, geen verplichte duplicatie. De fallback
      // naar de MijnLeerlijn-standaardtekst gebeurt op precies één plek:
      // services/payload.ts's mapVariant(), zie
      // lib/variant/default-website-teksten.ts. Consumers (Header, homepage,
      // HelpdeskChat, contactpagina, Footer) lezen dus altijd een volledig
      // ingevuld variant.websiteTeksten-object, nooit een leeg veld.
      name: "websiteTeksten",
      type: "group",
      label: "Website teksten",
      admin: {
        description:
          "Optioneel. Een leeg veld toont automatisch de standaardtekst van MijnLeerlijn — vul hier alleen in wat voor deze variant moet afwijken.",
      },
      fields: [
        { name: "welkomsttitel", type: "text", label: "Welkomsttitel" },
        { name: "welkomsttekst", type: "textarea", label: "Welkomsttekst" },
        { name: "zoekveldPlaceholder", type: "text", label: "Placeholder zoekveld" },
        { name: "helpdeskIntro", type: "textarea", label: "Introductietekst Helpdesk" },
        { name: "contactTekst", type: "textarea", label: "Contacttekst" },
        {
          name: "footerTekst",
          type: "text",
          label: "Footertekst",
          admin: {
            description:
              "Leeg = automatisch de standaardtekst met het actuele jaartal. Zelf ingevuld = letterlijk gebruikt, geen automatische jaartal-vervanging.",
          },
        },
      ],
    },
    {
      name: "contactEmail",
      type: "email",
      label: "Contact-e-mail (override)",
      admin: { description: "Optioneel — overschrijft het standaard helpdesk-adres voor deze variant." },
    },
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      label: "Aangemaakt door",
      access: { update: () => false },
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  hooks: {
    beforeChange: [
      ({ operation, data, req }) => {
        if (operation === "create" && req.user) data.createdBy = req.user.id;
        return data;
      },
    ],
    afterChange: [maakAutomatischeKennisbron],
  },
};
