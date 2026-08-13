import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";

// Mailtemplates (2026-08-13) — herbruikbare basismails voor "Mail
// schrijven" in Creator, functioneel gescheiden van mail-drafts (concept =
// tijdelijk werk aan één specifieke mail; template = duurzaam, herbruikbaar
// schrijfvoorbeeld). Bewust een aparte, kleine collectie i.p.v. mail-drafts
// uitbreiden: draftReply is daar required, receivedText is expliciet
// "tijdelijk, leegmaken na afhandeling" (verkeerde privacysemantiek voor
// iets duurzaams), en status/linkedKnowledgeDraft passen niet bij een
// template-levenscyclus — zie de analyse in de sessiegeschiedenis.
//
// GEEN Helpdesk-AI-kennis: deze collectie staat bewust niet in
// EmbeddableCollectie (lib/embeddings/run-embedding.ts) — een template is
// een schrijfvoorbeeld, geen feitelijke productkennis, en mag dus nooit in
// embeddings/retrieval belanden (opdrachtseis, zie ook de systeeminstructie
// in lib/creator/mail-reply.ts die dit onderscheid ook op prompt-niveau
// afdwingt).
//
// group hier bewust hetzelfde als MailDrafts/DerivedContent — al verborgen
// via admin-shell.css se native-nav-hiding. Beheer (bewerken/archiveren/
// verwijderen) blijft voor nu bereikbaar via deze Payload-collectionpagina
// zelf (rechtstreeks gelinkt vanuit de Creator-templatekiezer) — geen apart
// Archief-scherm bouwen zolang dat er nog niet is.
export const MailTemplates: CollectionConfig = {
  slug: "mail-templates",
  labels: { singular: "Mailtemplate", plural: "Mailtemplates" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "variant", "audience", "status", "updatedAt"],
    group: "Basis — Technisch beheer",
    description: "Herbruikbare basismails voor 'Mail schrijven' in Creator.",
  },
  access: {
    read: anyEditor,
    create: anyEditor,
    update: anyEditor,
    delete: adminOnly,
  },
  fields: [
    { name: "name", type: "text", required: true, label: "Naam" },
    { name: "subject", type: "text", label: "Onderwerpregel" },
    { name: "content", type: "textarea", required: true, label: "Template-inhoud" },
    {
      name: "variant",
      type: "relationship",
      relationTo: "variants",
      label: "Onderwijstype/variant",
      admin: { description: "Leeg = algemeen, bruikbaar voor elke variant." },
    },
    {
      name: "audience",
      type: "select",
      label: "Doelgroep",
      options: [
        { label: "Algemeen", value: "algemeen" },
        { label: "Schoolleider/directeur", value: "schoolleider_directeur" },
        { label: "IB/KC", value: "ib_kc" },
        { label: "Leerkracht", value: "leerkracht" },
        { label: "Partner", value: "partner" },
      ],
    },
    {
      name: "description",
      type: "textarea",
      label: "Omschrijving",
      admin: { description: "Korte interne uitleg — waarvoor gebruik je deze template?" },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "actief",
      label: "Status",
      options: [
        { label: "Actief", value: "actief" },
        { label: "Gearchiveerd", value: "gearchiveerd" },
      ],
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
        if (operation === "create" && req.user && !data.createdBy) data.createdBy = req.user.id;
        return data;
      },
    ],
  },
};
