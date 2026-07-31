import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";

// Kennisbasis MijnLeerlijn — intentiebepaling (2026-07-28): BEWUST een ander
// brontype dan de bestaande, narratieve achtergrondbron ("Kennisbasis
// MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI", knowledge-sources
// id 9, bronrol "achtergrondmodel", zie docs/AI-KNOWLEDGE-STRATEGY.md). Die
// bron blijft ongewijzigd en behoudt zijn rol (visie/samenhang/redenatie).
// Deze collectie is functiegerichte term-/synoniemkennis: per onderwerp wat
// de gebruiker wil bereiken, de officiële MijnLeerlijn-term en synoniemen —
// gebruikt door lib/assistant/bepaal-intentie.ts (fase 1, VÓÓR de bestaande
// handleiding-stappen-retrieval) om vast te stellen welke functie bedoeld
// is, niet om zelf als citeerbare bron in een antwoord te verschijnen.
// Slug bewust technisch onderscheidend (`kennisbasis-onderwerpen`, niet
// `kennisbasis`) — het menu heet voor de gebruiker gewoon "Kennisbasis
// MijnLeerlijn" (admin.group hieronder), maar in code/schema mag nooit
// verwarring ontstaan met de bestaande achtergrondbron.
// UI-hernoeming (2026-07-28): slug bewust ONGEWIJZIGD gelaten (was en blijft
// "kennisbasis-onderwerpen") — een slug-rename zou een risicovolle tabel-/
// FK-rename-migratie op productiedata vereisen. Alleen labels.plural en
// admin.group zijn aangepast, zodat "Kennisbasis MijnLeerlijn" als naam nu
// uitsluitend voor de nieuwe, echte centrale Kennisbasis-Global gebruikt
// wordt (zie payload/globals/KennisbasisMijnleerlijn.ts) — deze collectie is
// en blijft uitsluitend intentie-/officiële-termconfiguratie.
export const KennisbasisOnderwerpen: CollectionConfig = {
  slug: "kennisbasis-onderwerpen",
  labels: { singular: "Helpdesk-onderwerp", plural: "Helpdesk-onderwerpen" },
  admin: {
    useAsTitle: "onderwerp",
    defaultColumns: ["onderwerp", "officieleTerm", "status", "prioriteit"],
    group: "Basis — Technisch beheer",
    description:
      "Functiegerichte term- en synoniemkennis voor intentiebepaling door de AI Helpdesk — een ANDER brontype dan de centrale Kennisbasis MijnLeerlijn (het narratieve achtergrondverhaal, zie dat menu-item). Bepaalt welke MijnLeerlijn-functie een leerkracht bedoelt, vóórdat er naar een handleiding gezocht wordt.",
  },
  access: {
    read: anyEditor,
    create: anyEditor,
    update: anyEditor,
    delete: adminOnly,
  },
  fields: [
    {
      name: "onderwerp",
      type: "text",
      required: true,
      label: "Onderwerp",
      admin: { description: "Korte interne titel, bv. 'Doelen koppelen aan één leerling'." },
    },
    {
      name: "doel",
      type: "textarea",
      label: "Wat wil de gebruiker bereiken?",
    },
    {
      name: "officieleTerm",
      type: "text",
      required: true,
      label: "Officiële MijnLeerlijn-term",
      admin: {
        description:
          "Wordt als zoekvraag gebruikt zodra dit onderwerp herkend is — i.p.v. de letterlijke formulering van de gebruiker.",
      },
    },
    {
      name: "synoniemen",
      type: "text",
      hasMany: true,
      label: "Synoniemen en alternatieve formuleringen",
      admin: { description: "Bv. 'doelen', 'leerdoelen', 'leerling', 'kind', 'koppelen', 'toewijzen'." },
    },
    {
      name: "voorbeeldvragen",
      type: "text",
      hasMany: true,
      label: "Voorbeeldvragen",
      admin: { description: "Echte voorbeeldformuleringen — sterk signaal voor de intentiebepaling." },
    },
    {
      name: "toelichting",
      type: "textarea",
      label: "Toelichting voor intentiebepaling",
      admin: {
        description: "Alleen gebruikt door de AI om de intentie te bepalen — nooit rechtstreeks aan de gebruiker getoond.",
      },
    },
    {
      name: "gekoppeldeHandleidingen",
      type: "relationship",
      relationTo: ["handleidingen", "knowledge-sources"],
      hasMany: true,
      label: "Gekoppelde handleidingen",
      admin: {
        description:
          "Structured handleidingen én/of PDF-bronnen die dit onderwerp uitvoeren. Polymorf omdat lang niet elk onderwerp al een structured handleiding heeft.",
      },
    },
    {
      name: "verduidelijkingsvraag",
      type: "textarea",
      label: "Verduidelijkingsvraag (optioneel)",
      admin: {
        description:
          "Als dit onderwerp met een ander onderwerp verward kan worden: de vraag die de assistent moet stellen om dat te verduidelijken, bv. 'Wil je doelen aan één leerling koppelen, of een doelenset aan meerdere leerlingen?'. Wordt letterlijk gebruikt als hij is ingevuld, i.p.v. dat de AI er zelf een verzint.",
      },
    },
    {
      name: "prioriteit",
      type: "number",
      label: "Prioriteit",
      admin: { description: "Tie-break wanneer meerdere onderwerpen plausibel lijken. Hoger = eerder gekozen." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "concept",
      label: "Status",
      options: [
        { label: "Concept", value: "concept" },
        { label: "Gepubliceerd", value: "gepubliceerd" },
      ],
      admin: { description: "Alleen 'Gepubliceerd' onderwerpen doen mee in de intentiebepaling." },
    },
    {
      // Multi-brand variants (2026-07-30): zelfde vaste patroon als
      // Articles/Handleidingen/KnowledgeSources — zie docs/DATA-MODEL.md
      // §VariantOverride. Dit onderwerp bepaalt mee welke zoekvraag
      // lib/assistant/bepaal-intentie.ts genereert (via officieleTerm), dus
      // moet net als de andere brontypes variant-gescoped kunnen worden om
      // kennislekkage tussen varianten te voorkomen.
      name: "variantContext",
      type: "relationship",
      relationTo: "variants",
      hasMany: true,
      label: "Variantcontext",
      admin: {
        position: "sidebar",
        description: "Leeg = algemeen onderwerp, geldig voor alle varianten. Ingevuld = alleen voor die variant(en).",
      },
    },
  ],
};
