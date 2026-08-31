import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Upsell-ronde (2026-09-02) — trainingen die een trainer ZELF, buiten het
// MijnLeerlijn-Monday-traject om, bij een school geeft. Trainingen zelf
// leven nergens lokaal (ze komen live uit Monday, zie lib/trainers/monday-
// links.ts) — dit is de EXPLICIETE uitzondering: een aanvullende training
// heeft per definitie geen Monday-tegenhanger, dus moet ergens lokaal
// bestaan. Bewust een kleine, eigen collectie i.p.v. een uitbreiding van
// TrainingVerslagen: dit record IS de training zelf (naam+datum+school),
// geen verslag — lib/trainers/aanvullende-trainingen.ts zet 'm vervolgens om
// naar exact dezelfde TrainingSamenvatting-vorm (monday-links.ts) als een
// Monday-training, met `bron: "aanvullend"`, zodat de rest van de
// trainer-/verslag-/telefonieflows 'm zonder enig onderscheid kunnen
// gebruiken (opdrachtseis: "geen tweede verslagflow").
//
// Zelfde sluit-collectie-patroon als TrainingVerslagen/TrainerLogboekItems:
// create/update altijd () => false, uitsluitend server-side via
// overrideAccess:true door lib/trainers/aanvullende-trainingen.ts.
//
// `trainer` is WIE de training momenteel is toegewezen (bij aanmaak: de
// trainer die 'm toevoegde) — spec §A2: "mag beheer dat later kunnen
// aanpassen", dus bewust een gewone, door een admin wijzigbare relatie i.p.v.
// een onveranderlijk "aangemaakt door"-snapshot.
export const AanvullendeTrainingen: CollectionConfig = {
  slug: "aanvullende-trainingen",
  labels: { singular: "Aanvullende training", plural: "Aanvullende trainingen" },
  admin: {
    useAsTitle: "naam",
    defaultColumns: ["naam", "schoolNaam", "trainer", "datum", "createdAt"],
    group: "Basis — Technisch beheer",
    description: "Trainingen die een trainer zelf, los van het MijnLeerlijn-Monday-traject, bij een school geeft. Nooit rechtstreeks bewerken — uitsluitend server-side via lib/trainers/aanvullende-trainingen.ts.",
  },
  access: {
    read: adminOnly,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "trainer", type: "relationship", relationTo: "trainer-accounts", required: true, index: true, label: "Trainer" },
    { name: "mondaySchoolId", type: "text", required: true, index: true, label: "Monday-ID school (Master Data)", admin: { description: "Server-side geverifieerd via haalSchoolDetail — nooit ongecontroleerd door de client aangeleverd." } },
    { name: "schoolNaam", type: "text", label: "School (naam, snapshot ten tijde van aanmaken)" },
    { name: "naam", type: "text", required: true, maxLength: 200, label: "Training" },
    { name: "datum", type: "date", required: true, index: true, label: "Datum" },
  ],
};
