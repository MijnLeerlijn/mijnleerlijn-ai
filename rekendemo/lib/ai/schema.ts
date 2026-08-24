/**
 * JSON Schema voor de structured output van de AI. Bewust handmatig naast
 * lib/resultaat.ts onderhouden: het schema is providerinvoer, het TypeScript-
 * type is applicatiewaarheid. De validatielaag controleert of ze overeenkomen.
 */
export const WERKBLAD_SCHEMA_NAAM = "werkblad_resultaat";

export const WERKBLAD_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titel", "doel", "eiland", "taal", "leerjaar", "opgaven"],
  properties: {
    titel: {
      type: "string",
      description: "Korte titel van het werkblad, in de gekozen taal.",
    },
    doel: {
      type: "string",
      description:
        "Het rekendoel zoals het op het werkblad komt te staan, in de gekozen taal.",
    },
    eiland: { type: "string", enum: ["aruba", "curacao"] },
    taal: {
      type: "string",
      description: "Naam van de taal waarin de opgaven geschreven zijn.",
    },
    leerjaar: { type: "integer" },
    opgaven: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "type",
          "vraag",
          "antwoord",
          "berekening",
          "context",
          "illustrationDescription",
          "illustrationType",
        ],
        properties: {
          id: {
            type: "string",
            description: "Uniek id, bijvoorbeeld 'opgave-1'.",
          },
          type: { type: "string", enum: ["kaal", "verhaal"] },
          vraag: { type: "string" },
          antwoord: {
            type: "string",
            description: "Het eenduidige antwoord, zonder uitleg.",
          },
          berekening: {
            type: ["string", "null"],
            description: "De kale berekening, bijvoorbeeld '3 x 6 = 18'.",
          },
          context: {
            type: ["string", "null"],
            description:
              "Korte aanduiding van de gebruikte context bij verhaalsommen, bijvoorbeeld 'markt'. Null bij kale sommen.",
          },
          illustrationDescription: {
            type: ["string", "null"],
            description:
              "Beschrijving van de passende educatieve tekening bij verhaalsommen. Null bij kale sommen.",
          },
          illustrationType: {
            type: ["string", "null"],
            enum: ["context", "exact-count", null],
            description:
              "Bij verhaalsommen: 'exact-count' als de leerling voorwerpen in de tekening moet tellen om de som op te lossen, anders 'context'. Null bij kale sommen.",
          },
        },
      },
    },
  },
} as const;
