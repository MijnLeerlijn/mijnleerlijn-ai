import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { up, down } from "../20260819_100000_trainer_accounts_v1";
import type { MigrateUpArgs } from "@payloadcms/db-postgres";

// Incidentregressie 2026-08-19 (zie commentaar bovenaan
// 20260819_100000_trainer_accounts_v1.ts): draait de daadwerkelijke
// up()/down() uit die migratie tegen een ECHTE lokale Postgres, niet
// gemockt — bewuste uitzondering op het "geen live DB nodig"-patroon van de
// rest van deze testsuite (zie vitest.setup.ts: DATABASE_URI is daar altijd
// nep). Slaat zichzelf over als er geen Postgres bereikbaar is.
const TEST_DATABASE_URI =
  process.env.MIGRATION_TEST_DATABASE_URI ?? "postgres://mijnleerlijn:mijnleerlijn@localhost:5432/mijnleerlijn";
const TEST_DB_NAAM = "mijnleerlijn_migratie_test_trainer_accounts_v1";

function vervangDatabasenaam(uri: string, nieuweNaam: string): string {
  const url = new URL(uri);
  url.pathname = `/${nieuweNaam}`;
  return url.toString();
}

async function postgresBereikbaar(): Promise<boolean> {
  const pool = new Pool({ connectionString: TEST_DATABASE_URI, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("SELECT 1;");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

const beschikbaar = await postgresBereikbaar();

function maakPayloadStub() {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as MigrateUpArgs["payload"];
}

async function haalKolomInfo(db: NodePgDatabase, tabel: string) {
  const resultaat = await db.execute(sql`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tabel};
  `);
  const kolommen = new Map<string, { nullable: boolean }>();
  for (const rij of resultaat.rows as Array<{ column_name: string; is_nullable: string }>) {
    kolommen.set(rij.column_name, { nullable: rij.is_nullable === "YES" });
  }
  return kolommen;
}

async function tabelBestaat(db: NodePgDatabase, tabel: string): Promise<boolean> {
  const resultaat = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tabel}
    ) AS "exists";
  `);
  return Boolean((resultaat.rows[0] as { exists: boolean } | undefined)?.exists);
}

const VOLLEDIGE_V1_KOLOMMEN = [
  "id",
  "name",
  "monday_trainerboard_id",
  "monday_uitvoerder_item_id",
  "actief",
  "updated_at",
  "created_at",
  "email",
  "reset_password_token",
  "reset_password_expiration",
  "salt",
  "hash",
  "login_attempts",
  "lock_until",
];

// Exact de kolomvorm die Michel uit productie meldde (2026-08-19) — een
// bestaand, ongerelateerd technisch trainer-/boardmapping-mechanisme, geen
// Payload-authtabel.
const LEGACY_TRAINERS_KOLOMMEN = [
  "active",
  "created_at",
  "date_column_id",
  "executor_item_id",
  "id",
  "last_validated_at",
  "logbook_column_id",
  "master_id_column_id",
  "status_column_id",
  "trainer_board_id",
  "trainer_id",
  "trainer_name",
  "updated_at",
  "validation_status",
].sort();

describe.skipIf(!beschikbaar)("migratie 20260819_100000_trainer_accounts_v1 (echte Postgres)", () => {
  let adminPool: Pool;
  let pool: Pool;
  let db: NodePgDatabase;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: TEST_DATABASE_URI });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM};`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAAM};`);

    pool = new Pool({ connectionString: vervangDatabasenaam(TEST_DATABASE_URI, TEST_DB_NAAM) });
    db = drizzle(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM};`);
    await adminPool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`DROP TABLE IF EXISTS "trainer_accounts_sessions" CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS "trainer_accounts" CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS "trainers" CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS "payload_locked_documents_rels" CASCADE;`);
    await db.execute(sql`CREATE TABLE "payload_locked_documents_rels" ("id" serial PRIMARY KEY NOT NULL);`);
  });

  it("bouwt het volledige schema op een schone database", async () => {
    const payload = maakPayloadStub();
    await up({ db, payload, req: {} } as unknown as MigrateUpArgs);

    const kolommen = await haalKolomInfo(db, "trainer_accounts");
    expect([...kolommen.keys()].sort()).toEqual([...VOLLEDIGE_V1_KOLOMMEN].sort());
    expect(kolommen.get("monday_trainerboard_id")?.nullable).toBe(false);
    expect(kolommen.get("monday_uitvoerder_item_id")?.nullable).toBe(false);
    expect(await tabelBestaat(db, "trainer_accounts_sessions")).toBe(true);

    const kolomLockedDocs = await haalKolomInfo(db, "payload_locked_documents_rels");
    expect(kolomLockedDocs.has("trainer_accounts_id")).toBe(true);
    expect(payload.logger.warn).not.toHaveBeenCalled();
  });

  it("PRODUCTIESCENARIO: een bestaande, niet-Payload 'trainers'-tabel (legacy board-mapping) blijft volledig onaangeraakt; de nieuwe auth-collectie krijgt uitsluitend haar eigen trainer_accounts-tabel", async () => {
    await db.execute(
      sql.raw(
        `CREATE TABLE "trainers" (
          "id" serial PRIMARY KEY NOT NULL,
          "trainer_name" varchar,
          "trainer_id" varchar,
          "trainer_board_id" varchar,
          "executor_item_id" varchar,
          "master_id_column_id" varchar,
          "status_column_id" varchar,
          "date_column_id" varchar,
          "logbook_column_id" varchar,
          "validation_status" varchar,
          "last_validated_at" timestamp,
          "active" boolean DEFAULT true,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );`
      )
    );
    await db.execute(sql`
      INSERT INTO "trainers" ("trainer_name", "trainer_id", "trainer_board_id", "active")
      VALUES ('Legacy Trainer', 'ext-001', 'board-123', true);
    `);
    const legacyRijVoor = (await db.execute(sql`SELECT * FROM "trainers";`)).rows;
    const legacyKolommenVoor = await haalKolomInfo(db, "trainers");

    const payload = maakPayloadStub();
    await expect(up({ db, payload, req: {} } as unknown as MigrateUpArgs)).resolves.not.toThrow();

    // 1. De nieuwe auth-tabel is volledig en correct aangemaakt.
    const kolommenNieuweTabel = await haalKolomInfo(db, "trainer_accounts");
    expect([...kolommenNieuweTabel.keys()].sort()).toEqual([...VOLLEDIGE_V1_KOLOMMEN].sort());
    expect(await tabelBestaat(db, "trainer_accounts_sessions")).toBe(true);

    // 2. De bestaande "trainers"-tabel is schema-technisch volledig
    //    ongewijzigd: exact dezelfde kolommen, dezelfde nullability.
    const legacyKolommenNa = await haalKolomInfo(db, "trainers");
    expect([...legacyKolommenNa.keys()].sort()).toEqual(LEGACY_TRAINERS_KOLOMMEN);
    expect(legacyKolommenNa).toEqual(legacyKolommenVoor);

    // 3. Geen enkele nieuwe index/constraint op de legacy-tabel.
    const legacyIndexen = (
      await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename = 'trainers';`)
    ).rows as Array<{ indexname: string }>;
    expect(legacyIndexen.map((i) => i.indexname)).toEqual(["trainers_pkey"]);

    // 4. De bestaande rij in de legacy-tabel is byte-for-byte ongewijzigd.
    const legacyRijNa = (await db.execute(sql`SELECT * FROM "trainers";`)).rows;
    expect(legacyRijNa).toEqual(legacyRijVoor);

    expect(payload.logger.warn).not.toHaveBeenCalled();
  });

  it("regressie: vult een reeds bestaande trainer_accounts-tabel aan die monday_trainerboard_id en monday_uitvoerder_item_id mist", async () => {
    await db.execute(sql`
      CREATE TABLE "trainer_accounts" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "actief" boolean DEFAULT true,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "email" varchar NOT NULL,
        "reset_password_token" varchar,
        "reset_password_expiration" timestamp(3) with time zone,
        "salt" varchar,
        "hash" varchar,
        "login_attempts" numeric DEFAULT 0,
        "lock_until" timestamp(3) with time zone
      );
    `);

    const payload = maakPayloadStub();
    await expect(up({ db, payload, req: {} } as unknown as MigrateUpArgs)).resolves.not.toThrow();

    const kolommen = await haalKolomInfo(db, "trainer_accounts");
    expect([...kolommen.keys()].sort()).toEqual([...VOLLEDIGE_V1_KOLOMMEN].sort());
    expect(kolommen.get("monday_trainerboard_id")?.nullable).toBe(false);
    expect(kolommen.get("monday_uitvoerder_item_id")?.nullable).toBe(false);

    const indexResultaat = await db.execute(sql`
      SELECT indexname FROM pg_indexes WHERE tablename = 'trainer_accounts';
    `);
    const indexNamen = (indexResultaat.rows as Array<{ indexname: string }>).map((r) => r.indexname);
    expect(indexNamen).toContain("trainer_accounts_monday_trainerboard_id_idx");
    expect(indexNamen).toContain("trainer_accounts_monday_uitvoerder_item_id_idx");
  });

  it("voegt ontbrekende NOT NULL-kolommen nullable toe (niet NOT NULL) wanneer de tabel al rijen heeft, en verliest geen data", async () => {
    await db.execute(sql`
      CREATE TABLE "trainer_accounts" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "actief" boolean DEFAULT true,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "email" varchar NOT NULL,
        "reset_password_token" varchar,
        "reset_password_expiration" timestamp(3) with time zone,
        "salt" varchar,
        "hash" varchar,
        "login_attempts" numeric DEFAULT 0,
        "lock_until" timestamp(3) with time zone
      );
    `);
    await db.execute(sql`
      INSERT INTO "trainer_accounts" ("name", "email") VALUES ('Bestaande Trainer', 'bestaand@mijnleerlijn.nl');
    `);

    const payload = maakPayloadStub();
    await up({ db, payload, req: {} } as unknown as MigrateUpArgs);

    const kolommen = await haalKolomInfo(db, "trainer_accounts");
    expect(kolommen.get("monday_trainerboard_id")?.nullable).toBe(true);
    expect(kolommen.get("monday_uitvoerder_item_id")?.nullable).toBe(true);
    expect(payload.logger.warn).toHaveBeenCalled();

    const rijenResultaat = await db.execute(sql`SELECT "name", "email" FROM "trainer_accounts";`);
    expect(rijenResultaat.rows).toEqual([{ name: "Bestaande Trainer", email: "bestaand@mijnleerlijn.nl" }]);
  });

  it("weigert een tabel te wijzigen die niet Payload's eigen auth-kolommen heeft (mogelijk andere functie)", async () => {
    await db.execute(sql`
      CREATE TABLE "trainer_accounts" (
        "id" serial PRIMARY KEY NOT NULL,
        "spreadsheet_rij" integer,
        "geimporteerd_op" timestamp
      );
    `);

    const payload = maakPayloadStub();
    await expect(up({ db, payload, req: {} } as unknown as MigrateUpArgs)).rejects.toThrow(
      /mist kolommen die Payload/
    );

    const kolommen = await haalKolomInfo(db, "trainer_accounts");
    expect([...kolommen.keys()].sort()).toEqual(["geimporteerd_op", "id", "spreadsheet_rij"]);
    expect(await tabelBestaat(db, "trainer_accounts_sessions")).toBe(false);
  });

  it("is idempotent: een tweede up()-aanroep op een al volledig gemigreerde database verandert niets en faalt niet", async () => {
    const payload = maakPayloadStub();
    await up({ db, payload, req: {} } as unknown as MigrateUpArgs);
    const kolommenNaEen = await haalKolomInfo(db, "trainer_accounts");

    await expect(up({ db, payload, req: {} } as unknown as MigrateUpArgs)).resolves.not.toThrow();
    const kolommenNaTwee = await haalKolomInfo(db, "trainer_accounts");

    expect([...kolommenNaTwee.keys()].sort()).toEqual([...kolommenNaEen.keys()].sort());
    for (const [naam, info] of kolommenNaEen) {
      expect(kolommenNaTwee.get(naam)).toEqual(info);
    }
  });

  it("down() laat de trainer_accounts-tabel bestaan en verwijdert alleen de twee Monday-ID-kolommen", async () => {
    const payload = maakPayloadStub();
    await up({ db, payload, req: {} } as unknown as MigrateUpArgs);

    await down({ db, payload, req: {} } as unknown as MigrateUpArgs);

    expect(await tabelBestaat(db, "trainer_accounts")).toBe(true);
    expect(await tabelBestaat(db, "trainer_accounts_sessions")).toBe(false);

    const kolommen = await haalKolomInfo(db, "trainer_accounts");
    expect(kolommen.has("monday_trainerboard_id")).toBe(false);
    expect(kolommen.has("monday_uitvoerder_item_id")).toBe(false);
    expect(kolommen.has("name")).toBe(true);
    expect(kolommen.has("email")).toBe(true);
  });
});
