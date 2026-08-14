import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Sales UX V2 (2026-08-14) — twee kleine, puur additieve uitbreidingen op het
// bestaande Sales V1-datamodel, geen enkele bestaande kolom/tabel gewijzigd:
//
// 1. sales_schools.cached_summary(_generated_at) — de "Waar staan we?"-
//    samenvatting wordt voortaan gecached i.p.v. bij elke paginaweergave
//    opnieuw gegenereerd (zie lib/sales/context.ts se
//    genereerSchoolSamenvatting + lib/sales/sync.ts). textarea-velden
//    worden in dit project als "varchar" (onbeperkt, geen vaste lengte)
//    gemigreerd — bevestigd tegen mail_drafts.received_text/draft_reply in
//    20260813_090000_creator_v1_datamodel.ts, niet aangenomen.
//
// 2. sales_log_events.related_mail_draft_id — minimale Mail↔School-koppeling
//    (opdrachtseis: "geen duplicatie van mailtekst/persoonsgegevens in het
//    Sales-logboek"). Zelfde conventie als de al bestaande
//    related_action_id/related_proposal_id op deze tabel: nullable FK, ON
//    DELETE set null, eigen btree-index.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "sales_schools" ADD COLUMN IF NOT EXISTS "cached_summary" varchar;
  ALTER TABLE "sales_schools" ADD COLUMN IF NOT EXISTS "cached_summary_generated_at" timestamp(3) with time zone;

  ALTER TABLE "sales_log_events" ADD COLUMN IF NOT EXISTS "related_mail_draft_id" integer;

  DO $$ BEGIN
   ALTER TABLE "sales_log_events" ADD CONSTRAINT "sales_log_events_related_mail_draft_id_mail_drafts_id_fk" FOREIGN KEY ("related_mail_draft_id") REFERENCES "public"."mail_drafts"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "sales_log_events_related_mail_draft_idx" ON "sales_log_events" USING btree ("related_mail_draft_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "sales_log_events_related_mail_draft_idx";
  ALTER TABLE "sales_log_events" DROP CONSTRAINT IF EXISTS "sales_log_events_related_mail_draft_id_mail_drafts_id_fk";
  ALTER TABLE "sales_log_events" DROP COLUMN IF EXISTS "related_mail_draft_id";

  ALTER TABLE "sales_schools" DROP COLUMN IF EXISTS "cached_summary_generated_at";
  ALTER TABLE "sales_schools" DROP COLUMN IF EXISTS "cached_summary";`);
}
