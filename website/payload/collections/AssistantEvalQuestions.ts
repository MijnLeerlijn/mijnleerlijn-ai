import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";
import { permissieOnly } from "../access/menu-permissions";

// Vaste testvragenset voor de chatbot-evaluatieomgeving (zie
// payload/collections/AssistantEvalRuns.ts en payload/globals/AssistantEval.ts)
// — GEEN productiedata, uitsluitend een beoordelingsinstrument om objectief
// te kunnen testen of de AI-assistent echte MijnLeerlijn-helpdeskvragen
// correct, volledig en uitsluitend op basis van bronnen beantwoordt. Los van
// assistant-conversations (dat zijn ECHTE gesprekken van gebruikers) — hier
// staan bewust samengestelde testvragen, zie payload/seed/eval-questions.ts
// voor de 40 vragen waarmee deze collectie gevuld wordt.
export const AssistantEvalQuestions: CollectionConfig = {
  slug: "assistant-eval-questions",
  admin: {
    useAsTitle: "question",
    defaultColumns: ["question", "category", "createdAt"],
    group: "Basis — Technisch beheer",
    description:
      "Vaste testvragenset voor de chatbot-evaluatieomgeving (/admin/globals/assistant-eval). Zie payload/seed/eval-questions.ts.",
  },
  access: {
    read: permissieOnly("helpdesk-ai.evaluatievragen", adminOnly),
    create: permissieOnly("helpdesk-ai.evaluatievragen", adminOnly),
    update: permissieOnly("helpdesk-ai.evaluatievragen", adminOnly),
    delete: permissieOnly("helpdesk-ai.evaluatievragen", adminOnly),
  },
  fields: [
    { name: "question", type: "textarea", required: true, label: "Vraag" },
    {
      name: "category",
      type: "select",
      required: true,
      label: "Categorie",
      options: [
        { label: "Feitelijke vraag", value: "feitelijk" },
        { label: "Stap-voor-stapvraag", value: "stap_voor_stap" },
        { label: "Vraag met meerdere routes", value: "meerdere_routes" },
        { label: "Onduidelijke vraag", value: "onduidelijk" },
        { label: "Vraag zonder voldoende bron", value: "onvoldoende_bron" },
      ],
      admin: {
        description:
          "Bepaalt waarop deze vraag bedoeld is te testen — zie het commentaar bovenin payload/seed/eval-questions.ts voor de precieze definities.",
      },
    },
    {
      name: "notes",
      type: "textarea",
      label: "Toelichting (waarom deze vraag)",
      admin: { description: "Optioneel: waarom deze vraag representatief is, of wat er lastig aan is." },
    },
  ],
};
