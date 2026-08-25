import type { GlobalConfig } from "payload";
import { adminOnly } from "../access/roles";
import { permissieOnly } from "../access/menu-permissions";

// Chatbot-evaluatieomgeving — een Global, geen Collection: er is geen
// "document" om te bewaren, alleen een interactief testscherm. Zelfde
// patroon als payload/globals/KnowledgeSearch.ts (één type: "ui"-veld met
// een volledig custom React-component). Roept POST /api/assistant/eval/run
// aan (lib/assistant/evaluate.ts) en gebruikt verder rechtstreeks Payload's
// eigen REST-API (GET/PATCH /api/assistant-eval-questions,
// /api/assistant-eval-runs) — zie payload/components/AssistantEvalTester.tsx.
export const AssistantEval: GlobalConfig = {
  slug: "assistant-eval",
  admin: {
    group: "Basis — Technisch beheer",
    description:
      "Test de AI-assistent tegen de vaste vragenset (40 vragen) of een losse vraag, met volledige retrieval-diagnostiek en handmatige beoordeling.",
  },
  access: {
    read: permissieOnly("helpdesk-ai.evaluatie", adminOnly),
    update: permissieOnly("helpdesk-ai.evaluatie", adminOnly),
  },
  fields: [
    {
      name: "evalTool",
      type: "ui",
      label: "Chatbot-evaluatie",
      admin: {
        components: {
          Field: "@/payload/components/AssistantEvalTester#AssistantEvalTester",
        },
      },
    },
  ],
};
