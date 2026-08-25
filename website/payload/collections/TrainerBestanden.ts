import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";
import { permissieOnly } from "../access/menu-permissions";

// Traineromgeving V2, Fase 3 (2026-08-23) — Bestanden + Deelgroepen. Eén
// gedeeld model voor zowel schoolbestanden als algemene trainerbestanden
// ("scope" hieronder), i.p.v. twee losse collecties/uploadpaden
// (opdrachtseis §5: "Ontwerp één collectie/model... tenzij de bestaande
// architectuur overtuigend vraagt om twee collecties" — die overtuiging is
// er niet: upload/download/verwijderen zijn voor beide scopes identiek,
// alleen de eigendoms-/zichtbaarheidsregels verschillen, en die verschillen
// passen prima in voorwaardelijke velden op één rij). Zie het opleverrapport
// voor de volledige afweging.
//
// Opslag: BEWUST geen Payload `upload:true` (net als ContactSubmissions.ts):
// het bestand zelf staat privé in Vercel Blob via services/storage.ts
// (uploadTrainerBestand), hier staat uitsluitend metadata. storageKey is de
// canonieke sleutel voor download (genereerDownloadUrl) en opruimen
// (verwijderBijlage) — geen URL-decoderen nodig zoals bij de Media-collectie
// (die alleen een url-veld heeft), want storageKey wordt hier bij aanmaken
// al rechtstreeks opgeslagen.
//
// Eigendom/rechten volgen ALTIJD live uit lib/trainers/monday-links.ts
// (schoolbestanden) resp. trainer-deelgroepen-lidmaatschap (algemene
// bestanden) — nooit uit een veld hier. `access` hieronder is daarom, net
// als TrainerLogboekItems.ts, volledig dicht voor de publieke API: elke
// mutatie/leesactie voor een trainer loopt uitsluitend via
// lib/trainers/bestanden.ts (overrideAccess:true, ná eigen verificatie).
// Alleen een beheerder ziet/bewerkt/verwijdert rechtstreeks via de gewone
// Payload-admin (bv. om zelf een bestand aan een groep te delen, opdrachtseis
// §11) — dat mag altijd, ongeacht scope/eigendom.
export const TrainerBestanden: CollectionConfig = {
  slug: "trainer-bestanden",
  labels: { singular: "Trainerbestand", plural: "Trainerbestanden" },
  admin: {
    useAsTitle: "titel",
    defaultColumns: ["titel", "scope", "categorie", "uploader", "schoolNaam", "createdAt"],
    // Hernoemd van "Trainers" naar "Trainers — systeem" — botste met de
    // nieuwe custom NAV_GROUPS-groep "Trainers" (Fase 4, 2026-08-24). Zie
    // TrainerKennisversies.ts se toelichting bij dezelfde regel voor de
    // volledige uitleg (exact dezelfde botsing als de eerdere Sales-nav-regressie).
    group: "Trainers — systeem",
    description: "Bestanden die trainers uploaden — bij een school, of algemeen (eventueel gedeeld via een deelgroep). Nooit rechtstreeks bewerken — uitsluitend server-side via lib/trainers/bestanden.ts, behalve door een beheerder hier in de admin.",
  },
  access: {
    read: permissieOnly("trainers.bestanden", adminOnly),
    create: () => false,
    update: permissieOnly("trainers.bestanden", adminOnly),
    delete: permissieOnly("trainers.bestanden", adminOnly),
  },
  hooks: {
    // Ruimt de daadwerkelijke Blob altijd op bij verwijderen — ongeacht of
    // dat via lib/trainers/bestanden.ts (trainer, eigen bestand) of
    // rechtstreeks via de Payload-admin (beheerder) gebeurde. Zelfde
    // eenduidige opruimpatroon als ContactSubmissions.ts se afterDelete:
    // "geen weesbestanden" geldt voor ELK verwijderpad, niet alleen het
    // trainer-facing pad.
    afterDelete: [
      async ({ doc }) => {
        const storageKey = typeof doc?.storageKey === "string" ? doc.storageKey : null;
        if (!storageKey) return;
        const { verwijderBijlage } = await import("@/services/storage");
        await verwijderBijlage(storageKey).catch((error) => {
          console.error("[trainer-bestanden] Opruimen blob na verwijderen mislukt:", error);
        });
      },
    ],
  },
  fields: [
    {
      name: "scope",
      type: "select",
      required: true,
      label: "Scope",
      options: [
        { label: "School", value: "school" },
        { label: "Algemeen (trainer)", value: "trainer" },
      ],
      admin: { description: "School: hoort bij één specifieke school, zichtbaar voor elke eraan gekoppelde trainer. Algemeen: van de trainer zelf, optioneel gedeeld via deelgroep(en)." },
    },
    { name: "titel", type: "text", required: true, label: "Titel" },
    {
      name: "categorie",
      type: "select",
      required: true,
      label: "Categorie",
      options: [
        { label: "Curriculum", value: "curriculum" },
        { label: "Presentatie", value: "presentatie" },
        { label: "Trainingsmateriaal", value: "trainingsmateriaal" },
        { label: "Werkdocument", value: "werkdocument" },
        { label: "Export", value: "export" },
        { label: "Schooldocument", value: "schooldocument" },
        { label: "Overig", value: "overig" },
      ],
    },
    { name: "omschrijving", type: "textarea", label: "Omschrijving (optioneel)" },

    {
      name: "downloadActie",
      type: "ui",
      label: "Download",
      admin: {
        position: "sidebar",
        components: { Field: "@/payload/components/DownloadTrainerBestandKnop#DownloadTrainerBestandKnop" },
      },
    },

    { name: "storageKey", type: "text", required: true, label: "Opslagsleutel", admin: { readOnly: true } },
    { name: "filename", type: "text", required: true, label: "Bestandsnaam" },
    { name: "mimeType", type: "text", required: true, label: "Bestandstype" },
    { name: "sizeBytes", type: "number", required: true, label: "Grootte (bytes)" },

    { name: "uploader", type: "relationship", relationTo: "trainer-accounts", required: true, index: true, label: "Geüpload door" },

    {
      name: "mondaySchoolId",
      type: "text",
      index: true,
      label: "Monday-ID school (alleen scope: school)",
      admin: { description: "Server-side geverifieerd via haalSchoolDetail — nooit ongecontroleerd door de client aangeleverd." },
    },
    { name: "schoolNaam", type: "text", label: "School (naam, snapshot ten tijde van upload)" },
    {
      name: "mondayTrainingId",
      type: "text",
      index: true,
      label: "Monday-ID training (optioneel, alleen scope: school)",
      admin: { description: "Alleen gevuld als expliciet aan een training gekoppeld — server-side geverifieerd via haalTrainingVoorMutatie." },
    },
    { name: "trainingNaam", type: "text", label: "Training (naam, snapshot — alleen bij mondayTrainingId)" },

    {
      name: "zichtbaarheid",
      type: "select",
      label: "Zichtbaarheid (alleen scope: trainer)",
      options: [
        { label: "Alleen voor mij", value: "prive" },
        { label: "Delen met groep(en)", value: "gedeeld" },
      ],
      admin: { description: "Uitsluitend van toepassing op algemene trainerbestanden — een schoolbestand is altijd zichtbaar voor elke aan de school gekoppelde trainer, nooit los daarvan gedeeld/verborgen." },
    },
    {
      name: "deelgroepen",
      type: "relationship",
      relationTo: "trainer-deelgroepen",
      hasMany: true,
      label: "Gedeeld met groepen (alleen scope: trainer, zichtbaarheid: gedeeld)",
      admin: { description: "Elk lid van elke gekozen groep ziet dit bestand automatisch onder 'Met mij gedeeld' — dynamisch, geen kopie: een lid dat later uit de groep gaat, verliest toegang zonder dat dit veld hoeft te wijzigen." },
    },
  ],
};
