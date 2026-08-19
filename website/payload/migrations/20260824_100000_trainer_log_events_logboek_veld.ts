import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V1, Ronde 3 (2026-08-24) — writeback.ts kan nu ook een
// "logboek"-kolomschrijving loggen (de afrondingsvlag na een bevestigd
// trainingsverslag, zie lib/trainers/verslag.ts). 'logboek' is een nieuwe
// waarde op de al bestaande Postgres-ENUM enum_trainer_log_events_veld —
// zelfde bewezen ADD VALUE-patroon als 20260815_120000_sales_proposal_
// superseded.ts/20260729_150000_categorie_kleuren_uitbreiden.ts, geen DO
// $$-wrapper nodig, geen ander schema-wijziging in dezelfde migratie (een
// nieuwe enum-waarde mag pas ná commit van déze transactie elders gebruikt
// worden).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_trainer_log_events_veld" ADD VALUE IF NOT EXISTS 'logboek';`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Postgres ondersteunt geen DROP VALUE op een ENUM — 'logboek' blijft
  // bestaan als toegestane waarde, zelfde aanvaarde beperking als de
  // eerdere superseded/categorie-kleuren-migraties.
}
