import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Sales-logica productiecorrectie 2026-08-16 (punt 1/2/4/11) — twee
// fundamentele producties: (a) board-reconciliation — een school die niet
// meer op '1: Scholen (Master Data)' voorkomt (bv. Tjongerwerven, verplaatst
// naar het Besturen-board) moet uit actieve Sales verdwijnen zonder de
// lokale audit-historie te verliezen; (b) een gecachte, geëxtraheerde
// "wat staat er gepland"-omschrijving zodat een school met alleen een
// Monday-vervolgdatum (bv. Springplank) een leesbare kaart kan tonen zonder
// een volledige AI-relatie-analyse nodig te hebben. Zelfde ADD COLUMN IF NOT
// EXISTS/array-kindtabel-patroon als de eerdere sales_*-migraties (zie
// 20260814_090000_sales_v1_datamodel.ts se sales_proposals_source_update_ids
// voor het kindtabel-precedent).
//
// nog_op_monday_board/verwijderd_van_board_op leven op sales_schools (geen
// nieuwe enum nodig — checkbox/timestamp). cached_geplande_actie_confidence
// krijgt een EIGEN enum-type (hoog/middel/laag), zelfde gevestigde conventie
// als sales_actions_channel vs sales_proposals_proposed_channel: identieke
// waarden, toch een apart type per veld, nooit hergebruikt over tabellen
// heen.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
   CREATE TYPE "public"."enum_sales_schools_cached_geplande_actie_confidence" AS ENUM('hoog', 'middel', 'laag');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  ALTER TABLE "sales_schools" ADD COLUMN IF NOT EXISTS "nog_op_monday_board" boolean DEFAULT true;
  ALTER TABLE "sales_schools" ADD COLUMN IF NOT EXISTS "verwijderd_van_board_op" timestamp(3) with time zone;
  ALTER TABLE "sales_schools" ADD COLUMN IF NOT EXISTS "cached_geplande_actie_tekst" varchar;
  ALTER TABLE "sales_schools" ADD COLUMN IF NOT EXISTS "cached_geplande_actie_datum" timestamp(3) with time zone;
  ALTER TABLE "sales_schools" ADD COLUMN IF NOT EXISTS "cached_geplande_actie_confidence" "enum_sales_schools_cached_geplande_actie_confidence";
  ALTER TABLE "sales_schools" ADD COLUMN IF NOT EXISTS "cached_geplande_actie_gegenereerd_op" timestamp(3) with time zone;

  CREATE TABLE IF NOT EXISTS "sales_schools_cached_geplande_actie_bron_update_ids" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"update_id" varchar NOT NULL
  );

  DO $$ BEGIN
   ALTER TABLE "sales_schools_cached_geplande_actie_bron_update_ids" ADD CONSTRAINT "sales_schools_cached_geplande_actie_bron_update_ids_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sales_schools"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "sales_schools_cached_geplande_actie_bron_update_ids_order_idx" ON "sales_schools_cached_geplande_actie_bron_update_ids" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "sales_schools_cached_geplande_actie_bron_update_ids_parent_id_idx" ON "sales_schools_cached_geplande_actie_bron_update_ids" USING btree ("_parent_id");

  ALTER TABLE "sales_instellingen" ADD COLUMN IF NOT EXISTS "laatste_sync_bestaande_planningen_herkend" numeric;
  ALTER TABLE "sales_instellingen" ADD COLUMN IF NOT EXISTS "laatste_sync_scholen_van_board_gehaald" numeric;
  ALTER TABLE "sales_instellingen" ADD COLUMN IF NOT EXISTS "laatste_sync_verouderde_voorstellen_gesloten" numeric;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "sales_instellingen" DROP COLUMN IF EXISTS "laatste_sync_verouderde_voorstellen_gesloten";
  ALTER TABLE "sales_instellingen" DROP COLUMN IF EXISTS "laatste_sync_scholen_van_board_gehaald";
  ALTER TABLE "sales_instellingen" DROP COLUMN IF EXISTS "laatste_sync_bestaande_planningen_herkend";

  DROP INDEX IF EXISTS "sales_schools_cached_geplande_actie_bron_update_ids_parent_id_idx";
  DROP INDEX IF EXISTS "sales_schools_cached_geplande_actie_bron_update_ids_order_idx";
  ALTER TABLE "sales_schools_cached_geplande_actie_bron_update_ids" DROP CONSTRAINT IF EXISTS "sales_schools_cached_geplande_actie_bron_update_ids_parent_id_fk";
  DROP TABLE IF EXISTS "sales_schools_cached_geplande_actie_bron_update_ids" CASCADE;

  ALTER TABLE "sales_schools" DROP COLUMN IF EXISTS "cached_geplande_actie_gegenereerd_op";
  ALTER TABLE "sales_schools" DROP COLUMN IF EXISTS "cached_geplande_actie_confidence";
  ALTER TABLE "sales_schools" DROP COLUMN IF EXISTS "cached_geplande_actie_datum";
  ALTER TABLE "sales_schools" DROP COLUMN IF EXISTS "cached_geplande_actie_tekst";
  ALTER TABLE "sales_schools" DROP COLUMN IF EXISTS "verwijderd_van_board_op";
  ALTER TABLE "sales_schools" DROP COLUMN IF EXISTS "nog_op_monday_board";

  DROP TYPE IF EXISTS "public"."enum_sales_schools_cached_geplande_actie_confidence";`);
}
