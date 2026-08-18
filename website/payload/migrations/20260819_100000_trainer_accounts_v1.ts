import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V1, Ronde 1 (2026-08-19) — nieuwe auth-collectie
// "trainer-accounts" (payload/collections/TrainerAccounts.ts). Hand-
// geschreven, zelfde aanpak/conventies als 20260817_130000_google_
// connections.ts/20260817_170000_mail_signalen.ts: `payload migrate:create`
// bleef hangen op een interactieve disambiguatievraag zonder niet-
// interactieve manier om "nieuwe tabel" te bevestigen; dit bestand is
// daarom met de hand geschreven, exact volgens het schema dat Payload voor
// een `auth: {...}`-collectie zonder extra velden buiten name/monday-ID's/
// actief zou genereren (zie users/users_sessions in
// 20260721_135820_initial.ts als referentieschema — identieke auth-kolommen).
//
// SLUG-INCIDENT (2026-08-19), vervangt 20260819_090000_trainers_v1.ts: die
// eerdere versie gebruikte slug/tabelnaam "trainers", wat de productiedeploy
// deed falen ("column monday_trainerboard_id does not exist") — er bleek in
// productie al een tabel `trainers` te bestaan met kolommen als
// trainer_board_id/executor_item_id/master_id_column_id/status_column_id/
// validation_status: aantoonbaar GEEN Payload-authtabel, maar een bestaand,
// ongerelateerd technisch trainer-/boardmapping-mechanisme, niet eerder
// bekend bij dit project. Die migratie draaide nooit succesvol tegen
// productie (transactioneel onmogelijk om daar partiële sporen te hebben
// achtergelaten — Postgres-DDL binnen Payload's transactiewrapper is
// atomair) en is daarom volledig vervangen door dit bestand i.p.v. ernaast
// te blijven bestaan: de oude tabelnaam "trainers" wordt door GEEN ENKELE
// migratie in dit project meer aangeraakt, in welke vorm dan ook.
//
// Nieuwe, botsingsvrije naam: "trainer-accounts" (tabel trainer_accounts,
// sessietabel trainer_accounts_sessions) — geverifieerd dat dit nergens
// anders in payload.config.ts als collectie-/tabelnaam voorkomt.
//
// Bewust NOG STEEDS introspectief/defensief opgezet (zie up() hieronder),
// ook al is deze specifieke naam vooraf gecontroleerd op botsing: de les uit
// bovenstaand incident is dat deze Postgres-database tabellen kan bevatten
// die buiten dit project se migraties om zijn ontstaan — diezelfde
// voorzichtigheid geldt dus principieel voor elke nieuwe tabel die dit
// project aanmaakt, niet uitsluitend met terugwerkende kracht voor
// "trainers". Zie ook down(): laat de trainer_accounts-tabel zelf om
// dezelfde reden nooit onvoorwaardelijk vallen.
const AUTH_VINGERAFDRUK_KOLOMMEN = ["email", "hash", "salt", "reset_password_token", "login_attempts"];

const KOLOMMEN_MET_VEILIGE_STANDAARDWAARDE: Array<{ naam: string; ddl: string }> = [
  { naam: "actief", ddl: "boolean DEFAULT true" },
  { naam: "updated_at", ddl: "timestamp(3) with time zone DEFAULT now() NOT NULL" },
  { naam: "created_at", ddl: "timestamp(3) with time zone DEFAULT now() NOT NULL" },
  { naam: "reset_password_token", ddl: "varchar" },
  { naam: "reset_password_expiration", ddl: "timestamp(3) with time zone" },
  { naam: "salt", ddl: "varchar" },
  { naam: "hash", ddl: "varchar" },
  { naam: "login_attempts", ddl: "numeric DEFAULT 0" },
  { naam: "lock_until", ddl: "timestamp(3) with time zone" },
];

