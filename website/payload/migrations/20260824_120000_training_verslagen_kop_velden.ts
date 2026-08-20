import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V1, Ronde 3 vervolg (2026-08-20, ná Wessels live-test) —
// nieuwe kolom bevestigd_door_trainer_naam: een snapshot van de ingelogde
// trainer se naam (trainer-accounts) op het moment van de eerste
// bevestiging, atomisch samen met definitieve_tekst/bevestigd_op gezet door
// bevestigVerslag() se stap 3 (lib/trainers/verslag.ts). Nooit later live
// herberekend uit de trainer-relatie — de Monday Update-tekst zelf is na
// verzending ook onveranderlijk, dus de portalweergave moet dezelfde,
// bevroren naam tonen, ook als de trainer zijn accountnaam nadien wijzigt.
// Nullable/geen default: bestaande rijen (van vóór deze migratie) hebben
// simpelweg geen snapshot — bouwVerslagWeergaveTekst() (verslag.ts) geeft
// dan bewust null terug i.p.v. een onjuiste/verzonnen naam te tonen.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "training_verslagen" ADD COLUMN IF NOT EXISTS "bevestigd_door_trainer_naam" varchar;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "training_verslagen" DROP COLUMN IF EXISTS "bevestigd_door_trainer_naam";`);
}
