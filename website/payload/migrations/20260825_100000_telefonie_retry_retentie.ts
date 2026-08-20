import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V1, Ronde 3.5 vervolg (2026-08-25) — production-
// readiness-gate 1: begrensde automatische transcriptie-retry + een harde
// maximale audiobewaartermijn (zie gesprek.ts se MAX_TRANSCRIPTIE_POGINGEN/
// MAX_BEWAARTERMIJN_MS voor de volledige toelichting). Twee nieuwe
// enum-waarden (ADD VALUE IF NOT EXISTS — sinds Postgres 12 toegestaan,
// hier NIET binnen dezelfde transactie gebruikt, dus geen probleem met
// Postgres se beperking "nieuwe enum-waarde niet bruikbaar in de transactie
// waarin hij is toegevoegd") + vier nieuwe kolommen op
// trainer_telefonie_oproepen.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_trainer_telefonie_oproepen_status" ADD VALUE IF NOT EXISTS 'transcriptie_mislukt_herstelbaar';
  ALTER TYPE "public"."enum_trainer_telefonie_oproepen_foutcode" ADD VALUE IF NOT EXISTS 'bewaartermijn_verstreken';

  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "opname_ophaal_referentie" varchar;
  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "transcriptie_pogingen" numeric DEFAULT 0 NOT NULL;
  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "volgende_transcriptiepoging" timestamp(3) with time zone;
  ALTER TABLE "trainer_telefonie_oproepen" ADD COLUMN IF NOT EXISTS "opname_verwijderd_op" timestamp(3) with time zone;

  CREATE INDEX IF NOT EXISTS "trainer_telefonie_oproepen_volgende_transcriptiepoging_idx" ON "trainer_telefonie_oproepen" USING btree ("volgende_transcriptiepoging");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "trainer_telefonie_oproepen_volgende_transcriptiepoging_idx";

  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "opname_verwijderd_op";
  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "volgende_transcriptiepoging";
  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "transcriptie_pogingen";
  ALTER TABLE "trainer_telefonie_oproepen" DROP COLUMN IF EXISTS "opname_ophaal_referentie";

  -- Enum-waarden zelf NIET verwijderd (Postgres kent geen ALTER TYPE ...
  -- DROP VALUE) — zelfde, structurele beperking als elders in dit project.
  -- Ongebruikte waarden op een enum zijn onschadelijk.`);
}
