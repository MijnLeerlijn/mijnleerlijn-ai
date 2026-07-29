import type { CollectionConfig } from "payload";
import { anyEditor } from "../access/roles";

// Homepage-herontwerp (2026-07-29): vervangt de vaste, handmatig bijgehouden
// lijst in payload/globals/HelpdeskVoorbeeldvragen.ts (max. 6 rijen, door
// een beheerder zelf getypt) door een zelflerend systeem — elke keer dat een
// bezoeker daadwerkelijk op "Verstuur" klikt (app/api/helpdesk/ask/route.ts,
// via lib/helpdesk/registreer-gestelde-vraag.ts) telt de gestelde vraag mee.
// De publieke Top 5 (lib/helpdesk/top5-voorbeeldvragen.ts) toont eerst
// vastgezette vragen, daarna aangevuld met de meest gestelde.
//
// Bewust een ANDERE slug dan de oude Global ("helpdesk-vragen" i.p.v.
// "helpdesk-voorbeeldvragen") — Payload zou anders een DB-tabelnaamconflict
// krijgen tussen de (ongebruikt blijvende, niet verwijderde) Global-tabel en
// deze nieuwe collectietabel.
//
// `verborgen` is nodig omdat vragen automatisch uit echte, ongemodereerde
// bezoekersinvoer ontstaan — een beheerder moet een vraag uit de publieke
// Top 5 kunnen weren zonder de tellinggeschiedenis te verliezen.
export const HelpdeskVragen: CollectionConfig = {
  slug: "helpdesk-vragen",
  labels: { singular: "Helpdesk-vraag", plural: "Helpdesk-vragen" },
  admin: {
    useAsTitle: "vraag",
    defaultColumns: ["vraag", "aantalGesteld", "laatstGebruiktOp", "pinned", "verborgen"],
    group: "Beheer",
    description:
      "Vragen die bezoekers daadwerkelijk aan de Helpdesk-assistent gesteld hebben (automatisch geteld bij elke 'Verstuur'-klik), plus handmatig toegevoegde vragen. Bepaalt de 'Meest gestelde vragen' op de homepage — zie de beheerpagina 'Helpdesk-vragen' voor vastzetten/verbergen/toevoegen.",
  },
  access: {
    read: anyEditor,
    create: anyEditor,
    update: anyEditor,
    delete: anyEditor,
  },
  fields: [
    { name: "vraag", type: "text", required: true, label: "Vraag" },
    {
      name: "vraagNormalized",
      type: "text",
      required: true,
      unique: true,
      label: "Vraag (genormaliseerd)",
      admin: {
        hidden: true,
        description: "Alleen voor matching bij het tellen — getrimd, kleine letters, enkele spaties. Nooit handmatig aanpassen.",
      },
    },
    {
      name: "aantalGesteld",
      type: "number",
      required: true,
      defaultValue: 0,
      label: "Aantal keer gesteld",
      admin: { readOnly: true },
    },
    {
      name: "laatstGebruiktOp",
      type: "date",
      label: "Laatst gebruikt op",
      admin: { readOnly: true, description: "Leeg voor handmatig toegevoegde vragen die nog nooit gesteld zijn." },
    },
    {
      name: "pinned",
      type: "checkbox",
      defaultValue: false,
      label: "Vastgezet (Pinned)",
      admin: { description: "Vastgezette vragen staan altijd vooraan in de publieke Top 5, ongeacht het aantal keer gesteld." },
    },
    {
      name: "pinVolgorde",
      type: "number",
      label: "Volgorde binnen vastgezet",
      admin: { description: "Laag = eerder getoond. Leeg = onderaan bij de andere vastgezette vragen." },
    },
    {
      name: "verborgen",
      type: "checkbox",
      defaultValue: false,
      label: "Verborgen",
      admin: { description: "Sluit deze vraag uit van de publieke Top 5 — blijft wel zichtbaar/beheerbaar hier." },
    },
  ],
};
