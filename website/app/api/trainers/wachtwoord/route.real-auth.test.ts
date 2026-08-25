// @vitest-environment node
//
// Zelfde jsdom-vs-Node-realmmismatch als app/api/trainers/trainingen/[id]/
// route.real-auth.test.ts (payload.login() se jose/jwtSign) — dit bestand
// voert ECHTE payload.login()-aanroepen uit, dus moet ook in Node's eigen
// realm draaien.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import type { Payload } from "payload";

// Correctieronde Admin Traineromgeving (2026-08-25) — sluit het gat dat GEEN
// enkele gemockte test kan dichten: bewijst dat wijzigEigenWachtwoord() een
// ECHTE bcrypt-hash in Postgres bijwerkt, via een ECHTE payload.login()-ronde
// vóór én NA de wijziging — "nieuw wachtwoord werkt daarna voor login" en
// "oud wachtwoord werkt daarna niet meer" zijn beide uitspraken over Payload's
// eigen auth-/hashingmachinerie, niet iets dat op functieniveau met een mock
// aan te tonen is (een mock retourneert altijd precies wat de test 'm
// vertelt). Zelfde bewezen patroon/bouwstenen als de trainingen/[id]-
// tegenhanger — hier bewust ZONDER enige Monday-mock: deze route/dit
// datamodel raakt Monday domweg nooit.
const TEST_DATABASE_URI = process.env.TRAINER_AUTH_TEST_DATABASE_URI ?? "postgres://mijnleerlijn:mijnleerlijn@localhost:5432/mijnleerlijn";
const TEST_DB_NAAM = "mijnleerlijn_trainer_wachtwoord_test";

function vervangDatabasenaam(uri: string, nieuweNaam: string): string {
  const url = new URL(uri);
  url.pathname = `/${nieuweNaam}`;
  return url.toString();
}

function draaiPayloadMigrate(databaseUri: string): void {
  execFileSync("npx", ["payload", "migrate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URI: databaseUri, PAYLOAD_MIGRATING: "true" },
    stdio: "pipe",
  });
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

const HUIDIG_WACHTWOORD = "WachtwoordDiagnoseTest#2026!!";
const TRAINER_EMAIL = "wachtwoord-echttest@mijnleerlijn.nl";

describe.skipIf(!beschikbaar)("POST /api/trainers/wachtwoord — ECHTE bcrypt-verificatie + -opslag (echte Postgres + echte Payload-boot)", () => {
  let adminPool: Pool;
  let payload: Payload | undefined;
  let getPayload: typeof import("payload").getPayload;
  let config: typeof import("@/payload.config").default;
  let POST: (typeof import("./route"))["POST"];
  let trainerId: number;
  let sessieToken: string;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: TEST_DATABASE_URI });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM};`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAAM};`);

    process.env.DATABASE_URI = scratchUri;
    process.env.PAYLOAD_MIGRATING = "true";

    ({ getPayload } = await import("payload"));
    config = (await import("@/payload.config")).default;
    ({ POST } = await import("./route"));

    draaiPayloadMigrate(scratchUri);
    payload = await getPayload({ config, key: "trainer-wachtwoord-diagnose" });

    const trainer = await payload.create({
      collection: "trainer-accounts",
      data: {
        name: "Wachtwoordtest Trainer",
        email: TRAINER_EMAIL,
        password: HUIDIG_WACHTWOORD,
        mondayTrainerboardId: "90000000001",
        mondayUitvoerderItemId: "90000000002",
        actief: true,
      },
      overrideAccess: true,
    });
    trainerId = trainer.id;

    // Echte login via Payload's eigen loginOperation — zelfde bewezen
    // bouwsteen als de trainingen/[id]-real-auth-test, hier de sessie
    // waarmee de PATCH/POST hieronder als "ingelogde trainer" wordt uitgevoerd.
    const login = await payload.login({ collection: "trainer-accounts", data: { email: TRAINER_EMAIL, password: HUIDIG_WACHTWOORD } });
    if (!login.token) throw new Error("Verwachtte een token na een geslaagde testlogin.");
    sessieToken = login.token;
  }, 120000);

  afterAll(async () => {
    const pool = (payload?.db as unknown as { pool?: { on: (event: string, cb: () => void) => void } })?.pool;
    pool?.on("error", () => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM} WITH (FORCE);`);
    await adminPool.end();

    if (oorspronkelijkeDatabaseUri === undefined) delete process.env.DATABASE_URI;
    else process.env.DATABASE_URI = oorspronkelijkeDatabaseUri;
    if (oorspronkelijkePayloadMigrating === undefined) delete process.env.PAYLOAD_MIGRATING;
    else process.env.PAYLOAD_MIGRATING = oorspronkelijkePayloadMigrating;
  }, 30000);

  function maakRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost:3000/api/trainers/wachtwoord", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `payload-token=${sessieToken}` },
      body: JSON.stringify(body),
    });
  }

  it("verkeerd huidig wachtwoord: 422, het bestaande wachtwoord blijft onveranderd geldig voor een echte login", async () => {
    const response = await POST(maakRequest({ huidigWachtwoord: "DitIsFout!", nieuwWachtwoord: "ZouNooitMoetenGelden1!", nieuwWachtwoordBevestiging: "ZouNooitMoetenGelden1!" }));
    expect(response.status).toBe(422);

    // Het oorspronkelijke wachtwoord werkt nog gewoon — geen wijziging opgeslagen.
    const login = await payload!.login({ collection: "trainer-accounts", data: { email: TRAINER_EMAIL, password: HUIDIG_WACHTWOORD } });
    expect(login.token).toBeTruthy();
  });

  it("correct huidig wachtwoord: 200, en daarna geldt ECHT het nieuwe wachtwoord — het oude werkt niet meer", async () => {
    const nieuwWachtwoord = "GeheelNieuwWachtwoord2026!!";
    const response = await POST(maakRequest({ huidigWachtwoord: HUIDIG_WACHTWOORD, nieuwWachtwoord, nieuwWachtwoordBevestiging: nieuwWachtwoord }));
    expect(response.status).toBe(200);

    // Nieuw wachtwoord werkt voor een ECHTE login (echte bcrypt-vergelijking, geen mock).
    const loginNieuw = await payload!.login({ collection: "trainer-accounts", data: { email: TRAINER_EMAIL, password: nieuwWachtwoord } });
    expect(loginNieuw.token).toBeTruthy();

    // Oud wachtwoord werkt daarna niet meer.
    await expect(payload!.login({ collection: "trainer-accounts", data: { email: TRAINER_EMAIL, password: HUIDIG_WACHTWOORD } })).rejects.toThrow();

    // Trainer-identiteit blijft exact dezelfde rij (geen nieuw account aangemaakt).
    const opnieuwOpgehaald = await payload!.findByID({ collection: "trainer-accounts", id: trainerId, overrideAccess: true });
    expect(opnieuwOpgehaald.email).toBe(TRAINER_EMAIL);
  });
});
