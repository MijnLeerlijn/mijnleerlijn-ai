import type {
  IllustratieType,
  Opgave,
  OpgaveType,
  WerkbladResultaat,
} from "@/lib/resultaat";
import type { EilandId } from "@/lib/werkblad";

/**
 * Vormcontrole: zet onbekende AI-output om naar een WerkbladResultaat of geeft
 * aan wat er structureel mis is. Inhoudelijke regels staan in
 * validateWerkbladResultaat.
 */
export type ParseResultaat =
  | { ok: true; resultaat: WerkbladResultaat }
  | { ok: false; fouten: string[] };

const OPGAVE_TYPEN: OpgaveType[] = ["kaal", "verhaal"];
const ILLUSTRATIE_TYPEN: IllustratieType[] = ["context", "exact-count"];
const EILANDEN: EilandId[] = ["aruba", "curacao"];

function isRecord(waarde: unknown): waarde is Record<string, unknown> {
  return typeof waarde === "object" && waarde !== null && !Array.isArray(waarde);
}

function tekstOfNull(waarde: unknown): string | null {
  if (typeof waarde !== "string") return null;
  const geknipt = waarde.trim();
  return geknipt.length > 0 ? geknipt : null;
}

export function parseWerkbladResultaat(onbekend: unknown): ParseResultaat {
  const fouten: string[] = [];

  if (!isRecord(onbekend)) {
    return { ok: false, fouten: ["De AI gaf geen JSON-object terug."] };
  }

  const titel = tekstOfNull(onbekend.titel);
  const doel = tekstOfNull(onbekend.doel);
  const taal = tekstOfNull(onbekend.taal);
  const eiland = EILANDEN.find((optie) => optie === onbekend.eiland);
  const leerjaar =
    typeof onbekend.leerjaar === "number" && Number.isInteger(onbekend.leerjaar)
      ? onbekend.leerjaar
      : null;

  if (!titel) fouten.push("Veld 'titel' ontbreekt of is leeg.");
  if (!doel) fouten.push("Veld 'doel' ontbreekt of is leeg.");
  if (!taal) fouten.push("Veld 'taal' ontbreekt of is leeg.");
  if (!eiland) fouten.push("Veld 'eiland' ontbreekt of heeft een onbekende waarde.");
  if (leerjaar === null) fouten.push("Veld 'leerjaar' ontbreekt of is geen getal.");

  if (!Array.isArray(onbekend.opgaven)) {
    fouten.push("Veld 'opgaven' ontbreekt of is geen lijst.");
    return { ok: false, fouten };
  }

  const opgaven: Opgave[] = [];

  onbekend.opgaven.forEach((ruw, index) => {
    const nummer = index + 1;

    if (!isRecord(ruw)) {
      fouten.push(`Opgave ${nummer} is geen object.`);
      return;
    }

    const type = OPGAVE_TYPEN.find((optie) => optie === ruw.type);
    const id = tekstOfNull(ruw.id) ?? `opgave-${nummer}`;
    const vraag = tekstOfNull(ruw.vraag);
    const antwoord = tekstOfNull(ruw.antwoord);

    if (!type) {
      fouten.push(`Opgave ${nummer} heeft een onbekend type.`);
      return;
    }
    if (!vraag) fouten.push(`Opgave ${nummer} heeft geen vraag.`);
    if (!antwoord) fouten.push(`Opgave ${nummer} heeft geen antwoord.`);
    if (!vraag || !antwoord) return;

    const isVerhaal = type === "verhaal";

    opgaven.push({
      id,
      type,
      vraag,
      antwoord,
      berekening: tekstOfNull(ruw.berekening),
      // Kale sommen hebben geen context of tekening nodig; als de AI ze toch
      // meestuurt laten we ze hier vallen zodat de rest van de app één vorm ziet.
      context: isVerhaal ? tekstOfNull(ruw.context) : null,
      illustrationDescription: isVerhaal
        ? tekstOfNull(ruw.illustrationDescription)
        : null,
      illustrationType: isVerhaal
        ? (ILLUSTRATIE_TYPEN.find((optie) => optie === ruw.illustrationType) ?? null)
        : null,
    });
  });

  if (fouten.length > 0 || !titel || !doel || !taal || !eiland || leerjaar === null) {
    return { ok: false, fouten };
  }

  return {
    ok: true,
    resultaat: { titel, doel, eiland, taal, leerjaar, opgaven },
  };
}
