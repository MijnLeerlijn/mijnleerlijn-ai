import type { GlobalConfig } from "payload";
import { anyEditor } from "../access/roles";

// Algemene, variant-onafhankelijke Helpdesk-instellingen — publiek leesbaar,
// door elke editor aanpasbaar zonder code (zelfde toegangspatroon als
// payload/globals/HelpdeskVoorbeeldvragen.ts). Curriculum Werkplaats is geen
// apart onderdeel per onderwijsvariant maar één centrale koppeling voor de
// hele Helpdesk — vandaar hier i.p.v. een veld op Variants (adminOnly, zie
// payload/access/roles.ts), zie components/molecules/CurriculumWerkplaatsCard.tsx.
export const HelpdeskInstellingen: GlobalConfig = {
  slug: "helpdesk-instellingen",
  admin: {
    group: "Beheer",
    description: "Algemene instellingen voor de hele Helpdesk, ongeacht welke variant actief is.",
  },
  access: {
    read: () => true,
    update: anyEditor,
  },
  fields: [
    {
      name: "curriculumWerkplaatsUrl",
      type: "text",
      label: "Curriculum Werkplaats URL",
      admin: {
        description:
          "Optioneel. Leeg = geen Curriculum Werkplaats-kaartje op de homepage. Gevuld = kaartje zichtbaar voor alle varianten.",
      },
    },
  ],
};
