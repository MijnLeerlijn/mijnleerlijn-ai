import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V1, Ronde 3.5 vervolg (2026-08-25) — providermigratie
// Twilio -> Telnyx: voegt 'telnyx' toe aan de bestaande provider-enum.
// 'twilio' blijft in de enum staan (Postgres kent geen ALTER TYPE ... DROP
// VALUE, en de telefoniepilot is nooit gestart geweest — TRAINER_TELEFONIE_ENABLED
// stond nooit aan — dus er zijn geen echte rijen om te migreren).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_trainer_telefonie_oproepen_provider" ADD VALUE IF NOT EXISTS 'telnyx';`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- Enum-waarde zelf NIET verwijderd (Postgres kent geen ALTER TYPE ... DROP VALUE)`);
}
