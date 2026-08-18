import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Traineromgeving V1, Ronde 1 (2026-08-19) — nieuwe auth-collectie "trainers"
// (payload/collections/Trainers.ts). Hand-geschreven, zelfde aanpak/
// conventies als 20260817_130000_google_connections.ts/20260817_170000_
// mail_signalen.ts: `payload migrate:create` bleef hangen op een interactieve
// "is trainers_sessions een nieuwe tabel of een hernoeming van
// helpdesk_voorbeeldvragen(_vragen)?"-vraag (Payload/Drizzle's schema-diff-
// heuristiek matcht op tabelvorm, niet op intentie — een fout antwoord had
// een ONGERELATEERDE bestaande tabel kunnen hernoemen/vernietigen) zonder een
// niet-interactieve manier om "nieuwe tabel" te bevestigen; dit bestand is
// daarom met de hand geschreven, exact volgens het schema dat Payload voor
// een `auth: {...}`-collectie zonder extra velden buiten name/monday-ID's/
// actief zou genereren (zie users/users_sessions in
// 20260721_135820_initial.ts als referentieschema — identieke auth-kolommen).
//
// INCIDENT 2026-08-19 (productiemigratie faalde met "column
// monday_trainerboard_id does not exist"): een tabel genaamd "trainers"
// bleek in productie al te bestaan vóórdat deze migratie ooit draaide, met
// een schema dat de twee Monday-ID-kolommen mist. Git-geschiedenis (alle
// branches) en de `push: false`-instelling in payload.config.ts sluiten
// allebei uit dat enige migratie of Drizzle dev-push in dit project die
// tabel ooit heeft aangemaakt — de oorsprong is onbekend en NIET
// vastgesteld. `CREATE TABLE IF NOT EXISTS` sloeg de aanmaak daardoor
// stilzwijgend over, waarna de latere `CREATE UNIQUE INDEX` op de
// ontbrekende kolom faalde.
//
// up() is daarom herschreven van één statische CREATE TABLE naar
// kolomsgewijze introspectie (information_schema) + veilige aanvulling: de
// enige manier om zowel een lege database als een reeds bestaande —
// mogelijk onvolledige, mogelijk zelfs voor iets heel anders bedoelde —
// "trainers"-tabel correct en zonder dataverlies af te handelen:
//   1. Bestaat de tabel al? Zo ja: bevat hij Payload's eigen, altijd
//      automatisch gegenereerde auth-kolommen (email/hash/salt/
//      reset_password_token/login_attempts)? Zo niet, dan is dit
//      aantoonbaar geen door déze applicatie aangemaakte trainers-tabel —
//      de migratie stopt dan met een expliciete fout i.p.v. te gokken.
//   2. Ontbrekende kolommen zonder datarisico (nullable, of NOT NULL met
//      een DEFAULT dat bestaande rijen automatisch vult) worden direct
//      toegevoegd.
//   3. Ontbrekende NOT NULL-kolommen zonder zinvolle standaardwaarde
//      (name/monday_trainerboard_id/monday_uitvoerder_item_id/email)
//      worden alleen als NOT NULL gezet wanneer de tabel op dat moment nul
//      rijen heeft; zijn er al rijen, dan blijft de kolom nullable en komt
//      er een duidelijke waarschuwing voor handmatige opvolging — nooit een
//      migratie die faalt of blokkeert op bestaande data.
// Nergens wordt een bestaande tabel gedropt of bestaande data verwijderd.
// Zie ook down(): laat de trainers-tabel zelf om dezelfde reden altijd
// staan.
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

async function trainersTabelBestaat(db: MigrateUpArgs["db"]): Promise<boolean> {
  const resultaat = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'trainers'
    ) AS "exists";
  `);
  return Boolean((resultaat.rows[0] as { exists: boolean } | undefined)?.exists);
}

async function haalTrainersKolommen(db: MigrateUpArgs["db"]): Promise<Set<string>> {
  const resultaat = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trainers';
  `);
  return new Set((resultaat.rows as Array<{ column_name: string }>).map((rij) => rij.column_name));
}

