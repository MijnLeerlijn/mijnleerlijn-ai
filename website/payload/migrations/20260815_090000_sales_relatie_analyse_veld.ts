import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Relatie-analyse V1 (2026-08-15) — één puur additieve kolom, geen enkele
// bestaande tabel/kolom gewijzigd: sales_proposals.relatie_analyse bewaart
// de audit-snapshot van de gestructureerde relatie-analyse (lib/sales/
// relationship-analysis.ts) waarop een "volgende_actie"-voorstel is
// gebaseerd — zelfde jsonb-conventie als het al bestaande final_choice op
// deze tabel (zie 20260814_090000_sales_v1_datamodel.ts).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "sales_proposals" ADD COLUMN IF NOT EXISTS "relatie_analyse" jsonb;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "sales_proposals" DROP COLUMN IF EXISTS "relatie_analyse";`);
}
