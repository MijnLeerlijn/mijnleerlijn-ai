import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import type { Payload } from "payload";

// Incidentregressie 2026-08-19 (zie commentaar bovenaan
// 20260819_110000_trainer_accounts_system_rels_fix.ts): productie crashte
// NA de trainer-accounts-deploy met "column trainer_accounts_id does not
// exist" op payload_preferences_rels — geraakt door letterlijk elke
// admin-dashboardlading (getDashboardSelection() hieronder, aangeroepen
// door BeheerDashboard.tsx). Dit bestand draait de ECHTE Payload-boot
// (getPayload({config})) + de ECHTE getDashboardSelection()-query tegen een
// echte lokale Postgres — geen mock — omdat de crash zelf ontstaat in
// Payload/Drizzle's eigen, uit de actuele config afgeleide schemamapping
// (elke auth: true-collectie krijgt automatisch een kolom in dit soort
// systeemtabellen), niet in iets dat op tabelniveau alleen te simuleren is.
// Bewuste uitzondering op het "geen live DB nodig"-patroon van de rest van
// deze testsuite (vitest.setup.ts zet DATABASE_URI daarom altijd nep) —
// slaat zichzelf over zonder bereikbare Postgres.
const TEST_DATABASE_URI =
  process.env.MIGRATION_TEST_DATABASE_URI ?? "postgres://mijnleerlijn:mijnleerlijn@localhost:5432/mijnleerlijn";
const TEST_DB_NAAM = "mijnleerlijn_migratie_test_system_rels_fix";

function vervangDatabasenaam(uri: string, nieuweNaam: string): string {
  const url = new URL(uri);
  url.pathname = `/${nieuweNaam}`;
  return url.toString();
}

// payload.db.migrate() rechtstreeks vanuit vitest aanroepen loopt stuk op
// een omgevingsspecifieke eigenaardigheid in Payload's eigen dynamicImport()
// (readMigrationFiles.ts): die laadt elk migratiebestand rechtstreeks vanaf
// schijf buiten vitest's eigen TS-transform om, waardoor het type-only
// "MigrateUpArgs"/"MigrateDownArgs"-import in deze migraties als een echte
// runtime-export wordt behandeld — geen probleem van deze migratie of dit
// project, alleen zichtbaar wanneer `payload.db.migrate()` vanuit vitest
// draait i.p.v. de echte CLI. `payload migrate` zelf (via tsx, zoals
// build:production dat ook gebruikt) is al apart, handmatig geverifieerd
// tegen precies dit scenario (zie het opleverrapport) — hier dezelfde,
// echte CLI aanroepen i.p.v. de kapotte in-process route.
function draaiPayloadMigrate(databaseUri: string): void {
  execFileSync("npx", ["payload", "migrate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URI: databaseUri, PAYLOAD_MIGRATING: "true" },
    stdio: "pipe",
  });
}

