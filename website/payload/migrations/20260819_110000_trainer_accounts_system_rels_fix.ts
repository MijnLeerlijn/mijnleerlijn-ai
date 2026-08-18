import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Incident 2026-08-19 (vervolg op 20260819_100000_trainer_accounts_v1.ts):
// productie crashte na die deploy met "column trainer_accounts_id does not
// exist" in een query op "payload_preferences_rels".
//
// ROOT CAUSE — bevestigd door de daadwerkelijke Payload-broncode te lezen
// (node_modules/payload/dist/preferences/config.js en .../locked-documents/
// config.js): Payload registreert intern TWEE "systeem"-collecties met een
// POLYMORFE relatie naar "elke auth: true-collectie" — niet naar specifiek
// "users", maar naar `config.collections.filter(c => c.auth).map(c =>
// c.slug)`, dynamisch bepaald uit de actuele config:
//   1. "payload-preferences" (tabel payload_preferences +
//      payload_preferences_rels) — veld "user", relationTo = alle
//      auth-collecties. Bewaart per-gebruiker UI-voorkeuren (bv.
//      dashboardindeling); preferenceAccess() in datzelfde bestand
//      filtert altijd op user.value + user.relationTo, dus ELKE
//      preferences-aanroep (ook een gewone "users"-beheerder die het
//      dashboard opent) raakt deze tabel.
//   2. "payload-locked-documents" (tabel payload_locked_documents +
//      payload_locked_documents_rels) — velden "document" (relationTo =
//      alle NIET expliciet lockDocuments:false-collecties) ÉN "user"
//      (relationTo = alle auth-collecties).
// Zodra TrainerAccounts.ts (payload/collections/TrainerAccounts.ts)
// `auth: {...}` kreeg, verwachtte Payload's eigen, uit de huidige config
// afgeleide Drizzle-schema dus automatisch een "trainer_accounts_id"-kolom
// op BEIDE _rels-tabellen — niet alleen op payload_locked_documents_rels
// (die kolom voegde 20260819_100000_trainer_accounts_v1.ts al toe, om
// dezelfde reden als hierboven onder 2). payload_preferences_rels werd
// destijds over het hoofd gezien: geen enkele bestaande migratie in dit
// project raakte die tabel ooit aan (de allereerste migratie,
// 20260721_135820_initial.ts, maakte hem aan met uitsluitend "users_id",
// destijds de enige auth-collectie) — dit is dus geen datacorruptie of
// mislukte eerdere poging, puur een kolom die nooit is toegevoegd.
// Doorzocht: dit zijn de ENIGE TWEE Payload-systeemtabellen met een
// polymorfe relatie naar auth-collecties in de geïnstalleerde
// Payload-versie (grep op `.filter(...auth)` in de hele payload-package
// levert precies deze twee bestanden op). "payload-query-presets"
// (enableQueryPresets) en de folders-functionaliteit (config.folders)
// worden in dit project nergens gebruikt en bestaan hier niet.
//
// Additief, niet de geschiedenis herschrijvend: 20260819_100000_
// trainer_accounts_v1.ts blijft ongewijzigd (die draaide al succesvol in
// productie — dit bestand vult uitsluitend het ontbrekende stuk aan.
// payload_locked_documents_rels.trainer_accounts_id wordt hieronder
// defensief herverifieerd (IF NOT EXISTS) i.p.v. aangenomen: als die kolom
// om welke reden dan ook alsnog zou ontbreken, herstelt deze migratie ook
// dat, zonder ooit iets te verwijderen.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_preferences_rels" ADD COLUMN IF NOT EXISTS "trainer_accounts_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trainer_accounts_id" integer;

    DO $$ BEGIN
     ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_trainer_accounts_fk" FOREIGN KEY ("trainer_accounts_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
     ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainer_accounts_fk" FOREIGN KEY ("trainer_accounts_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "payload_preferences_rels_trainer_accounts_id_idx" ON "payload_preferences_rels" USING btree ("trainer_accounts_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainer_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("trainer_accounts_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Draait uitsluitend terug wat déze migratie daadwerkelijk als eigen,
  // nieuwe toevoeging beheert: payload_preferences_rels.trainer_accounts_id.
  // payload_locked_documents_rels.trainer_accounts_id wordt in up()
  // hierboven alleen defensief HERverifieerd (IF NOT EXISTS, meestal een
  // no-op) — die kolom hoort bij 20260819_100000_trainer_accounts_v1.ts se
  // eigen down(), niet bij deze migratie; hem hier ook droppen zou twee
  // migraties dezelfde kolom laten "bezitten". "users_id" en elke andere
  // bestaande auth-collectiekolom op beide tabellen (incl. hun data)
  // blijven hoe dan ook volledig onaangeroerd.
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_preferences_rels_trainer_accounts_id_idx";
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT IF EXISTS "payload_preferences_rels_trainer_accounts_fk";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN IF EXISTS "trainer_accounts_id";`);
}
