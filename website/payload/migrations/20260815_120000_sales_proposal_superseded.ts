import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Sales-assistent — "Opnieuw analyseren" / "Bespreek met AI → Maak hiervan
// nieuw voorstel" (2026-08-15): een oud voorstel wordt NOOIT stil
// overschreven — het krijgt status 'superseded' en het nieuwe voorstel
// wijst er via 'supersedes' naar terug (audit-eis). 'superseded' is een
// nieuwe waarde op de al bestaande Postgres-ENUM
// enum_sales_proposals_status — zelfde bewezen ADD VALUE-patroon als
// 20260729_150000_categorie_kleuren_uitbreiden.ts, geen DO $$-wrapper nodig.
// 'overleg_geschiedenis' (jsonb) bewaart de chatgeschiedenis die tot een
// via-AI-overleg-voorstel leidde — zelfde json-veldconventie als het al
// bestaande final_choice/relatie_analyse op deze tabel.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_sales_proposals_status" ADD VALUE 'superseded';`);

  await db.execute(sql`
  ALTER TABLE "sales_proposals" ADD COLUMN IF NOT EXISTS "supersedes_id" integer;
  ALTER TABLE "sales_proposals" ADD COLUMN IF NOT EXISTS "overleg_geschiedenis" jsonb;

  DO $$ BEGIN
   ALTER TABLE "sales_proposals" ADD CONSTRAINT "sales_proposals_supersedes_id_sales_proposals_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."sales_proposals"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "sales_proposals_supersedes_idx" ON "sales_proposals" USING btree ("supersedes_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "sales_proposals_supersedes_idx";
  ALTER TABLE "sales_proposals" DROP CONSTRAINT IF EXISTS "sales_proposals_supersedes_id_sales_proposals_id_fk";
  ALTER TABLE "sales_proposals" DROP COLUMN IF EXISTS "overleg_geschiedenis";
  ALTER TABLE "sales_proposals" DROP COLUMN IF EXISTS "supersedes_id";`);
  // Postgres ondersteunt geen DROP VALUE op een ENUM — 'superseded' blijft
  // bestaan als toegestane waarde, zelfde aanvaarde beperking als de
  // eerdere categorie-kleuren-migratie.
}
