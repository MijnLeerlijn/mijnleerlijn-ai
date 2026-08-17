import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Mijn Dag-productiecorrectie (2026-08-18, punt 3) — statusbadge-categorie op
// een mailsignaal, zie payload/collections/MailSignalen.ts. Hand-geschreven
// i.p.v. via `payload migrate:create`: dat commando vroeg interactief om een
// keuze over een volledig ongerelateerde, reeds langer bestaande
// schema-drift in deze sandbox-database (mail_drafts/helpdesk_voorbeeldvragen,
// niets van dit werk) — een verkeerd antwoord had die tabellen kunnen
// hernoemen/vernietigen. Deze migratie blijft daarom strikt beperkt tot
// exact de ene kolom die dit werk nodig heeft, net als de bestaande
// hand-geschreven migraties in deze map. Nullable, geen default: bestaande
// rijen (status "gesignaleerd" van vóór dit veld bestond) blijven geldig —
// lib/werk/mail-signalen.ts valt in de weergave terug op "antwoord_nodig".
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN
   CREATE TYPE "public"."enum_mail_signalen_categorie" AS ENUM('antwoord_nodig', 'afspraak', 'toezegging', 'ter_beoordeling');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  ALTER TABLE "mail_signalen" ADD COLUMN IF NOT EXISTS "categorie" "enum_mail_signalen_categorie";`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "mail_signalen" DROP COLUMN IF EXISTS "categorie";

  DROP TYPE IF EXISTS "public"."enum_mail_signalen_categorie";`);
}
