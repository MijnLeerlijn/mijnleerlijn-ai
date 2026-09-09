import { getPayload } from "payload";
import config from "../../payload.config";
import { schrijfVerslagUpdateIdempotent, schrijfVerslagVelden, bouwVerslagWeergaveTekst, type VerslagRecord } from "@/lib/trainers/verslag";

/**
 * Eenmalige backfill voor de verslag-Update-writeback-regressie
 * (Upsell-ronde 2026-09-02 t/m de forward fix van 2026-09-09, zie commit
 * 90bdf72). Vult UITSLUITEND ontbrekende Monday-Updates aan voor al
 * bevestigde/voltooide verslagen — nooit meer.
 *
 * Gebruik:
 *   node --env-file=.env node_modules/.bin/tsx payload/scripts/backfill-verslag-updates.ts            (dry-run)
 *   node --env-file=.env node_modules/.bin/tsx payload/scripts/backfill-verslag-updates.ts -- --apply  (echte run)
 *
 * Vereist bij --apply: TRAINER_MONDAY_VERSLAG_ENABLED=true in de omgeving
 * — dit script roept exact dezelfde, ongewijzigde schrijfVerslagUpdateIdempotent()
 * aan als bevestigVerslag() zelf, inclusief diens eigen flag-poort. Zonder
 * die flag keert elke aanroep stil terug als "niet_geactiveerd" — geen
 * fout, maar ook geen enkele write.
 *
 * Garanties (ontleend aan schrijfVerslagUpdateIdempotent/claimUpdateSlot,
 * hier ONGEWIJZIGD hergebruikt — dit script bevat zelf geen enkele
 * Monday-schrijflogica):
 *  - nooit een bestaande Monday-Update overschrijven (idempotentiecontrole
 *    op exacte tekst, plus de lokale training_update_status/
 *    school_update_status-kolommen als eerste, snelle laag);
 *  - nooit een nieuw Monday-item aanmaken (uitsluitend create_update op een
 *    al-bestaand item-ID);
 *  - training en school volledig onafhankelijk van elkaar behandeld;
 *  - nooit status/datum/trainer/logboek-vinkje aangeraakt — dit script
 *    roept werkTrainingBij() nergens aan;
 *  - idempotent: een tweede dry-run ná een succesvolle --apply toont voor
 *    elke rij "0 geplande writes", want de tellingen zijn puur afgeleid
 *    van dezelfde training_update_status/school_update_status-kolommen
 *    die --apply zojuist bijwerkte.
 */

interface RapportRegel {
  "Verslag-ID": number;
  "Board4-ID": string;
  "Trainerboard-item-ID": string;
  "School-ID": string;
  "Training-update-status": string;
  "School-update-status": string;
  "Gepland: training": string;
  "Gepland: school": string;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  console.log(`\n=== VERSLAG-UPDATE BACKFILL ${apply ? "(--apply)" : "(DRY-RUN)"} ===\n`);

  const payload = await getPayload({ config });

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

  const rapport: RapportRegel[] = [];
  let geplandeTrainingUpdates = 0;
  let geplandeSchoolUpdates = 0;
  let daadwerkelijkeTrainingUpdates = 0;
  let daadwerkelijkeSchoolUpdates = 0;
  let fouten = 0;

