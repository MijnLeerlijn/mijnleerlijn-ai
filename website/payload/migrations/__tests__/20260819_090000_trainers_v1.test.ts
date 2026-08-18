import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { up, down } from "../20260819_090000_trainers_v1";
import type { MigrateUpArgs } from "@payloadcms/db-postgres";

// Incidentregressie 2026-08-19 (zie commentaar bovenaan
// 20260819_090000_trainers_v1.ts): draait de daadwerkelijke up()/down() uit
// die migratie tegen een ECHTE lokale Postgres, niet gemockt — dit is een
// bewuste uitzondering op het "geen live DB nodig"-patroon van de rest van
// deze testsuite (zie vitest.setup.ts: DATABASE_URI is daar altijd nep).
// Zonder een echte database valt de kern van dit incident (een reeds
// bestaande tabel met een ANDERE kolomvorm dan verwacht) niet zinvol te
// simuleren. Als er geen Postgres bereikbaar is (bv. een CI-omgeving zonder
// database), slaat de hele suite zichzelf over i.p.v. valse rood te geven.
const TEST_DATABASE_URI =
  process.env.MIGRATION_TEST_DATABASE_URI ?? "postgres://mijnleerlijn:mijnleerlijn@localhost:5432/mijnleerlijn";
const TEST_DB_NAAM = "mijnleerlijn_migratie_test_trainers_v1";

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

