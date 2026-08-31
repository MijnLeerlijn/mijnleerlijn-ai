import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Startbegeleiding-ronde (2026-09-02) — "startactie" wordt een nieuwe waarde
// op de al bestaande Postgres-ENUM enum_training_verslagen_training_bron
// (zie 20260901_140000_training_verslagen_aanvullend.ts). Zelfde bewezen ADD
// VALUE-patroon als 20260824_100000_trainer_log_events_logboek_veld.ts: een
// eigen, kleine migratie met UITSLUITEND deze ene wijziging — een nieuwe
// enum-waarde mag pas ná commit van déze transactie elders gebruikt worden.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_training_verslagen_training_bron" ADD VALUE IF NOT EXISTS 'startactie';`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Postgres ondersteunt geen DROP VALUE op een ENUM — 'startactie' blijft
  // bestaan als toegestane waarde, zelfde aanvaarde beperking als de eerdere
  // logboek-veld/superseded/categorie-kleuren-migraties.
}
