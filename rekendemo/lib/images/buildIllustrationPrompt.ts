import { profielVoorEiland } from "@/lib/locales";
import type { EilandId, LeerjaarId } from "@/lib/werkblad";
import {
  COMPOSITIE_REGELS,
  KINDEREN_REGELS,
  VASTE_STIJLPROMPT,
  VERBODEN_ELEMENTEN,
} from "./style";

export type IllustratieVerzoek = {
  eiland: EilandId;
  leerjaar: LeerjaarId;
  /** De beschrijving die de werkblad-AI bij de verhaalsom heeft bedacht. */
  illustrationDescription: string;
  /** Optionele wens van de leerkracht; aanvullend, nooit leidend. */
  tekenwens?: string;
};

/** Leerjaar 1 begint rond zes jaar; genoeg voor "hoe oud zien de kinderen eruit". */
function leeftijdIndicatie(leerjaar: LeerjaarId): number {
  return leerjaar + 5;
}

function opsomming(items: string[]): string {
  return items.join(" ");
}

/**
 * Bouwt de volledige beeldprompt: vaste stijl → eilandcontext → de beschrijving
 * van de som → optionele tekenwens → compositie- en veiligheidsregels.
 * Bevat nooit sleutels of andere configuratie.
 */
export function buildIllustrationPrompt(verzoek: IllustratieVerzoek): string {
  const profiel = profielVoorEiland(verzoek.eiland);
  const leeftijd = leeftijdIndicatie(verzoek.leerjaar);
  const tekenwens = verzoek.tekenwens?.trim();

  const delen = [
    VASTE_STIJLPROMPT,
    `Setting: ${profiel.beeldOmgeving}.`,
    `Scene: ${verzoek.illustrationDescription.trim()}`,
    `Any children shown are around ${leeftijd} years old: ${KINDEREN_REGELS.join("; ")}.`,
  ];

  if (tekenwens) {
    delen.push(
      `Preference from the teacher, follow it where it fits the scene, never at the cost of the scene itself: ${tekenwens}`,
    );
  }

  delen.push(
    `Composition: ${opsomming(COMPOSITIE_REGELS)}`,
    `Strictly avoid: ${VERBODEN_ELEMENTEN.join("; ")}.`,
  );

  return delen.join("\n");
}
