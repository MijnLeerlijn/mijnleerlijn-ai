import type { Payload } from "payload";
import { bouwVerslagWeergaveTekst, type VerslagRecord } from "@/lib/trainers/verslag";

/**
 * STRIKT READ-ONLY. Dit bestand importeert bewust GEEN enkele
 * schrijffunctie (geen schrijfVerslagUpdateIdempotent, geen
 * schrijfVerslagVelden, geen maakUpdate/wijzigKolomWaarde) — dat is de
 * daadwerkelijke, technische garantie dat een aanroeper van
 * berekenVerslagUpdateBackfillRapport() nooit een write kan veroorzaken,
 * ongeacht wat die aanroeper zelf doet: er is hier simpelweg niets
 * schrijfbaars om aan te roepen. `bouwVerslagWeergaveTekst` is zelf ook
 * puur (geen I/O, uitsluitend stringopbouw uit al-ingeladen velden) — puur
 * gebruikt om vooraf te bepalen of een rij bij een latere --apply zou
 * worden overgeslagen (ontbrekende bevestigdOp/bevestigdDoorTrainerNaam/
 * definitieveTekst), NIET om iets te verzenden.
 *
 * Gedeeld door:
 *  - payload/scripts/backfill-verslag-updates.ts (CLI, dry-run-deel);
 *  - app/api/admin/backfill-verslag-updates-dry-run/route.ts (tijdelijke
 *    productie-diagnoseroute, 2026-09-09 — zie de doc-comment daar).
 */

export interface VerslagUpdateBackfillRapportRegel {
  verslagId: number;
  mondayTrainingId: string;
  mondaySchoolId: string;
  mondayTrainerboardItemId: string | null;
  trainingUpdateStatus: VerslagRecord["trainingUpdateStatus"];
  schoolUpdateStatus: VerslagRecord["schoolUpdateStatus"];
  trainingOntbreekt: boolean;
  schoolOntbreekt: boolean;
  /** true = bouwVerslagWeergaveTekst zou hier null opleveren (ontbrekende bevestigdOp/bevestigdDoorTrainerNaam/definitieveTekst) — bij --apply overgeslagen, geen gok. */
  zouWordenOvergeslagenBijApply: boolean;
}

export interface VerslagUpdateBackfillRapport {
  totaalVerslagen: number;
  ontbrekendeTrainingUpdates: number;
  ontbrekendeSchoolUpdates: number;
  /** Rijen waarvoor bij --apply geen Update-tekst kan worden opgebouwd — nooit gegokt, altijd overgeslagen en apart geteld. */
  overgeslagen: number;
  regels: VerslagUpdateBackfillRapportRegel[];
}

export async function berekenVerslagUpdateBackfillRapport(payload: Payload): Promise<VerslagUpdateBackfillRapport> {
  const rijen: VerslagRecord[] = [];
  let pagina = 1;
  for (;;) {
    const resultaat = await payload.find({
      collection: "training-verslagen",
      where: { status: { in: ["bevestigd", "voltooid"] } },
      limit: 200,
      page: pagina,
      overrideAccess: true,
      depth: 0,
      sort: "id",
    });
    rijen.push(...(resultaat.docs as unknown as VerslagRecord[]));
    if (!resultaat.hasNextPage) break;
    pagina += 1;
  }

  const regels: VerslagUpdateBackfillRapportRegel[] = [];
  let ontbrekendeTrainingUpdates = 0;
  let ontbrekendeSchoolUpdates = 0;
  let overgeslagen = 0;

  for (const rij of rijen) {
    const trainingOntbreekt = !(rij.trainingUpdateStatus === "geschreven" && Boolean(rij.trainingUpdateMondayId));
    const schoolOntbreekt = !(rij.schoolUpdateStatus === "geschreven" && Boolean(rij.schoolUpdateMondayId));
    if (trainingOntbreekt) ontbrekendeTrainingUpdates += 1;
    if (schoolOntbreekt) ontbrekendeSchoolUpdates += 1;

    const zouWordenOvergeslagenBijApply =
      (trainingOntbreekt || schoolOntbreekt) &&
      bouwVerslagWeergaveTekst({
        bevestigdOp: rij.bevestigdOp,
        bevestigdDoorTrainerNaam: rij.bevestigdDoorTrainerNaam,
        schoolNaam: rij.schoolNaam ?? "",
        trainingNaam: rij.trainingNaam ?? "",
        definitieveTekst: rij.definitieveTekst,
      }) === null;
    if (zouWordenOvergeslagenBijApply) overgeslagen += 1;

    regels.push({
      verslagId: rij.id,
      mondayTrainingId: rij.mondayTrainingId,
      mondaySchoolId: rij.mondaySchoolId,
      mondayTrainerboardItemId: rij.mondayTrainerboardItemId ?? null,
      trainingUpdateStatus: rij.trainingUpdateStatus,
      schoolUpdateStatus: rij.schoolUpdateStatus,
      trainingOntbreekt,
      schoolOntbreekt,
      zouWordenOvergeslagenBijApply,
    });
  }

  return { totaalVerslagen: rijen.length, ontbrekendeTrainingUpdates, ontbrekendeSchoolUpdates, overgeslagen, regels };
}