async function telTrainersRijen(db: MigrateUpArgs["db"]): Promise<number> {
  const resultaat = await db.execute(sql`SELECT COUNT(*)::int AS "count" FROM "trainers";`);
  return Number((resultaat.rows[0] as { count: number } | undefined)?.count ?? 0);
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const bestondAlVooraf = await trainersTabelBestaat(db);

  if (bestondAlVooraf) {
    const bestaandeKolommen = await haalTrainersKolommen(db);
    const ontbrekendeVingerafdruk = AUTH_VINGERAFDRUK_KOLOMMEN.filter((naam) => !bestaandeKolommen.has(naam));

    if (ontbrekendeVingerafdruk.length > 0) {
      throw new Error(
        `[trainers_v1] Een tabel genaamd "trainers" bestaat al in deze database, maar mist kolommen die Payload ` +
          `altijd automatisch aanmaakt voor een auth-collectie (ontbrekend: ${ontbrekendeVingerafdruk.join(", ")}). ` +
          `Gevonden kolommen: ${[...bestaandeKolommen].sort().join(", ") || "(geen)"}. ` +
          `Dit duidt erop dat deze tabel NIET door de Trainers-collectie van deze applicatie is aangemaakt en ` +
          `mogelijk een andere, onbekende functie heeft. Deze migratie stopt bewust zonder wijzigingen aan de ` +
          `"trainers"-tabel aan te brengen — onderzoek eerst handmatig wat deze tabel is en waar hij vandaan komt ` +
          `voordat je verder gaat.`
      );
    }
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "trainers_sessions" (
    	"_order" integer NOT NULL,
    	"_parent_id" integer NOT NULL,
    	"id" varchar PRIMARY KEY NOT NULL,
    	"created_at" timestamp(3) with time zone,
    	"expires_at" timestamp(3) with time zone NOT NULL
    );`);

  if (!bestondAlVooraf) {
    await db.execute(sql`CREATE TABLE "trainers" ("id" serial PRIMARY KEY NOT NULL);`);
  }

  const huidigeKolommen = bestondAlVooraf ? await haalTrainersKolommen(db) : new Set(["id"]);

  for (const { naam, ddl } of KOLOMMEN_MET_VEILIGE_STANDAARDWAARDE) {
    if (!huidigeKolommen.has(naam)) {
      await db.execute(sql.raw(`ALTER TABLE "trainers" ADD COLUMN IF NOT EXISTS "${naam}" ${ddl};`));
    }
  }

  const ontbrekendeVerplichteKolommen = VERPLICHTE_KOLOMMEN_ZONDER_STANDAARDWAARDE.filter(
    ({ naam }) => !huidigeKolommen.has(naam)
  );

  if (ontbrekendeVerplichteKolommen.length > 0) {
    // Rijen tellen vóórdat NOT NULL wordt overwogen — een bestaande rij mag
    // nooit alsnog een migratiefout veroorzaken door een NOT NULL-kolom
    // zonder waarde te krijgen.
    const aantalRijen = await telTrainersRijen(db);

    for (const { naam, ddl } of ontbrekendeVerplichteKolommen) {
      await db.execute(sql.raw(`ALTER TABLE "trainers" ADD COLUMN IF NOT EXISTS "${naam}" ${ddl};`));

      if (aantalRijen === 0) {
        await db.execute(sql.raw(`ALTER TABLE "trainers" ALTER COLUMN "${naam}" SET NOT NULL;`));
      } else {
        payload.logger.warn({
          msg:
            `[trainers_v1] Kolom "${naam}" toegevoegd aan een bestaande "trainers"-tabel met ${aantalRijen} ` +
            `bestaande rij(en), maar NIET als NOT NULL gezet omdat die rijen deze waarde missen. Vul de kolom ` +
            `handmatig aan voor alle bestaande rijen en voer daarna zelf uit: ` +
            `ALTER TABLE "trainers" ALTER COLUMN "${naam}" SET NOT NULL;`,
        });
      }
    }
  }

  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trainers_id" integer;

    DO $$ BEGIN
     ALTER TABLE "trainers_sessions" ADD CONSTRAINT "trainers_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
     ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainers_fk" FOREIGN KEY ("trainers_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
     WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "trainers_sessions_order_idx" ON "trainers_sessions" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "trainers_sessions_parent_id_idx" ON "trainers_sessions" USING btree ("_parent_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "trainers_monday_trainerboard_id_idx" ON "trainers" USING btree ("monday_trainerboard_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "trainers_monday_uitvoerder_item_id_idx" ON "trainers" USING btree ("monday_uitvoerder_item_id");
    CREATE INDEX IF NOT EXISTS "trainers_updated_at_idx" ON "trainers" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "trainers_created_at_idx" ON "trainers" USING btree ("created_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "trainers_email_idx" ON "trainers" USING btree ("email");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainers_id_idx" ON "payload_locked_documents_rels" USING btree ("trainers_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload_locked_documents_rels_trainers_id_idx";
  DROP INDEX IF EXISTS "trainers_email_idx";
  DROP INDEX IF EXISTS "trainers_created_at_idx";
  DROP INDEX IF EXISTS "trainers_updated_at_idx";
  DROP INDEX IF EXISTS "trainers_monday_uitvoerder_item_id_idx";
  DROP INDEX IF EXISTS "trainers_monday_trainerboard_id_idx";
  DROP INDEX IF EXISTS "trainers_sessions_parent_id_idx";
  DROP INDEX IF EXISTS "trainers_sessions_order_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trainers_fk";
  ALTER TABLE "trainers_sessions" DROP CONSTRAINT IF EXISTS "trainers_sessions_parent_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainers_id";

  DROP TABLE IF EXISTS "trainers_sessions" CASCADE;`);

  // "trainers" zelf wordt hier bewust NOOIT gedropt: up() kan tegen een
  // reeds bestaande tabel gedraaid hebben die deze migratie niet zelf heeft
  // aangemaakt (zie up()-commentaar). Alleen de twee kolommen die
  // onmiskenbaar en uitsluitend bij deze feature horen, worden teruggedraaid.
  await db.execute(sql`
   ALTER TABLE "trainers" DROP COLUMN IF EXISTS "monday_trainerboard_id";
  ALTER TABLE "trainers" DROP COLUMN IF EXISTS "monday_uitvoerder_item_id";`);
}
