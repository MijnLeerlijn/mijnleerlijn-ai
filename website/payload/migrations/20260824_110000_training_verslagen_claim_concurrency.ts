import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V1, Ronde 3 — concurrencyfix bovenop 20260824_090000
// (2026-08-19): "Definitief opslaan" kon bij twee écht gelijktijdige
// requests (dubbelklik, twee tabs, retry na timeout, serverless-concurrency)
// theoretisch tot een dubbele Monday Update leiden — payload.update() is
// SELECT-dan-UPDATE, niet atomisch. Nieuwe waarde 'bezig' + twee
// claimed_at-tijdstempels maken een atomische claim mogelijk
// (UPDATE ... WHERE status IN (...) OR (status='bezig' AND
// claimed_at < now() - interval) RETURNING ...), uitgevoerd via
// payload.db.drizzle.execute(sql`...`) — zelfde bewezen escape-hatch naar
// rauwe, geparametriseerde SQL als payload/migrate-preflight.ts. Zie
// lib/trainers/verslag.ts voor de leeskant van deze garantie.
//
// 'bezig' als ADD VALUE i.p.v. losse migratie: deze migratie voegt 'm alleen
// toe, gebruikt 'm zelf nergens (geen UPDATE/DEFAULT/CAST ernaar in dezelfde
// transactie) — dat is precies waarom Postgres een nieuwe enum-waarde pas ná
// commit elders toestaat. Combinatie met de ADD COLUMN-statements hieronder
// in dezelfde transactie is dus veilig, zelfde bewezen combinatie als
// 20260815_120000_sales_proposal_superseded.ts (ADD VALUE + ADD COLUMN in
// één up()).
//
// *_claimed_at is bewust GEEN NOT NULL/geen default: null betekent "geen
// actieve claim", exact wat een net aangemaakt conceptverslag al is zonder
// dat er iets hoeft te migreren voor bestaande rijen.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_training_verslagen_training_update_status" ADD VALUE IF NOT EXISTS 'bezig';
  ALTER TYPE "public"."enum_training_verslagen_school_update_status" ADD VALUE IF NOT EXISTS 'bezig';

  ALTER TABLE "training_verslagen" ADD COLUMN IF NOT EXISTS "training_update_claimed_at" timestamp(3) with time zone;
  ALTER TABLE "training_verslagen" ADD COLUMN IF NOT EXISTS "school_update_claimed_at" timestamp(3) with time zone;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "training_verslagen" DROP COLUMN IF EXISTS "school_update_claimed_at";
  ALTER TABLE "training_verslagen" DROP COLUMN IF EXISTS "training_update_claimed_at";`);
  // Postgres ondersteunt geen DROP VALUE op een ENUM — 'bezig' blijft bestaan
  // als toegestane waarde, zelfde aanvaarde beperking als de eerdere
  // superseded/categorie-kleuren/logboek-veld-migraties.
}
