import type { GlobalConfig } from "payload";
import { anyEditor } from "../access/roles";

// Vier (of minder) klikbare voorbeeldvragen onder het invoerveld op de
// helpdesk-homepage — publiek leesbaar, door een beheerder aanpasbaar zonder
// code. Bewust een Global (één set vragen voor de hele site, geen los
// document per vraag) i.p.v. een Collection.
export const HelpdeskVoorbeeldvragen: GlobalConfig = {
  slug: "helpdesk-voorbeeldvragen",
  admin: {
    group: "Beheer",
    description: "De klikbare voorbeeldvragen onder het invoerveld op de helpdesk-homepage.",
  },
  access: {
    read: () => true,
    update: anyEditor,
  },
  fields: [
    {
      name: "vragen",
      type: "array",
      label: "Voorbeeldvragen",
      labels: { singular: "Vraag", plural: "Vragen" },
      maxRows: 6,
      admin: { description: "Worden direct verstuurd zodra een bezoeker erop klikt." },
      fields: [{ name: "tekst", type: "text", required: true, label: "Vraag" }],
    },
  ],
};
