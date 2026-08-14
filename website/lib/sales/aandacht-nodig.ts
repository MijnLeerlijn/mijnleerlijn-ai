import type { Payload } from "payload";

// Sales UX V2 (2026-08-14) — enige bron van waarheid voor "een actieve
// school heeft nog geen vervolgactie gepland": gebruikt door de
// backfill-vooraf-telling, de dashboardwidget (tier 4) en, via de export
// PENDING_VOORSTEL_TYPES_VOOR_AANDACHT, ook door de client-side Vandaag-/
// Scholenoverzicht-fetches (die op Payload's REST-API draaien, niet de Local
// API, en dus deze functie zelf niet kunnen aanroepen — wel dezelfde
// criteria moeten gebruiken).
//
// "Heeft een voorstel" betekent hier bewust specifiek een pending
// `volgende_actie`- of `bestaande_vervolgdatum`-voorstel — NIET elk pending
// voorstel: een pending `veld_correctie`-voorstel (bv. Type school) zegt
// niets over of er een vervolgstap gepland is, en telt daarom niet mee.
// Zelfde criterium als lib/sales/backfill.ts se beoordeelSchool().
export const PENDING_VOORSTEL_TYPES_VOOR_AANDACHT = ["volgende_actie", "bestaande_vervolgdatum"] as const;

export interface SchoolZonderVervolgactie {
  id: number;
  schoolName: string;
  relatiestatus: string | null;
  salesfase: string | null;
  plaats: string | null;
  lastMondayActivityAt: string | null;
  mondayVolgendeActieDatum: string | null;
}

function idVan(waarde: number | { id: number }): number {
  return typeof waarde === "number" ? waarde : waarde.id;
}

/**
 * Actieve scholen zonder open actie én zonder pending volgende_actie-/
 * bestaande_vervolgdatum-voorstel — de "Aandacht nodig"-set. Server-side
 * (Payload Local API), gebruikt overrideAccess: true — de aanroeper is zelf
 * verantwoordelijk voor autorisatie (zelfde patroon als de rest van
 * lib/sales/*).
 */
export async function vindActieveScholenZonderVervolgactie(payload: Payload): Promise<SchoolZonderVervolgactie[]> {
  const [scholen, openActies, relevanteVoorstellen] = await Promise.all([
    payload.find({
      collection: "sales-schools",
      where: { actief: { equals: true } },
      limit: 5000,
      overrideAccess: true,
      depth: 0,
    }),
    payload.find({
      collection: "sales-actions",
      where: { status: { equals: "open" } },
      limit: 5000,
      overrideAccess: true,
      depth: 0,
    }),
    payload.find({
      collection: "sales-proposals",
      where: { status: { equals: "pending" }, proposalType: { in: PENDING_VOORSTEL_TYPES_VOOR_AANDACHT } },
      limit: 5000,
      overrideAccess: true,
      depth: 0,
    }),
  ]);

  const schoolIdsMetActie = new Set(openActies.docs.map((a) => idVan((a as { school: number | { id: number } }).school)));
  const schoolIdsMetVoorstel = new Set(relevanteVoorstellen.docs.map((p) => idVan((p as { school: number | { id: number } }).school)));

  return (scholen.docs as unknown as SchoolZonderVervolgactie[]).filter(
    (s) => !schoolIdsMetActie.has(s.id) && !schoolIdsMetVoorstel.has(s.id)
  );
}
