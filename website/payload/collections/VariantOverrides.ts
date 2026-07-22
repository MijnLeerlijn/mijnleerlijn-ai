import type { CollectionConfig } from "payload";
import { ownVariantOverrideAccess, publishedOverrideOrEditor } from "../access/roles";

// Eén polymorf mechanisme voor alle variant-afwijkingen — zie
// docs/DATA-MODEL.md §VariantOverride en docs/CONTENT-MODEL.md
// §Override-acties in detail. `targetArticle` maakt overrides filterbaar per
// artikel in de admin-UI; `targetType`+`targetId` wijzen exact naar het
// centrale element (het artikel zelf, een sectie, of een blok — sectie/blok
// bestaan niet als eigen collection, dus `targetId` is de Payload-subdocument-
// id binnen `targetArticle.sections`/`.sections[].blocks`).
//
// Schrijftoegang: uitsluitend een variant-redacteur voor de eigen variant, of
// een beheerder — een centrale redacteur heeft hier bewust geen schrijfpad
// naartoe, zie docs/CONTENT-MODEL.md §Wie mag wat schrijven.
export const VariantOverrides: CollectionConfig = {
  slug: "variant-overrides",
  admin: {
    useAsTitle: "id",
    defaultColumns: ["variant", "targetArticle", "targetType", "action", "status"],
    group: "Varianten",
    description: "Variant-specifieke aanvullingen, vervangingen of uitsluitingen op de centrale artikelboom.",
  },
  access: {
    read: publishedOverrideOrEditor,
    create: ownVariantOverrideAccess,
    update: ownVariantOverrideAccess,
    delete: ownVariantOverrideAccess,
  },
  fields: [
    { name: "variant", type: "relationship", relationTo: "variants", required: true, label: "Variant" },
    {
      name: "targetArticle",
      type: "relationship",
      relationTo: "articles",
      required: true,
      label: "Doelartikel",
      admin: { description: "Het centrale artikel waarbinnen dit inhaakt." },
    },
    {
      name: "targetType",
      type: "select",
      required: true,
      label: "Niveau",
      options: [
        { label: "Artikel", value: "article" },
        { label: "Sectie", value: "section" },
        { label: "Blok", value: "block" },
      ],
    },
    {
      name: "targetId",
      type: "text",
      required: true,
      label: "Doel-ID",
      admin: {
        description:
          "Gelijk aan targetArticle's ID wanneer Niveau = Artikel; anders de ID van de specifieke sectie of het specifieke blok binnen dat artikel.",
      },
    },
    {
      name: "action",
      type: "select",
      required: true,
      label: "Actie",
      options: [
        { label: "Onveranderd", value: "onveranderd" },
        { label: "Aanvullen", value: "aanvullen" },
        { label: "Vervangen", value: "vervangen" },
        { label: "Verbergen", value: "verbergen" },
        { label: "Ander medium", value: "ander_medium" },
        { label: "Invoegen vóór", value: "invoegen_voor" },
        { label: "Invoegen na", value: "invoegen_na" },
      ],
    },
    {
      name: "payload",
      type: "json",
      label: "Inhoud",
      admin: {
        description:
          "Vervangende/aanvullende/ingevoegde blokinhoud, of een media-referentie bij 'Ander medium'. Leeg bij 'Onveranderd' of 'Verbergen'.",
        condition: (_d, s) => s?.action !== "onveranderd" && s?.action !== "verbergen",
      },
    },
    {
      name: "termOverridesApplied",
      type: "checkbox",
      defaultValue: true,
      label: "Terminologie-substitutie toepassen",
      admin: {
        description: "Standaard aan. Uitzetten wanneer dit element al de juiste variant-terminologie bevat.",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "concept",
      label: "Status",
      options: [
        { label: "Concept", value: "concept" },
        { label: "Gepubliceerd", value: "gepubliceerd" },
      ],
    },
    {
      name: "editedBy",
      type: "relationship",
      relationTo: "users",
      label: "Laatst bewerkt door",
      access: { update: () => false },
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, req }) => {
        if (req.user) data.editedBy = req.user.id;
        return data;
      },
    ],
    beforeValidate: [
      async ({ data, req, originalDoc, operation }) => {
        if (!data) return data;
        const variant = typeof data.variant === "object" ? data.variant?.id : data.variant;
        const targetType = data.targetType ?? originalDoc?.targetType;
        const targetId = data.targetId ?? originalDoc?.targetId;
        if (!variant || !targetType || !targetId) return data;

        const existing = await req.payload.find({
          collection: "variant-overrides",
          where: {
            and: [
              { variant: { equals: variant } },
              { targetType: { equals: targetType } },
              { targetId: { equals: targetId } },
            ],
          },
          limit: 1,
          depth: 0,
        });

        const conflict = existing.docs.find((doc) => operation === "create" || doc.id !== originalDoc?.id);
        if (conflict) {
          throw new Error(
            `Er bestaat al een VariantOverride voor deze combinatie van variant, niveau en doel-ID (record ${conflict.id}). Per (variant, niveau, doel) mag er maar één override bestaan — zie docs/DATA-MODEL.md §VariantOverride.`
          );
        }
        return data;
      },
    ],
  },
};
