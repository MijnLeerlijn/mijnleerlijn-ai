import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";

/**
 * Geanonimiseerde gebruiksdata van de losse Lesplan Generator.
 * We bewaren bewust geen namen, e-mailadressen, IP-adressen, materialen of
 * vrije extra-wensen. Alleen onderwijsinhoud die nodig is om trends te zien.
 * Records worden uitsluitend server-side via de ingestion-route aangemaakt.
 */
export const LesplanAnalytics: CollectionConfig = {
  slug: "lesplan-analytics",
  labels: { singular: "Lesplan-inzicht", plural: "Lesplan-inzichten" },
  admin: {
    useAsTitle: "normalizedGoal",
    defaultColumns: ["requestedAt", "subject", "normalizedGoal", "ageGroup", "planTitle"],
    group: "Beheer — systeem",
    description: "Geanonimiseerde trends uit de Lesplan Generator. Alleen server-side gevuld.",
  },
  access: {
    read: anyEditor,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "requestedAt", type: "date", required: true, label: "Aangevraagd op", index: true },
    { name: "subject", type: "text", required: true, label: "Vakgebied", index: true },
    { name: "rawGoal", type: "textarea", required: true, label: "Ingevoerd leerdoel" },
    { name: "normalizedGoal", type: "text", required: true, label: "Genormaliseerd leerdoel", index: true },
    { name: "topic", type: "text", label: "Onderwerp", index: true },
    { name: "ageGroup", type: "text", label: "Groep / leeftijd", index: true },
    { name: "planTitle", type: "text", label: "Titel lesplan" },
    { name: "source", type: "text", defaultValue: "lesplangenerator11", label: "Bron" },
  ],
};
