import type { CollectionBeforeValidateHook, CollectionConfig } from "payload";
import { ValidationError } from "payload";
import { anyEditor } from "../access/roles";
import { normaliseerVraag } from "@/lib/helpdesk/registreer-gestelde-vraag";

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
//
// Bugfix (2026-07-29, live gevonden in productie): `vraagNormalized` is een
// verborgen, systeembeheerd veld — bij handmatig aanmaken/wijzigen via
// Payload's EIGEN admin-formulier (niet de aangepaste beheerpagina
// HelpdeskVragenView.tsx, die het voorheen altijd zelf al meestuurde) werd
// het nooit ingevuld, waardoor de verplichte-veldvalidatie faalde met "The
// following field is invalid: Vraag (genormaliseerd)". Geëxporteerd als
// losse functie (i.p.v. een inline hook) zodat dit rechtstreeks, zonder een
// echte Payload-instantie, getest kan worden — zie HelpdeskVragen.test.ts.
//
// beforeValidate i.p.v. beforeChange: dat laatste draait PAS NA Payload's
// eigen veldvalidatie (create → validate → beforeChange → opslaan), dus zou
// de fout niet voorkomen — beforeValidate draait ervóór.
//
// Bewust dezelfde normaliseerVraag() als lib/helpdesk/
// registreer-gestelde-vraag.ts (geïmporteerd, niet opnieuw geïmplementeerd)
// — anders zou een handmatig toegevoegde vraag nooit matchen met dezelfde,
// later automatisch getelde vraag.
//
// Multi-brand variants (2026-07-30): de duplicaatcontrole hieronder was
// oorspronkelijk (Fase 3, vóór varianten) kolombreed — elke andere rij met
// dezelfde vraagNormalized gold als duplicaat. Nu twee varianten dezelfde
// vraagtekst mogen hebben als twee aparte rijen (zie
// lib/helpdesk/registreer-gestelde-vraag.ts), moet deze check ook
// variant-bewust zijn: alleen een conflict wanneer de variant-sets
// overlappen, of allebei leeg zijn (twee universele rijen met dezelfde
// tekst is nog steeds een echt duplicaat). Ontdekt via een echte
// (niet-gemockte) test: dezelfde vraagtekst in twee varianten werd hier
// nog steeds afgewezen, óók nadat de kolombrede DB-unique-index al was
// verwijderd.
function variantIds(waarde: unknown): number[] {
  if (!Array.isArray(waarde)) return [];
  return waarde
    .map((v) => (typeof v === "object" && v !== null ? Number((v as { id?: unknown }).id) : Number(v)))
    .filter((n) => !Number.isNaN(n));
}

export const vulVraagNormalizedIn: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data || typeof data.vraag !== "string" || !data.vraag.trim()) {
    // Laat Payload's eigen required-validatie op `vraag` de fout geven —
    // geen dubbele/verwarrende foutmelding over het verborgen veld.
    return data;
  }

  const genormaliseerd = normaliseerVraag(data.vraag);
  data.vraagNormalized = genormaliseerd;

  // Alleen daadwerkelijk controleren op duplicaten wanneer de
  // genormaliseerde vorm ook echt verandert (nieuw record, of een bestaand
  // record waarvan de vraagtekst inhoudelijk wijzigt) — scheelt een
  // overbodige query bij elke opslag van uitsluitend pinned/verborgen.
  if (genormaliseerd !== originalDoc?.vraagNormalized) {
    const bestaand = await req.payload.find({
      collection: "helpdesk-vragen",
      where: { vraagNormalized: { equals: genormaliseerd } },
      limit: 100,
      overrideAccess: true,
      depth: 0,
    });
    const nieuweVarianten = variantIds(data.variantContext);
    const conflict = bestaand.docs.find((doc) => {
      if (doc.id === originalDoc?.id) return false;
      const bestaandeVarianten = variantIds(doc.variantContext);
      if (nieuweVarianten.length === 0 && bestaandeVarianten.length === 0) return true;
      return nieuweVarianten.some((id) => bestaandeVarianten.includes(id));
    });
    if (conflict) {
      throw new ValidationError({
        collection: "helpdesk-vragen",
        errors: [
          {
            path: "vraag",
            message: `Deze vraag bestaat al binnen deze variant(en): "${conflict.vraag}". Pas de bestaande vraag aan (bv. vastzetten) i.p.v. een duplicaat aan te maken.`,
          },
        ],
        req,
      });
    }
  }

  return data;
};

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
  hooks: {
    beforeValidate: [vulVraagNormalizedIn],
  },
  fields: [
    { name: "vraag", type: "text", required: true, label: "Vraag" },
    {
      name: "vraagNormalized",
      type: "text",
      index: true,
      // Multi-brand variants (2026-07-30): NIET meer uniek — uniciteit is nu
      // per variant vereist (dezelfde vraagtekst mag in twee varianten twee
      // aparte rijen/tellingen hebben, zie lib/helpdesk/registreer-gestelde-
      // vraag.ts). Een kolombrede unique-constraint accepteert geen
      // combinatie met het variantContext-hasMany-veld (aparte join-tabel),
      // dus de deduplicatie binnen één variant loopt volledig via de
      // find-vóór-create-logica in registreerGesteldeVraag() — al
      // variant-gescoped. Ontdekt via een echte (niet-gemockte) test: twee
      // identieke vraagteksten in twee varianten braken hier voorheen op de
      // oude globale unique-index.
      label: "Vraag (genormaliseerd)",
      admin: {
        hidden: true,
        description: "Alleen voor matching bij het tellen — getrimd, kleine letters, enkele spaties. Wordt automatisch bijgehouden, nooit handmatig aanpassen.",
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
    {
      // Multi-brand variants (2026-07-30): "Meest gestelde vragen" apart per
      // variant, op verzoek — zelfde vaste patroon als overal elders. Een
      // organisch (via de publieke Helpdesk) ontstane vraag krijgt altijd
      // een gevulde variantContext (zie lib/helpdesk/registreer-gestelde-
      // vraag.ts) — leeg blijft gereserveerd voor een bewust door een
      // beheerder universeel vastgezette vraag, zichtbaar bij elke variant.
      name: "variantContext",
      type: "relationship",
      relationTo: "variants",
      hasMany: true,
      label: "Variantcontext",
      admin: {
        description: "Leeg = getoond bij alle varianten (bv. een universeel vastgezette vraag). Ingevuld = alleen bij die variant(en).",
      },
    },
  ],
};
