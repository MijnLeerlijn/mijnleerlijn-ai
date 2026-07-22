import type { Block } from "payload";

// ContentBlock type "genummerde_stap". Het stapnummer wordt bewust NIET hier
// opgeslagen, maar berekend bij het opvragen (services/payload.ts) door
// "genummerde_stap"-blokken binnen dezelfde sectie te tellen — zelfde
// aanpak als lib/data/factory.ts in Fase 3. Dit voorkomt een handmatig
// volgnummer dat kan gaan afwijken van de werkelijke blokvolgorde.
export const GenummerdeStapBlock: Block = {
  slug: "genummerde_stap",
  labels: { singular: "Genummerde stap", plural: "Genummerde stappen" },
  fields: [{ name: "body", type: "textarea", required: true, label: "Stap" }],
};
