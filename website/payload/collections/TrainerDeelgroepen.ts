import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";

// Traineromgeving V2, Fase 3 (2026-08-23) — Bestanden + Deelgroepen. Een
// deelgroep bepaalt WELKE trainers een algemeen trainerbestand automatisch
// mogen zien onder "Met mij gedeeld" (/bestanden) — puur lidmaatschap, geen
// gekopieerde toegangsrechten per bestand (opdrachtseis §4: "rechten volgen
// dynamisch uit groepslidmaatschap, niet uit gekopieerde ACL-records").
// lib/trainers/groepen.ts leest dit ELKE keer live (nooit gecachet), dus een
// lid toevoegen/verwijderen werkt met terugwerkende kracht op alle al
// gedeelde bestanden van die groep — geen aparte "sync"-stap nodig.
//
// Rechten: "Alleen admin/editor mag groepen beheren; trainers mogen groepen
// niet zelf aanpassen" (opdrachtseis §3) — zelfde anyEditor/adminOnly-patroon
// als KennisbasisOnderwerpen.ts. Trainers raken deze collectie NOOIT via de
// publieke Payload-API aan (net als trainer-accounts/trainer-logboek-items) —
// uitsluitend server-side, overrideAccess:true, via lib/trainers/groepen.ts.
export const TrainerDeelgroepen: CollectionConfig = {
  slug: "trainer-deelgroepen",
  labels: { singular: "Trainer-deelgroep", plural: "Trainer-deelgroepen" },
  admin: {
    useAsTitle: "naam",
    defaultColumns: ["naam", "actief", "leden", "updatedAt"],
    group: "Trainers",
    description: "Groepen waarmee trainers algemene bestanden kunnen delen (bv. 'Montessori-trainers', 'Regio Zuid'). Alleen beheerders kunnen groepen aanmaken/bewerken.",
  },
  access: {
    read: anyEditor,
    create: anyEditor,
    update: anyEditor,
    delete: adminOnly,
  },
  fields: [
    { name: "naam", type: "text", required: true, label: "Naam" },
    { name: "omschrijving", type: "textarea", label: "Omschrijving (optioneel)" },
    { name: "actief", type: "checkbox", defaultValue: true, label: "Actief", admin: { description: "Een inactieve groep blijft bestaan (historie/leden blijven zichtbaar in de admin) maar telt niet meer mee bij delen/lezen — bestaande bestanden die er via gedeeld waren, worden dus onzichtbaar voor de leden totdat de groep weer actief is." } },
    { name: "leden", type: "relationship", relationTo: "trainer-accounts", hasMany: true, label: "Leden" },
  ],
};
