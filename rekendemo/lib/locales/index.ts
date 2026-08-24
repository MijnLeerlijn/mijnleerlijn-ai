import type { EilandId } from "@/lib/werkblad";
import { ARUBA } from "./aruba";
import { CURACAO } from "./curacao";
import type { LokaalProfiel } from "./types";

/** Registry van lokale kennisprofielen; een eiland toevoegen kan hier. */
const PROFIELEN: Record<EilandId, LokaalProfiel> = {
  aruba: ARUBA,
  curacao: CURACAO,
};

export function profielVoorEiland(eiland: EilandId): LokaalProfiel {
  return PROFIELEN[eiland];
}

export type { LokaalProfiel } from "./types";
