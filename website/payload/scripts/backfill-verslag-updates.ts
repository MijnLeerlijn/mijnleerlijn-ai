import { getPayload } from "payload";
import config from "../../payload.config";
import { schrijfVerslagUpdateIdempotent, schrijfVerslagVelden, bouwVerslagWeergaveTekst, type VerslagRecord } from "@/lib/trainers/verslag";
import { berekenVerslagUpdateBackfillRapport } from "@/lib/trainers/verslag-backfill-rapport";

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

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  console.log(`\n=== VERSLAG-UPDATE BACKFILL ${apply ? "(--apply)" : "(DRY-RUN)"} ===\n`);

  const payload = await getPayload({ config });

  // Rapport (aantallen + per-rij status/geplande writes) komt altijd uit de
  // gedeelde, puur-lezende module — exact dezelfde die de tijdelijke
  // productie-diagnoseroute gebruikt.
  const rapport = await berekenVerslagUpdateBackfillRapport(payload);

  console.table(
    rapport.regels.map((r) => ({
      "Verslag-ID": r.verslagId,
      "Board4-ID": r.mondayTrainingId,
      "Trainerboard-item-ID": r.mondayTrainerboardItemId ?? "-",
      "School-ID": r.mondaySchoolId,
      "Training-update-status": r.trainingUpdateStatus,
      "School-update-status": r.schoolUpdateStatus,
      "Gepland: training": r.trainingOntbreekt ? "JA" : "nee",
      "Gepland: school": r.schoolOntbreekt ? "JA" : "nee",
      Overgeslagen: r.zouWordenOvergeslagenBijApply ? "JA (geen Update-tekst op te bouwen)" : "",
    }))
  );

  if (!apply) {
    console.log("\n--- Totalen ---");
    console.log(`Verslagen gecontroleerd (status bevestigd/voltooid): ${rapport.totaalVerslagen}`);
    console.log(`Training-updates GEPLAND: ${rapport.ontbrekendeTrainingUpdates}`);
    console.log(`School-updates GEPLAND:   ${rapport.ontbrekendeSchoolUpdates}`);
    console.log(`Zouden worden overgeslagen: ${rapport.overgeslagen}`);
    console.log("\nDit was een dry-run — er is niets naar Monday of de database geschreven. Voeg --apply toe om echt te schrijven.");
    return;
  }

  // --apply: hier pas de volledige rijen ophalen (inclusief de velden die
  // nodig zijn om de Update-tekst te bouwen) — de gedeelde, puur-lezende
  // module hierboven kent deze velden bewust niet.
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

  let daadwerkelijkeTrainingUpdates = 0;
  let daadwerkelijkeSchoolUpdates = 0;
  let fouten = 0;

  for (const rij of rijen) {
    const trainingOntbreekt = !(rij.trainingUpdateStatus === "geschreven" && Boolean(rij.trainingUpdateMondayId));
    const schoolOntbreekt = !(rij.schoolUpdateStatus === "geschreven" && Boolean(rij.schoolUpdateMondayId));
    if (!trainingOntbreekt && !schoolOntbreekt) continue;

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

  console.log("\n--- Totalen ---");
  console.log(`Verslagen gecontroleerd (status bevestigd/voltooid): ${rapport.totaalVerslagen}`);
  console.log(`Training-updates daadwerkelijk toegevoegd: ${daadwerkelijkeTrainingUpdates} (van ${rapport.ontbrekendeTrainingUpdates} gepland)`);
  console.log(`School-updates daadwerkelijk toegevoegd:   ${daadwerkelijkeSchoolUpdates} (van ${rapport.ontbrekendeSchoolUpdates} gepland)`);
  console.log(`Fouten/overgeslagen:                       ${fouten}`);
  if (fouten === 0 && daadwerkelijkeTrainingUpdates + daadwerkelijkeSchoolUpdates === rapport.ontbrekendeTrainingUpdates + rapport.ontbrekendeSchoolUpdates) {
    console.log("\n✔ Backfill voltooid — alle geplande Updates zijn geschreven, geen fouten.");
  } else {
    console.log("\n⚠ Backfill afgerond MET aandachtspunten — zie de regels hierboven. Draai het script nogmaals (--apply) om veilig te hervatten.");
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("Backfill mislukt:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
