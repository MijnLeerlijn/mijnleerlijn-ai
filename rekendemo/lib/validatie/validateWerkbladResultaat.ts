import { profielVoorEiland } from "@/lib/locales";
import { VERBODEN_TERMEN } from "@/lib/locales/gedeeld";
import type { WerkbladResultaat } from "@/lib/resultaat";
import type { WerkbladInstellingen } from "@/lib/werkblad";
import { controleerOpgave } from "./rekencontrole";

export type ValidatieUitkomst = {
  geldig: boolean;
  fouten: string[];
};

export type ValidatieContext = {
  instellingen: WerkbladInstellingen;
};

/**
 * Eén controle op het resultaat. Nieuwe regels toevoegen = een functie
 * schrijven en hem in VALIDATIE_REGELS opnemen.
 */
export type ValidatieRegel = (
  resultaat: WerkbladResultaat,
  context: ValidatieContext,
) => string[];

/** Alle tekst waarin we op verboden context zoeken. */
function alleTekst(resultaat: WerkbladResultaat): string {
  return [
    resultaat.titel,
    resultaat.doel,
    ...resultaat.opgaven.flatMap((opgave) => [
      opgave.vraag,
      opgave.antwoord,
      opgave.berekening ?? "",
      opgave.context ?? "",
      opgave.illustrationDescription ?? "",
    ]),
  ].join("\n");
}

function alsRegex(term: string): RegExp {
  const ontsnapt = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Woordgrens alleen bij termen die met een letter beginnen/eindigen; anders
  // zou "€" nooit matchen.
  const voor = /^[\p{L}\p{N}]/u.test(term) ? "\\b" : "";
  const na = /[\p{L}\p{N}]$/u.test(term) ? "\\b" : "";
  return new RegExp(`${voor}${ontsnapt}${na}`, "iu");
}

const aantalOpgavenRegel: ValidatieRegel = (resultaat, { instellingen }) => {
  if (resultaat.opgaven.length !== instellingen.aantalOpgaven) {
    return [
      `Er zijn ${resultaat.opgaven.length} opgaven gegenereerd in plaats van ${instellingen.aantalOpgaven}.`,
    ];
  }
  return [];
};

const uniekeIdsRegel: ValidatieRegel = (resultaat) => {
  const gezien = new Set<string>();
  const dubbel = new Set<string>();

  for (const opgave of resultaat.opgaven) {
    if (gezien.has(opgave.id)) dubbel.add(opgave.id);
    gezien.add(opgave.id);
  }

  return dubbel.size > 0
    ? [`Deze opgave-id's komen meer dan één keer voor: ${[...dubbel].join(", ")}.`]
    : [];
};

const gevraagdTypeRegel: ValidatieRegel = (resultaat, { instellingen }) => {
  const kaal = resultaat.opgaven.filter((opgave) => opgave.type === "kaal").length;
  const verhaal = resultaat.opgaven.length - kaal;

  if (instellingen.opgaveType === "kaal" && verhaal > 0) {
    return [`Er zijn ${verhaal} verhaalsommen terwijl alleen kale sommen gevraagd zijn.`];
  }
  if (instellingen.opgaveType === "verhaal" && kaal > 0) {
    return [`Er zijn ${kaal} kale sommen terwijl alleen verhaalsommen gevraagd zijn.`];
  }
  // Bij een combinatie mag het verschil hoogstens één opgave zijn.
  if (instellingen.opgaveType === "combinatie" && Math.abs(kaal - verhaal) > 1) {
    return [
      `De verdeling is niet ongeveer half om half: ${kaal} kale sommen en ${verhaal} verhaalsommen.`,
    ];
  }
  return [];
};

const verhaalsomRegel: ValidatieRegel = (resultaat) => {
  const fouten: string[] = [];

  resultaat.opgaven.forEach((opgave, index) => {
    if (opgave.type !== "verhaal") return;
    const nummer = index + 1;
    if (!opgave.context) fouten.push(`Verhaalsom ${nummer} heeft geen context.`);
    if (!opgave.illustrationDescription) {
      fouten.push(`Verhaalsom ${nummer} heeft geen illustrationDescription.`);
    }
    if (!opgave.illustrationType) {
      fouten.push(
        `Verhaalsom ${nummer} heeft geen illustrationType ('context' of 'exact-count').`,
      );
    }
  });

  return fouten;
};

const metadataRegel: ValidatieRegel = (resultaat, { instellingen }) => {
  const fouten: string[] = [];

  if (resultaat.eiland !== instellingen.eiland) {
    fouten.push(
      `Het resultaat hoort bij eiland '${resultaat.eiland}' in plaats van '${instellingen.eiland}'.`,
    );
  }
  if (resultaat.leerjaar !== instellingen.leerjaar) {
    fouten.push(
      `Het resultaat hoort bij leerjaar ${resultaat.leerjaar} in plaats van ${instellingen.leerjaar}.`,
    );
  }

  return fouten;
};

const verbodenTermenRegel: ValidatieRegel = (resultaat, { instellingen }) => {
  const tekst = alleTekst(resultaat);
  const doel = instellingen.rekendoel;

  // Termen die de leerkracht zelf in het rekendoel gebruikt zijn toegestaan.
  const gevonden = VERBODEN_TERMEN.filter(
    (term) => alsRegex(term).test(tekst) && !alsRegex(term).test(doel),
  );

  return gevonden.length > 0
    ? [`Nederlandse context gevonden die niet in het rekendoel staat: ${gevonden.join(", ")}.`]
    : [];
};

const valutaRegel: ValidatieRegel = (resultaat, { instellingen }) => {
  const tekst = alleTekst(resultaat);
  const anderEiland = instellingen.eiland === "aruba" ? "curacao" : "aruba";
  const anders = profielVoorEiland(anderEiland).valuta;
  const eigen = profielVoorEiland(instellingen.eiland).valuta;

  const verkeerd = [anders.notatie, anders.code, anders.naam].filter((term) =>
    alsRegex(term).test(tekst),
  );

  return verkeerd.length > 0
    ? [
        `Er wordt een valuta van het andere eiland gebruikt (${verkeerd.join(", ")}); verwacht was ${eigen.notatie} (${eigen.code}).`,
      ]
    : [];
};

/**
 * Rekent eenvoudige berekeningen na. Opgaven die we niet veilig kunnen lezen
 * blijven ongemoeid; alleen aantoonbare rekenfouten geven een validatiefout.
 */
const rekencontroleRegel: ValidatieRegel = (resultaat) =>
  resultaat.opgaven.flatMap((opgave, index) =>
    controleerOpgave(opgave).meldingen.map(
      (melding) => `Opgave ${index + 1} ${melding}`,
    ),
  );

/** Volgorde bepaalt de volgorde van de foutmeldingen. */
export const VALIDATIE_REGELS: ValidatieRegel[] = [
  aantalOpgavenRegel,
  uniekeIdsRegel,
  gevraagdTypeRegel,
  verhaalsomRegel,
  metadataRegel,
  verbodenTermenRegel,
  valutaRegel,
  rekencontroleRegel,
];

export function validateWerkbladResultaat(
  resultaat: WerkbladResultaat,
  context: ValidatieContext,
): ValidatieUitkomst {
  const fouten = VALIDATIE_REGELS.flatMap((regel) => regel(resultaat, context));
  return { geldig: fouten.length === 0, fouten };
}
