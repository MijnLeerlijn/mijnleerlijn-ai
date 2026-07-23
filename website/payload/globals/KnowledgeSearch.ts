import type { GlobalConfig } from "payload";
import { adminOnly } from "../access/roles";

// Eenvoudige testpagina voor semantisch zoeken (Sprint 4) — een Global,
// geen Collection: er is geen "document" om te bewaren, alleen een
// interactief zoekscherm. Zelfde patroon als payload/globals/GmailConnection.ts
// (één type: "ui"-veld met een volledig custom React-component). Roept
// POST /api/knowledge/search aan — zie lib/embeddings/similarity-search.ts.
export const KnowledgeSearch: GlobalConfig = {
  slug: "knowledge-search",
  admin: {
    group: "Beheer",
    description: "Test semantisch zoeken over kennisbronnen, conceptkennisartikelen en artikelen.",
  },
  access: {
    read: adminOnly,
    update: adminOnly,
  },
  fields: [
    {
      name: "zoekTool",
      type: "ui",
      label: "Zoek semantisch",
      admin: {
        components: {
          Field: "@/payload/components/SemanticSearchTester#SemanticSearchTester",
        },
      },
    },
  ],
};
