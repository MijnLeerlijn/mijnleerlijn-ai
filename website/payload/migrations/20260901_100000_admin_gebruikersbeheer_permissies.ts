import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Admin gebruikersbeheer — rechten per hoofdmenu en submenu (2026-08-25) —
// twee nieuwe kolommen op de bestaande "users"-tabel, zie
// payload/collections/Users.ts. Hand-geschreven i.p.v. via
// `payload migrate:create`, zelfde reden als elke andere handgeschreven
// migratie in deze map (20260818_090000_mail_signalen_categorie.ts e.a.):
// het commando vraagt interactief om een keuze over een ongerelateerde,
// reeds langer bestaande schema-drift in deze sandbox-database — een
// verkeerd antwoord daarop kan bestaande tabellen hernoemen/vernietigen.
//
// `permission_mode` krijgt bewust een DEFAULT ÉN NOT NULL: dit is de
// opdrachtseis "bestaande accounts na migratie niet onverwacht rechten
// verliezen" letterlijk op databaseniveau afgedwongen — ELK bestaand
// account (admin én editor) krijgt bij het toevoegen van deze kolom
// automatisch 'full', wat payload/access/menu-permissions.ts se
// heeftAdminPermissie() als "onbeperkt binnen de rol" behandelt: exact het
// gedrag van vóór deze migratie, voor elk bestaand account, totdat een
// beheerder het expliciet op 'restricted' zet. `permissions` blijft
// bewust leeg/ongebruikt zolang permission_mode 'full' is.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN
   CREATE TYPE "public"."enum_users_permission_mode" AS ENUM('full', 'restricted');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "permission_mode" "enum_users_permission_mode" DEFAULT 'full' NOT NULL;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "permissions" jsonb DEFAULT '[]'::jsonb;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN IF EXISTS "permissions";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "permission_mode";

  DROP TYPE IF EXISTS "public"."enum_users_permission_mode";`);
}