const VERPLICHTE_KOLOMMEN_ZONDER_STANDAARDWAARDE: Array<{ naam: string; ddl: string }> = [
  { naam: "name", ddl: "varchar" },
  { naam: "monday_trainerboard_id", ddl: "varchar" },
  { naam: "monday_uitvoerder_item_id", ddl: "varchar" },
  { naam: "email", ddl: "varchar" },
];

async function trainerAccountsTabelBestaat(db: MigrateUpArgs["db"]): Promise<boolean> {
  const resultaat = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'trainer_accounts'
    ) AS "exists";
  `);
  return Boolean((resultaat.rows[0] as { exists: boolean } | undefined)?.exists);
}

async function haalTrainerAccountsKolommen(db: MigrateUpArgs["db"]): Promise<Set<string>> {
  const resultaat = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trainer_accounts';
  `);
  return new Set((resultaat.rows as Array<{ column_name: string }>).map((rij) => rij.column_name));
}

async function telTrainerAccountsRijen(db: MigrateUpArgs["db"]): Promise<number> {
  const resultaat = await db.execute(sql`SELECT COUNT(*)::int AS "count" FROM "trainer_accounts";`);
  return Number((resultaat.rows[0] as { count: number } | undefined)?.count ?? 0);
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const bestondAlVooraf = await trainerAccountsTabelBestaat(db);

  if (bestondAlVooraf) {
    const bestaandeKolommen = await haalTrainerAccountsKolommen(db);
    const ontbrekendeVingerafdruk = AUTH_VINGERAFDRUK_KOLOMMEN.filter((naam) => !bestaandeKolommen.has(naam));

    if (ontbrekendeVingerafdruk.length > 0) {
      throw new Error(
        `[trainer_accounts_v1] Een tabel genaamd "trainer_accounts" bestaat al in deze database, maar mist ` +
          `kolommen die Payload altijd automatisch aanmaakt voor een auth-collectie (ontbrekend: ` +
          `${ontbrekendeVingerafdruk.join(", ")}). Gevonden kolommen: ${[...bestaandeKolommen].sort().join(", ") || "(geen)"}. ` +
          `Dit duidt erop dat deze tabel NIET door de TrainerAccounts-collectie van deze applicatie is aangemaakt ` +
          `en mogelijk een andere, onbekende functie heeft. Deze migratie stopt bewust zonder wijzigingen aan de ` +
          `"trainer_accounts"-tabel aan te brengen — onderzoek eerst handmatig wat deze tabel is en waar hij ` +
          `vandaan komt voordat je verder gaat.`
      );
    }
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "trainer_accounts_sessions" (
    	"_order" integer NOT NULL,
    	"_parent_id" integer NOT NULL,
    	"id" varchar PRIMARY KEY NOT NULL,
    	"created_at" timestamp(3) with time zone,
    	"expires_at" timestamp(3) with time zone NOT NULL
    );`);

  if (!bestondAlVooraf) {
    await db.execute(sql`CREATE TABLE "trainer_accounts" ("id" serial PRIMARY KEY NOT NULL);`);
  }

  const huidigeKolommen = bestondAlVooraf ? await haalTrainerAccountsKolommen(db) : new Set(["id"]);

  for (const { naam, ddl } of KOLOMMEN_MET_VEILIGE_STANDAARDWAARDE) {
    if (!huidigeKolommen.has(naam)) {
      await db.execute(sql.raw(`ALTER TABLE "trainer_accounts" ADD COLUMN IF NOT EXISTS "${naam}" ${ddl};`));
    }
  }

  const ontbrekendeVerplichteKolommen = VERPLICHTE_KOLOMMEN_ZONDER_STANDAARDWAARDE.filter(
    ({ naam }) => !huidigeKolommen.has(naam)
  );

  if (ontbrekendeVerplichteKolommen.length > 0) {
    // Rijen tellen vóórdat NOT NULL wordt overwogen — een bestaande rij mag
    // nooit alsnog een migratiefout veroorzaken door een NOT NULL-kolom
    // zonder waarde te krijgen.
    const aantalRijen = await telTrainerAccountsRijen(db);

    for (const { naam, ddl } of ontbrekendeVerplichteKolommen) {
      await db.execute(sql.raw(`ALTER TABLE "trainer_accounts" ADD COLUMN IF NOT EXISTS "${naam}" ${ddl};`));

      if (aantalRijen === 0) {
        await db.execute(sql.raw(`ALTER TABLE "trainer_accounts" ALTER COLUMN "${naam}" SET NOT NULL;`));
      } else {
        payload.logger.warn({
          msg:
            `[trainer_accounts_v1] Kolom "${naam}" toegevoegd aan een bestaande "trainer_accounts"-tabel met ` +
            `${aantalRijen} bestaande rij(en), maar NIET als NOT NULL gezet omdat die rijen deze waarde missen. ` +
            `Vul de kolom handmatig aan voor alle bestaande rijen en voer daarna zelf uit: ` +
            `ALTER TABLE "trainer_accounts" ALTER COLUMN "${naam}" SET NOT NULL;`,
        });
      }
    }
  }

  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trainer_accounts_id" integer;

    DO $$ BEGIN
     ALTER TABLE "trainer_accounts_sessions" ADD CONSTRAINT "trainer_accounts_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
     ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainer_accounts_fk" FOREIGN KEY ("trainer_accounts_id") REFERENCES "public"."trainer_accounts"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "trainer_accounts_sessions_order_idx" ON "trainer_accounts_sessions" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "trainer_accounts_sessions_parent_id_idx" ON "trainer_accounts_sessions" USING btree ("_parent_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "trainer_accounts_monday_trainerboard_id_idx" ON "trainer_accounts" USING btree ("monday_trainerboard_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "trainer_accounts_monday_uitvoerder_item_id_idx" ON "trainer_accounts" USING btree ("monday_uitvoerder_item_id");
    CREATE INDEX IF NOT EXISTS "trainer_accounts_updated_at_idx" ON "trainer_accounts" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "trainer_accounts_created_at_idx" ON "trainer_accounts" USING btree ("created_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "trainer_accounts_email_idx" ON "trainer_accounts" USING btree ("email");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainer_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("trainer_accounts_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_trainer_accounts_id_idx";
  DROP INDEX IF EXISTS "trainer_accounts_email_idx";
  DROP INDEX IF EXISTS "trainer_accounts_created_at_idx";
  DROP INDEX IF EXISTS "trainer_accounts_updated_at_idx";
  DROP INDEX IF EXISTS "trainer_accounts_monday_uitvoerder_item_id_idx";
  DROP INDEX IF EXISTS "trainer_accounts_monday_trainerboard_id_idx";
  DROP INDEX IF EXISTS "trainer_accounts_sessions_parent_id_idx";
  DROP INDEX IF EXISTS "trainer_accounts_sessions_order_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trainer_accounts_fk";
  ALTER TABLE "trainer_accounts_sessions" DROP CONSTRAINT IF EXISTS "trainer_accounts_sessions_parent_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainer_accounts_id";

  DROP TABLE IF EXISTS "trainer_accounts_sessions" CASCADE;`);

  // "trainer_accounts" zelf wordt hier bewust NOOIT gedropt: up() kan tegen
  // een reeds bestaande tabel gedraaid hebben die deze migratie niet zelf
  // heeft aangemaakt (zie up()-commentaar). Alleen de twee kolommen die
  // onmiskenbaar en uitsluitend bij deze feature horen, worden teruggedraaid.
  await db.execute(sql`
   ALTER TABLE "trainer_accounts" DROP COLUMN IF EXISTS "monday_trainerboard_id";
  ALTER TABLE "trainer_accounts" DROP COLUMN IF EXISTS "monday_uitvoerder_item_id";`);
}