describe.skipIf(!beschikbaar)("migratie 20260819_090000_trainers_v1 (echte Postgres)", () => {
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
    // Schone lei per test: alles weg, en alleen het minimale prerequisite
    // dat een echte Payload-database op dit punt altijd al heeft
    // (payload_locked_documents_rels bestaat sinds de allereerste migratie).
    await db.execute(sql`DROP TABLE IF EXISTS "trainers_sessions" CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS "trainers" CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS "payload_locked_documents_rels" CASCADE;`);
    await db.execute(sql`CREATE TABLE "payload_locked_documents_rels" ("id" serial PRIMARY KEY NOT NULL);`);
  });

  it("bouwt het volledige schema op een schone database", async () => {
    const payload = maakPayloadStub();
    await up({ db, payload, req: {} } as unknown as MigrateUpArgs);

    const kolommen = await haalKolomInfo(db, "trainers");
    expect([...kolommen.keys()].sort()).toEqual([...VOLLEDIGE_V1_KOLOMMEN].sort());
    expect(kolommen.get("monday_trainerboard_id")?.nullable).toBe(false);
    expect(kolommen.get("monday_uitvoerder_item_id")?.nullable).toBe(false);
    expect(kolommen.get("name")?.nullable).toBe(false);
    expect(kolommen.get("email")?.nullable).toBe(false);
    expect(await tabelBestaat(db, "trainers_sessions")).toBe(true);

    const kolomLockedDocs = await haalKolomInfo(db, "payload_locked_documents_rels");
    expect(kolomLockedDocs.has("trainers_id")).toBe(true);
    expect(payload.logger.warn).not.toHaveBeenCalled();
  });

  it("regressie: vult een reeds bestaande trainers-tabel aan die monday_trainerboard_id en monday_uitvoerder_item_id mist", async () => {
    // Reproduceert het exacte productie-incident: een tabel met Payload's
    // eigen auth-kolommen, maar zonder de twee Monday-ID-kolommen — precies
    // de vorm die de oorspronkelijke CREATE TABLE IF NOT EXISTS liet staan
    // toen de tabel al (met onbekende oorsprong) bestond.
    await db.execute(sql`
      CREATE TABLE "trainers" (
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

    const kolommen = await haalKolomInfo(db, "trainers");
    expect([...kolommen.keys()].sort()).toEqual([...VOLLEDIGE_V1_KOLOMMEN].sort());
    expect(kolommen.get("monday_trainerboard_id")?.nullable).toBe(false);
    expect(kolommen.get("monday_uitvoerder_item_id")?.nullable).toBe(false);

    const indexResultaat = await db.execute(sql`
      SELECT indexname FROM pg_indexes WHERE tablename = 'trainers';
    `);
    const indexNamen = (indexResultaat.rows as Array<{ indexname: string }>).map((r) => r.indexname);
    expect(indexNamen).toContain("trainers_monday_trainerboard_id_idx");
    expect(indexNamen).toContain("trainers_monday_uitvoerder_item_id_idx");
  });

  it("voegt ontbrekende NOT NULL-kolommen nullable toe (niet NOT NULL) wanneer de tabel al rijen heeft, en verliest geen data", async () => {
    await db.execute(sql`
      CREATE TABLE "trainers" (
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
      INSERT INTO "trainers" ("name", "email") VALUES ('Bestaande Trainer', 'bestaand@mijnleerlijn.nl');
    `);

    const payload = maakPayloadStub();
    await up({ db, payload, req: {} } as unknown as MigrateUpArgs);

    const kolommen = await haalKolomInfo(db, "trainers");
    expect(kolommen.get("monday_trainerboard_id")?.nullable).toBe(true);
    expect(kolommen.get("monday_uitvoerder_item_id")?.nullable).toBe(true);
    expect(payload.logger.warn).toHaveBeenCalled();

    const rijenResultaat = await db.execute(sql`SELECT "name", "email" FROM "trainers";`);
    expect(rijenResultaat.rows).toEqual([{ name: "Bestaande Trainer", email: "bestaand@mijnleerlijn.nl" }]);
  });

  it("weigert een tabel te wijzigen die niet Payload's eigen auth-kolommen heeft (mogelijk andere functie)", async () => {
    await db.execute(sql`
      CREATE TABLE "trainers" (
        "id" serial PRIMARY KEY NOT NULL,
        "spreadsheet_rij" integer,
        "geimporteerd_op" timestamp
      );
    `);

    const payload = maakPayloadStub();
    await expect(up({ db, payload, req: {} } as unknown as MigrateUpArgs)).rejects.toThrow(
      /mist kolommen die Payload/
    );

    // Geen enkele wijziging aangebracht: de vreemde tabel staat er nog
    // exact zo, en trainers_sessions is nooit aangemaakt.
    const kolommen = await haalKolomInfo(db, "trainers");
    expect([...kolommen.keys()].sort()).toEqual(["geimporteerd_op", "id", "spreadsheet_rij"]);
    expect(await tabelBestaat(db, "trainers_sessions")).toBe(false);
  });

  it("is idempotent: een tweede up()-aanroep op een al volledig gemigreerde database verandert niets en faalt niet", async () => {
    const payload = maakPayloadStub();
    await up({ db, payload, req: {} } as unknown as MigrateUpArgs);
    const kolommenNaEen = await haalKolomInfo(db, "trainers");

    await expect(up({ db, payload, req: {} } as unknown as MigrateUpArgs)).resolves.not.toThrow();
    const kolommenNaTwee = await haalKolomInfo(db, "trainers");

    expect([...kolommenNaTwee.keys()].sort()).toEqual([...kolommenNaEen.keys()].sort());
    for (const [naam, info] of kolommenNaEen) {
      expect(kolommenNaTwee.get(naam)).toEqual(info);
    }
  });

  it("down() laat de trainers-tabel bestaan en verwijdert alleen de twee Monday-ID-kolommen", async () => {
    const payload = maakPayloadStub();
    await up({ db, payload, req: {} } as unknown as MigrateUpArgs);

    await down({ db, payload, req: {} } as unknown as MigrateUpArgs);

    expect(await tabelBestaat(db, "trainers")).toBe(true);
    expect(await tabelBestaat(db, "trainers_sessions")).toBe(false);

    const kolommen = await haalKolomInfo(db, "trainers");
    expect(kolommen.has("monday_trainerboard_id")).toBe(false);
    expect(kolommen.has("monday_uitvoerder_item_id")).toBe(false);
    expect(kolommen.has("name")).toBe(true);
    expect(kolommen.has("email")).toBe(true);
  });
});
