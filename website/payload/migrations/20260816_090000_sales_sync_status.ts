import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Sales-logica productiecorrectie 2026-08-16 (punt 1) — "Laatste sync"-
// bijschrift bij de sync-knop op zowel het dashboard als Sales Overzicht.
// Bewaard op het al bestaande sales_instellingen-global (accountbreed, geen
// nieuwe tabel nodig) — geschreven door lib/sales/sync.ts se
// synchroniseerScholenBoard() ná elke sync-run (cron én handmatig, beide
// lopen door exact diezelfde functie), gelezen via GET /api/sales/sync/status.
// Zelfde ADD COLUMN IF NOT EXISTS-patroon als 20260815_120000_sales_proposal_superseded.ts.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "sales_instellingen" ADD COLUMN IF NOT EXISTS "laatste_sync_op" timestamp(3) with time zone;
  ALTER TABLE "sales_instellingen" ADD COLUMN IF NOT EXISTS "laatste_sync_scholen_verwerkt" numeric;
  ALTER TABLE "sales_instellingen" ADD COLUMN IF NOT EXISTS "laatste_sync_wijzigingen" numeric;
  ALTER TABLE "sales_instellingen" ADD COLUMN IF NOT EXISTS "laatste_sync_fouten" numeric;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "sales_instellingen" DROP COLUMN IF EXISTS "laatste_sync_fouten";
  ALTER TABLE "sales_instellingen" DROP COLUMN IF EXISTS "laatste_sync_wijzigingen";
  ALTER TABLE "sales_instellingen" DROP COLUMN IF EXISTS "laatste_sync_scholen_verwerkt";
  ALTER TABLE "sales_instellingen" DROP COLUMN IF EXISTS "laatste_sync_op";`);
}
