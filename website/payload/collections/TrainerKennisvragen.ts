import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Productiecontrole (2026-08-23) — opdrachtseis §3: een kleine,
// privacybewuste basis om later te kunnen leren van vragen waarop trainers
// geen antwoord kregen, plus (§2) de praktische diagnose voor de Kennis-Q&A-
// retrieval ("hoogste retrievalscore van een vraag; geselecteerde bron-ID/
// titel"). Bewust ÉÉN collectie voor beide: dezelfde velden dekken allebei,
// een aparte diagnose-collectie zou pure duplicatie zijn.
//
// GEEN vraagtekst en GEEN antwoordtekst — expliciete opdrachtseis ("de
// volledige vraagtekst hoeft voorlopig niet opgeslagen te worden"). Wat wél
// vastligt: wie, wanneer (createdAt, standaard al van Payload), of er een
// antwoord gevonden werd, de hoogste similarity-score, en welke
// trainerkennisversies daadwerkelijk gebruikt zijn.
//
// Volledig dicht voor de publieke API, net als TrainerLogboekItems.ts: een
// vragenlog is per definitie nooit iets waar een trainer zelf bij mag (ook
// niet zijn eigen entries — dit is geen "mijn geschiedenis"-functie, dat zou
// bovendien alsnog impliciet vraagpatronen aan de trainer zelf tonen zonder
// dat daar nu behoefte aan is). Schrijven gebeurt uitsluitend server-side
// vanuit lib/trainers/kennis.ts (overrideAccess:true, best-effort — een
// mislukte logregel mag het antwoord aan de trainer nooit blokkeren).
// Bewust ook geen `update`: een logregel wordt nooit achteraf bewerkt,
// alleen (door een beheerder) verwijderd voor bewaartermijnbeheer.
export const TrainerKennisvragen: CollectionConfig = {
  slug: "trainer-kennisvragen",
  labels: { singular: "Trainerkennisvraag", plural: "Trainerkennisvragen" },
  admin: {
    useAsTitle: "id",
    defaultColumns: ["trainer", "antwoordGevonden", "hoogsteSimilarity", "createdAt"],
    group: "Trainers",
    description: "Privacybewust log van Kennis-Q&A-vragen — geen vraag-/antwoordtekst, uitsluitend of er een antwoord gevonden werd, de hoogste score en gebruikte bronnen. Dient ook als praktische diagnose voor de retrieval zelf.",
  },
  access: {
    read: adminOnly,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "trainer", type: "relationship", relationTo: "trainer-accounts", required: true, index: true, label: "Trainer" },
    { name: "antwoordGevonden", type: "checkbox", required: true, defaultValue: false, label: "Antwoord gevonden" },
    {
      name: "hoogsteSimilarity",
      type: "number",
      label: "Hoogste similarity-score",
      admin: { description: "Cosine similarity (0-1) van de best passende bron. Leeg = geen enkele gepubliceerde/geïndexeerde trainerkennis om mee te vergelijken." },
    },
    {
      name: "gebruikteBronnen",
      type: "relationship",
      relationTo: "trainer-kennisversies",
      hasMany: true,
      label: "Gebruikte bronnen",
      admin: { description: "De trainerkennisversies die daadwerkelijk als bron voor het antwoord gebruikt zijn (leeg bij geen antwoord)." },
    },
  ],
};
