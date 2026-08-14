import type { Payload } from "payload";

// Sales UX-ronde 3 (2026-08-14) — root cause van "Type school ingevuld in
// Monday + Sync nu, maar Onderwijstype blijft leeg": sync.ts las de
// dropdown_mm4v9rvg-kolom nooit uit voor sales-schools.onderwijstype; het
// enige bestaande mechanisme (lib/sales/enrichment.ts) RAADT het type uit
// vrije contactnotities via AI en negeert de structured dropdown-waarde
// volledig. Dit bestand is de ONTBREKENDE, deterministische schakel: de
// daadwerkelijke Monday-labelwaarde rechtstreeks koppelen aan een bestaande
// variants-record.
//
// Bewust GEEN hardcoded label->variant-ID-tabel: dat zou een mapping
// "verzinnen" zonder de echte productie-variantdata te kennen (expliciete
// opdrachtseis). In plaats daarvan een levende, testbare match tegen
// variants.educationType (case-insensitief, exact) — zodra een variant met
// die naam bestaat werkt de koppeling vanzelf, zonder codewijziging. Een
// Monday-waarde zonder match wordt expliciet "onbekend" (aanroeper markeert/
// logt dit), nooit stilzwijgend genegeerd én nooit een gok.
export interface VariantVoorTypeSchoolMapping {
  id: number;
  educationType: string;
}

export type TypeSchoolMappingUitkomst =
  | { status: "gematcht"; variantId: number }
  | { status: "onbekend"; mondayLabel: string }
  | { status: "leeg" };

/**
 * Pure functie, geen database-toegang — rechtstreeks en deterministisch
 * testbaar. `mondayLabel` is de rauwe .text-waarde van de Monday-
 * dropdownkolom (kan null/leeg zijn, kan een onbekend label zijn).
 */
export function vindVariantVoorTypeSchool(mondayLabel: string | null, varianten: VariantVoorTypeSchoolMapping[]): TypeSchoolMappingUitkomst {
  const genormaliseerd = mondayLabel?.trim().toLowerCase();
  if (!genormaliseerd) return { status: "leeg" };

  const match = varianten.find((v) => v.educationType.trim().toLowerCase() === genormaliseerd);
  if (match) return { status: "gematcht", variantId: match.id };

  return { status: "onbekend", mondayLabel: mondayLabel!.trim() };
}

/** Eén keer per sync-run opgehaald (niet per school) — zie synchroniseerScholen() in sync.ts. */
export async function haalVariantenVoorTypeSchoolMapping(payload: Payload): Promise<VariantVoorTypeSchoolMapping[]> {
  const resultaat = await payload.find({
    collection: "variants",
    limit: 200,
    overrideAccess: true,
    depth: 0,
  });
  return (resultaat.docs as unknown as { id: number; educationType: string }[]).map((v) => ({ id: v.id, educationType: v.educationType }));
}