  for (const rij of rijen) {
    const trainingOntbreekt = !(rij.trainingUpdateStatus === "geschreven" && Boolean(rij.trainingUpdateMondayId));
    const schoolOntbreekt = !(rij.schoolUpdateStatus === "geschreven" && Boolean(rij.schoolUpdateMondayId));

    if (trainingOntbreekt) geplandeTrainingUpdates += 1;
    if (schoolOntbreekt) geplandeSchoolUpdates += 1;

    rapport.push({
      "Verslag-ID": rij.id,
      "Board4-ID": rij.mondayTrainingId,
      "Trainerboard-item-ID": rij.mondayTrainerboardItemId ?? "-",
      "School-ID": rij.mondaySchoolId,
      "Training-update-status": rij.trainingUpdateStatus,
      "School-update-status": rij.schoolUpdateStatus,
      "Gepland: training": trainingOntbreekt ? "JA" : "nee",
      "Gepland: school": schoolOntbreekt ? "JA" : "nee",
    });

    if (!apply || (!trainingOntbreekt && !schoolOntbreekt)) continue;

    const updateTekst = bouwVerslagWeergaveTekst({
      bevestigdOp: rij.bevestigdOp,
      bevestigdDoorTrainerNaam: rij.bevestigdDoorTrainerNaam,
      schoolNaam: rij.schoolNaam ?? "",
      trainingNaam: rij.trainingNaam ?? "",
      definitieveTekst: rij.definitieveTekst,
    });
    if (!updateTekst) {
      console.log(`  [OVERGESLAGEN] verslag ${rij.id}: kan geen Update-tekst opbouwen (bevestigdOp/bevestigdDoorTrainerNaam/definitieveTekst ontbreekt) — handmatige controle nodig, geen gok.`);
      fouten += 1;
      continue;
    }

    if (trainingOntbreekt) {
      const uitkomst = await schrijfVerslagUpdateIdempotent(payload, rij.id, "training", rij.mondayTrainingId, updateTekst, {
        status: rij.trainingUpdateStatus,
        mondayUpdateId: rij.trainingUpdateMondayId,
      });
      console.log(`  [training] verslag ${rij.id} (Board4 ${rij.mondayTrainingId}) -> ${uitkomst.status}: ${uitkomst.boodschap}`);
      if (uitkomst.status === "mislukt" || (uitkomst.status === "geschreven" && rij.trainingUpdateMondayId !== uitkomst.mondayUpdateId)) {
        await schrijfVerslagVelden(payload, rij.id, {
          training_update_status: uitkomst.status,
          training_update_monday_id: uitkomst.mondayUpdateId,
        });
      }
      if (uitkomst.status === "geschreven") daadwerkelijkeTrainingUpdates += 1;
      if (uitkomst.status === "mislukt") fouten += 1;
    }

    if (schoolOntbreekt) {
      const uitkomst = await schrijfVerslagUpdateIdempotent(payload, rij.id, "school", rij.mondaySchoolId, updateTekst, {
        status: rij.schoolUpdateStatus,
        mondayUpdateId: rij.schoolUpdateMondayId,
      });
      console.log(`  [school]   verslag ${rij.id} (school ${rij.mondaySchoolId}) -> ${uitkomst.status}: ${uitkomst.boodschap}`);
      if (uitkomst.status === "mislukt" || (uitkomst.status === "geschreven" && rij.schoolUpdateMondayId !== uitkomst.mondayUpdateId)) {
        await schrijfVerslagVelden(payload, rij.id, {
          school_update_status: uitkomst.status,
          school_update_monday_id: uitkomst.mondayUpdateId,
        });
      }
      if (uitkomst.status === "geschreven") daadwerkelijkeSchoolUpdates += 1;
      if (uitkomst.status === "mislukt") fouten += 1;
    }
  }

  console.table(rapport);

  console.log("\n--- Totalen ---");
  console.log(`Verslagen gecontroleerd (status bevestigd/voltooid): ${rijen.length}`);
  if (apply) {
    console.log(`Training-updates daadwerkelijk toegevoegd: ${daadwerkelijkeTrainingUpdates} (van ${geplandeTrainingUpdates} gepland)`);
    console.log(`School-updates daadwerkelijk toegevoegd:   ${daadwerkelijkeSchoolUpdates} (van ${geplandeSchoolUpdates} gepland)`);
    console.log(`Fouten/overgeslagen:                       ${fouten}`);
    if (fouten === 0 && daadwerkelijkeTrainingUpdates + daadwerkelijkeSchoolUpdates === geplandeTrainingUpdates + geplandeSchoolUpdates) {
      console.log("\n✔ Backfill voltooid — alle geplande Updates zijn geschreven, geen fouten.");
    } else {
      console.log("\n⚠ Backfill afgerond MET aandachtspunten — zie de regels hierboven. Draai het script nogmaals (--apply) om veilig te hervatten.");
      process.exitCode = 1;
    }
  } else {
    console.log(`Training-updates GEPLAND: ${geplandeTrainingUpdates}`);
    console.log(`School-updates GEPLAND:   ${geplandeSchoolUpdates}`);
    console.log("\nDit was een dry-run — er is niets naar Monday of de database geschreven. Voeg --apply toe om echt te schrijven.");
  }

  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error("Backfill mislukt:", error instanceof Error ? error.message : error);
  process.exit(1);
});
