import type { WerkbladResultaat } from "@/lib/resultaat";
import { parseWerkbladResultaat } from "@/lib/validatie/parseWerkbladResultaat";
import { validateWerkbladResultaat } from "@/lib/validatie/validateWerkbladResultaat";
import type { WerkbladInstellingen } from "@/lib/werkblad";
import { validatieFout } from "./fouten";
import { bouwCorrectiePrompt, bouwGebruikersPrompt, bouwSysteemPrompt } from "./prompt";
import { maakProvider } from "./provider";
import { WERKBLAD_JSON_SCHEMA, WERKBLAD_SCHEMA_NAAM } from "./schema";

/**
 * Eén mislukte poging wordt opnieuw geprobeerd mét de gevonden fouten als
 * feedback; daarna geven we op in plaats van eindeloos te blijven proberen.
 */
const MAX_POGINGEN = 2;

export type GeneratieUitkomst = {
  resultaat: WerkbladResultaat;
  model: string;
  pogingen: number;
};

export async function generateWerkblad(
  instellingen: WerkbladInstellingen,
): Promise<GeneratieUitkomst> {
  const provider = maakProvider();
  const systeem = bouwSysteemPrompt();
  const basisPrompt = bouwGebruikersPrompt(instellingen);

  let fouten: string[] = [];

  for (let poging = 1; poging <= MAX_POGINGEN; poging++) {
    const gebruiker =
      fouten.length > 0 ? basisPrompt + bouwCorrectiePrompt(fouten) : basisPrompt;

    const ruweOutput = await provider.genereerJson({
      systeem,
      gebruiker,
      schemaNaam: WERKBLAD_SCHEMA_NAAM,
      schema: WERKBLAD_JSON_SCHEMA as unknown as Record<string, unknown>,
    });

    const geparsed = parseWerkbladResultaat(ruweOutput);

    if (!geparsed.ok) {
      fouten = geparsed.fouten;
      continue;
    }

    const gecontroleerd = validateWerkbladResultaat(geparsed.resultaat, { instellingen });

    if (gecontroleerd.geldig) {
      return { resultaat: geparsed.resultaat, model: provider.model, pogingen: poging };
    }

    fouten = gecontroleerd.fouten;
  }

  throw validatieFout(fouten);
}
