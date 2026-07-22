import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

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
  },
};
