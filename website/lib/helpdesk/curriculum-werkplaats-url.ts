import type { Payload } from "payload";

// Curriculum Werkplaats-koppeling is niet variant-specifiek — één centrale
// URL voor de hele Helpdesk, beheerd via de Global "Helpdesk-instellingen"
// (payload/globals/HelpdeskInstellingen.ts). Leeg veld = geen koppeling
// ingesteld; components/molecules/CurriculumWerkplaatsCard.tsx wordt dan
// niet getoond, zie app/(frontend)/(public)/page.tsx.
export async function haalCurriculumWerkplaatsUrl(payload: Payload): Promise<string | undefined> {
  const instellingen = await payload.findGlobal({
    slug: "helpdesk-instellingen",
    overrideAccess: false,
    depth: 0,
  });
  const url = instellingen?.curriculumWerkplaatsUrl as string | null | undefined;
  return url ?? undefined;
}
