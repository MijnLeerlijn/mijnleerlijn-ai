import type { Payload } from "payload";
import { vandaagIso } from "./format-datum";

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
 * Pure predicaat, GEEN Payload-afhankelijkheid — bewust ook bruikbaar vanuit
 * client components (SalesVandaagView.tsx/SalesScholenView.tsx) die dezelfde
 * "heeft deze school al een geldige Monday-planning"-vraag client-side
 * moeten beantwoorden (ze draaien op Payload's REST-API, niet de Local API,
 * en kunnen vindScholenZonderVervolgactieGesplitst() dus niet zelf
 * aanroepen) — precies het "hergebruik dezelfde regel overal"-principe
 * zonder een aparte REST-endpoint nodig te hebben, want de client heeft
 * mondayVolgendeActieDatum al in de al-opgehaalde schooldata.
 */
export function heeftGeldigeMondayPlanning(mondayVolgendeActieDatum: string | null | undefined): boolean {
  if (!mondayVolgendeActieDatum) return false;
  return mondayVolgendeActieDatum.slice(0, 10) >= vandaagIso();
}

// Productiecorrectie (2026-08-16) — ROOT CAUSE van "school met een geldige
// Monday-planning verscheen toch in Aandacht nodig": deze functie leidde
// "heeft een plan" voorheen UITSLUITEND af uit het BESTAAN van een lokale
// sales-action of een pending voorstel — nooit een directe check op
// mondayVolgendeActieDatum zelf. Een school waarvan iemand de Monday-datum
// rechtstreeks in de kolom zet (geen begeleidende Update/comment) triggert
// geen enkel lokaal record (sync se herevalueerScholenMetNieuweActiviteit
// draait alleen bij nieuwe, niet-gemigreerde Update-activiteit) en bleef zo
// onterecht als "zonder vervolgactie" gelden. Nu: een school met een
// niet-verlopen mondayVolgendeActieDatum telt als "gepland in Monday",
// ongeacht of er al een lokaal record voor bestaat — pas een VERLOPEN
// Monday-datum (of helemaal geen datum) zonder lokaal record telt nog als
// "aandacht nodig".
export interface AandachtResultaat {
  /** Écht zonder enige vervolgstap — geen lokale actie/voorstel, en geen (niet-verlopen) Monday-planning. */
  zonderVervolgactie: SchoolZonderVervolgactie[];
  /** Heeft een niet-verlopen mondayVolgendeActieDatum maar (nog) geen lokaal record — geen aandacht nodig, wél zichtbaar als "Gepland in Monday". */
  geplandInMonday: SchoolZonderVervolgactie[];
}

async function vindActieveScholenZonderLokaalRecord(payload: Payload): Promise<SchoolZonderVervolgactie[]> {
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

/**
 * Actieve scholen zonder open actie én zonder pending volgende_actie-/
 * bestaande_vervolgdatum-voorstel, opgesplitst in "écht zonder vervolgstap"
 * en "gepland in Monday" (zie AandachtResultaat hierboven). Server-side
 * (Payload Local API), gebruikt overrideAccess: true — de aanroeper is zelf
 * verantwoordelijk voor autorisatie (zelfde patroon als de rest van
 * lib/sales/*).
 */
export async function vindScholenZonderVervolgactieGesplitst(payload: Payload): Promise<AandachtResultaat> {
  const kandidaten = await vindActieveScholenZonderLokaalRecord(payload);

  const zonderVervolgactie: SchoolZonderVervolgactie[] = [];
  const geplandInMonday: SchoolZonderVervolgactie[] = [];
  for (const school of kandidaten) {
    if (heeftGeldigeMondayPlanning(school.mondayVolgendeActieDatum)) {
      geplandInMonday.push(school);
    } else {
      zonderVervolgactie.push(school);
    }
  }
  return { zonderVervolgactie, geplandInMonday };
}

/**
 * Achterwaarts-compatibele vorm: écht-zonder-vervolgstap ÉN gepland-in-
 * Monday samen — bestaande aanroepers (backfill-vooraf-telling) die willen
 * weten "voor hoeveel scholen zou een AI-beoordeling iets kunnen opleveren"
 * hebben nog steeds de volledige kandidatenlijst nodig (beoordeelSchool zelf
 * bepaalt daarna of een Monday-datum al genoeg is voor een voorstel — zie
 * backfill.ts). UI-lagen die specifiek de "Aandacht nodig"-categorie tonen
 * gebruiken voortaan vindScholenZonderVervolgactieGesplitst().zonderVervolgactie.
 */
export async function vindActieveScholenZonderVervolgactie(payload: Payload): Promise<SchoolZonderVervolgactie[]> {
  return vindActieveScholenZonderLokaalRecord(payload);
}
