import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Productieregressie-vervolgronde (2026-08-27, spec "na # hoor ik géén
// afsluittekst meer") — root cause: het afsluitende "Bedankt..."-bericht kon
// zowel vanuit het expliciete '#'-pad (verwerkOpnameToets) als vanuit de
// call.recording.saved-fallback (route.ts, bedoeld voor het geval '#' NOOIT
// werd ingedrukt) getriggerd worden, met hetzelfde deterministische
// command_id — een tweede, near-simultane speak-poging kon zo de eerste,
// daadwerkelijk hoorbare uitspraak verstoren. Dit veld is de atomaire claim
// (oproep-state.ts se claimAfsluitboodschap) die garandeert dat de
// afsluitboodschap voortaan vanuit precies één van de twee triggers wordt
// gestart.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "afsluitboodschap_gestart_op" timestamp(3) with time zone;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "afsluitboodschap_gestart_op";`);
}