// Losstaand van Payload, rechtstreeks via scratchPool: verifieert het
// daadwerkelijke, directe effect van de herstelmigratie zelf op de
// databasekolom — onafhankelijk van of Payload's eigen queryschema dat
// vervolgens ook correct oppikt (dat laatste toetst de test zelf, via
// getDashboardSelection hieronder).
async function kolomBestaat(pool: Pool, tabel: string, kolom: string): Promise<boolean> {
  const resultaat = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2) AS "exists";`,
    [tabel, kolom]
  );
  return Boolean(resultaat.rows[0].exists);
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
const scratchUri = vervangDatabasenaam(TEST_DATABASE_URI, TEST_DB_NAAM);
const oorspronkelijkeDatabaseUri = process.env.DATABASE_URI;
const oorspronkelijkePayloadMigrating = process.env.PAYLOAD_MIGRATING;

describe.skipIf(!beschikbaar)(
  "herstelmigratie 20260819_110000_trainer_accounts_system_rels_fix (echte Postgres + echte Payload-boot)",
  () => {
    let adminPool: Pool;
    let scratchPool: Pool;
    let payloadVoorFix: Payload | undefined;
    let payloadNaFix: Payload | undefined;
    let gebruikerId: number;
    let getDashboardSelection: typeof import("@/lib/admin-nav/dashboard-preferences").getDashboardSelection;
    let getPayload: typeof import("payload").getPayload;
    let config: typeof import("@/payload.config").default;

    beforeAll(async () => {
      adminPool = new Pool({ connectionString: TEST_DATABASE_URI });
      await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM};`);
      await adminPool.query(`CREATE DATABASE ${TEST_DB_NAAM};`);

      // payload.config.ts leest DATABASE_URI op importtijd (top-level
      // postgresAdapter({...})) — moet dus al gezet zijn vóórdat de
      // dynamische import hieronder draait.
      process.env.DATABASE_URI = scratchUri;
      process.env.PAYLOAD_MIGRATING = "true";

      ({ getPayload } = await import("payload"));
      config = (await import("@/payload.config")).default;
      ({ getDashboardSelection } = await import("@/lib/admin-nav/dashboard-preferences"));

      // Volledige, echte migratieketen — inclusief deze herstelmigratie —
      // via de echte CLI (zie toelichting bij draaiPayloadMigrate hierboven).
      draaiPayloadMigrate(scratchUri);

      scratchPool = new Pool({ connectionString: scratchUri });

      // Zaai een echte gebruiker + dashboardvoorkeur, zoals productie die heeft.
      const gebruikerResultaat = await scratchPool.query(
        `INSERT INTO "users" ("email", "name") VALUES ('admin@mijnleerlijn.nl', 'Test Admin') RETURNING id;`
      );
      gebruikerId = gebruikerResultaat.rows[0].id as number;

      const voorkeurResultaat = await scratchPool.query(
        `INSERT INTO "payload_preferences" ("key", "value") VALUES ('ml-dashboard-items', $1::jsonb) RETURNING id;`,
        [JSON.stringify(["/admin/collections/articles"])]
      );
      const voorkeurId = voorkeurResultaat.rows[0].id as number;
      await scratchPool.query(
        `INSERT INTO "payload_preferences_rels" ("order", "parent_id", "path", "users_id") VALUES (0, $1, 'user', $2);`,
        [voorkeurId, gebruikerId]
      );

      // Simuleer exact de gemelde productiestaat: de herstelmigratie is
      // (nog) niet toegepast — punt 3 van de opdracht.
      await scratchPool.query(`
        ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT IF EXISTS "payload_preferences_rels_trainer_accounts_fk";
        DROP INDEX IF EXISTS "payload_preferences_rels_trainer_accounts_id_idx";
        ALTER TABLE "payload_preferences_rels" DROP COLUMN IF EXISTS "trainer_accounts_id";
        DELETE FROM "payload_migrations" WHERE name = '20260819_110000_trainer_accounts_system_rels_fix';
      `);
    }, 60000);

    afterAll(async () => {
      // payload.destroy() ruimt uitsluitend Payload's eigen interne
      // schema-/state-referenties op (node_modules/@payloadcms/drizzle/
      // dist/destroy.js, gelezen tijdens dit werk) — het sluit de
      // onderliggende pg.Pool-verbinding NOOIT, en die netjes zelf
      // opvragen/sluiten bleek tijdens dit werk zelf te kunnen hangen
      // (een niet-vrijgegeven checked-out client). Twee losse, echte
      // Payload-instances (elk met een eigen pool, bewust gescheiden om de
      // Drizzle-querycache-valkuil hierboven te vermijden) maakt dit
      // instabiel genoeg om niet op te laten hangen — vandaar hieronder
      // "WITH (FORCE)" (Postgres 13+) i.p.v. zelf elke pool netjes te
      // draineren: forceert het sluiten van alle resterende verbindingen
      // vóór de DROP, ongeacht wat Payload intern nog openhoudt. Een pool die
      // zo geforceerd wordt afgebroken vuurt daarna een eigen 'error'-event
      // (pg's standaardgedrag bij een backend-gedwongen disconnect) — zonder
      // listener wordt dat een onafgevangen exception die vitest als
      // "unhandled error" logt, ook al slaagt de test zelf gewoon. Geen
      // functioneel probleem, maar wel ruis die een echt probleem later kan
      // maskeren — vandaar hier een no-op listener op beide pools, puur om
      // dat verwachte event af te vangen.
      for (const instance of [payloadVoorFix, payloadNaFix]) {
        const pool = (instance?.db as unknown as { pool?: { on: (event: string, cb: () => void) => void } })?.pool;
        pool?.on("error", () => {});
      }
      await scratchPool?.end();
      await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM} WITH (FORCE);`);
      await adminPool.end();

      if (oorspronkelijkeDatabaseUri === undefined) delete process.env.DATABASE_URI;
      else process.env.DATABASE_URI = oorspronkelijkeDatabaseUri;
      if (oorspronkelijkePayloadMigrating === undefined) delete process.env.PAYLOAD_MIGRATING;
      else process.env.PAYLOAD_MIGRATING = oorspronkelijkePayloadMigrating;
    }, 30000);

    it("PRODUCTIESCENARIO: een bestaande users-voorkeur (ml-dashboard-items) is onleesbaar zolang de herstelmigratie ontbreekt, en weer leesbaar zodra ze draait", async () => {
      // Punt 1 + 2 van de opdracht: trainer_accounts bestaat, en
      // payload_locked_documents_rels heeft de kolom al (van de eerdere
      // migratie) — bevestigen vóórdat we verdergaan, geen aanname.
      const trainerAccountsBestaat = await scratchPool.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trainer_accounts') AS "exists";`
      );
      expect(trainerAccountsBestaat.rows[0].exists).toBe(true);
      const lockedDocsHeeftKolom = await scratchPool.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payload_locked_documents_rels' AND column_name = 'trainer_accounts_id') AS "exists";`
      );
      expect(lockedDocsHeeftKolom.rows[0].exists).toBe(true);

      // Punt 4: dezelfde echte Payload-query die productie liet crashen —
      // eigen, apart gecachte Payload-instance (getPayload() cachet zelf op
      // "key", zie node_modules/payload/dist/index.js) zodat dit een echte
      // nieuwe boot tegen de kapotte staat is, niet een herbruikte
      // in-process instance met een eigen querycache.
      payloadVoorFix = await getPayload({ config, key: "voor-fix" });
      await expect(getDashboardSelection(payloadVoorFix, { id: gebruikerId, collection: "users" })).rejects.toThrow(
        /trainer_accounts_id/
      );

      // Herstelmigratie (opnieuw) toepassen via de echte CLI.
      draaiPayloadMigrate(scratchUri);

      // Verifieer het directe effect van de migratie zelf, losstaand van
      // Payload — de kolom moet nu weer bestaan.
      expect(await kolomBestaat(scratchPool, "payload_preferences_rels", "trainer_accounts_id")).toBe(true);

      // Nieuwe boot ná de fix — exact hoe een echte nieuwe deploy dit ziet:
      // migratie eerst volledig klaar, dán pas een nieuw Payload-proces.
      payloadNaFix = await getPayload({ config, key: "na-fix" });
      const selectie = await getDashboardSelection(payloadNaFix, { id: gebruikerId, collection: "users" });
      expect(selectie).toEqual(["/admin/collections/articles"]);
    }, 60000);
  }
);
