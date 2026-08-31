import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Upsell-ronde (2026-09-02, spec §B7/§B8) — het logboek wordt de enige
// inhoud uit deze trainer-/helpdesklaag die naar Monday geschreven wordt
// (trainingsverslagen niet meer, zie 20260901_140000_training_verslagen_
// aanvullend.ts se buurtcommentaar en lib/trainers/verslag.ts se
// bevestigVerslag). Drie nieuwe kolommen op trainer_logboek_items houden
// bij OF, en zo ja WAARHEEN, die ene schrijving lukte — zie
// lib/trainers/logboek.ts se schrijfLogboekUpdateNaarMonday.
//
// Hand-geschreven, zelfde reden als de andere trainer-migraties dit project
// (payload migrate:create loopt hier vast op een ongerelateerde interactieve
// disambiguatievraag).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trainer_logboek_items_monday_update_status" AS ENUM('niet_verzonden', 'geschreven', 'mislukt', 'niet_geactiveerd');

  ALTER TABLE "trainer_logboek_items" ADD COLUMN IF NOT EXISTS "monday_update_status" "enum_trainer_logboek_items_monday_update_status" DEFAULT 'niet_verzonden' NOT NULL;
  ALTER TABLE "trainer_logboek_items" ADD COLUMN IF NOT EXISTS "monday_school_update_id" varchar;
  ALTER TABLE "trainer_logboek_items" ADD COLUMN IF NOT EXISTS "monday_training_update_id" varchar;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trainer_logboek_items" DROP COLUMN IF EXISTS "monday_training_update_id";
  ALTER TABLE "trainer_logboek_items" DROP COLUMN IF EXISTS "monday_school_update_id";
  ALTER TABLE "trainer_logboek_items" DROP COLUMN IF EXISTS "monday_update_status";

  DROP TYPE IF EXISTS "public"."enum_trainer_logboek_items_monday_update_status";`);
}
