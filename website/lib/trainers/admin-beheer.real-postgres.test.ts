// @vitest-environment node
//
// (zie verslag.concurrency.real-postgres.test.ts se toelichting: payload.
// login() se JWT-ondertekening (jose) botst onder de standaard jsdom-
// omgeving op een Uint8Array-realmmismatch — exact hetzelfde patroon als
// app/api/trainers/trainingen/[id]/route.real-auth.test.ts, hier
// overgenomen omdat test 4/5 hieronder een ECHTE payload.login() nodig
// hebben, geen kant-en-klare AuthTrainer.)
//
// Herverificatieronde (gevraagd na oplevering) — dit bestand bewijst tegen
// een ECHTE Postgres (scratch-database, zelfde bewezen patroon als
// verslag.concurrency.real-postgres.test.ts — describe.skipIf zonder
// bereikbare Postgres, "payload migrate" via de echte CLI) drie expliciet
// gevraagde garanties die de bestaande fake-payload-tests wél al beweren,
// maar die hier tegen echte FK-constraints/echte JWT-sessies nog een keer
// hard bevestigd worden, zonder aannames:
//
// 1. wijzigVerslagAlsAdmin raakt GEEN enkel Monday-writebackveld aan — niet
//    "de mock retourneert het ongewijzigd", maar: de rij in de echte
//    database heeft die velden na de aanroep nog letterlijk dezelfde waarde.
// 2. verwijderVerslagAlsAdmin: de gekoppelde telefonie-oproeprij (transcriptie-/
//    call-historie) blijft na verwijdering van het verslag daadwerkelijk
//    bestaan, met verslag=null — dit is de ECHTE ON DELETE SET NULL-FK die
//    vuurt (migratie 20260825_090000_telefonie_v1.ts), niet een aanname
//    gebaseerd op het lezen van migratie-SQL.
// 3. verwijderTrainerAccountAlsAdmin blokkeert daadwerkelijk (geen rij
//    verdwijnt) zodra er gekoppelde historie is, en zetTrainerActiefStatus
//    maakt een AL EERDER UITGEGEVEN, geldig JWT (niet een nieuwe inlogpoging)
//    vanaf dat moment ongeldig via verifyTrainerSessionCookie — bewijst dat
//    een trainer niet "geauthenticeerd blijft" na deactiveren, ook niet met
//    een cookie die al in de browser lag.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import type { Payload } from "payload";

const TEST_DATABASE_URI = process.env.ADMIN_BEHEER_TEST_DATABASE_URI ?? "postgres://mijnleerlijn:mijnleerlijn@localhost:5432/mijnleerlijn";
const TEST_DB_NAAM = "mijnleerlijn_admin_beheer_verificatie_test";
const WACHTWOORD = "VerificatieTest#2026!!";

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

describe.skipIf(!beschikbaar)("Admin verslag-/traineraccountbeheer — verificatie tegen ECHTE Postgres (geen fake-mock)", () => {
  let payload: Payload;
  let adminPool: Pool;
  let wijzigVerslagAlsAdmin: typeof import("./verslag").wijzigVerslagAlsAdmin;
  let verwijderVerslagAlsAdmin: typeof import("./verslag").verwijderVerslagAlsAdmin;
  let verwijderTrainerAccountAlsAdmin: typeof import("./trainer-account").verwijderTrainerAccountAlsAdmin;
  let zetTrainerActiefStatus: typeof import("./trainer-account").zetTrainerActiefStatus;
  let verifyTrainerSessionCookie: typeof import("./auth").verifyTrainerSessionCookie;
  let volgendSuffix = 0;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: TEST_DATABASE_URI });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM};`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAAM};`);

    process.env.DATABASE_URI = scratchUri;
    process.env.PAYLOAD_MIGRATING = "true";

    const { getPayload } = await import("payload");
    const config = (await import("@/payload.config")).default;
    ({ wijzigVerslagAlsAdmin, verwijderVerslagAlsAdmin } = await import("./verslag"));
    ({ verwijderTrainerAccountAlsAdmin, zetTrainerActiefStatus } = await import("./trainer-account"));
    ({ verifyTrainerSessionCookie } = await import("./auth"));

    draaiPayloadMigrate(scratchUri);
    payload = await getPayload({ config, key: "admin-beheer-verificatie" });
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

  function volgendeSuffix(): number {
    volgendSuffix += 1;
    return volgendSuffix;
  }

  async function maakTrainer(overrides: { actief?: boolean; wachtwoord?: string } = {}) {
    const suffix = volgendeSuffix();
    return payload.create({
      collection: "trainer-accounts",
      data: {
        name: `Verificatietrainer ${suffix}`,
        email: `verificatie-trainer-${suffix}@mijnleerlijn.nl`,
        password: overrides.wachtwoord ?? WACHTWOORD,
        mondayTrainerboardId: `91${String(suffix).padStart(9, "0")}`,
        mondayUitvoerderItemId: `92${String(suffix).padStart(9, "0")}`,
        actief: overrides.actief ?? true,
      },
      overrideAccess: true,
    });
  }

  async function maakVoltooidVerslag(trainerId: number) {
    const suffix = volgendeSuffix();
    return payload.create({
      collection: "training-verslagen",
      data: {
        trainer: trainerId,
        bron: "portal",
        trainingBron: "mijnleerlijn",
        mondayTrainingId: `t-${suffix}`,
        mondaySchoolId: `s-${suffix}`,
        mondayTrainerboardItemId: `tb-${suffix}`,
        schoolNaam: "Testschool",
        trainingNaam: "Testtraining",
        trainerInvoer: "Oorspronkelijke trainerinvoer.",
        definitieveTekst: "Oorspronkelijke tekst.",
        aiGegenereerd: true,
        status: "voltooid",
        trainingUpdateStatus: "geschreven",
        trainingUpdateMondayId: "monday-update-training-abc",
        schoolUpdateStatus: "geschreven",
        schoolUpdateMondayId: "monday-update-school-def",
        afrondingResultaat: { statusGeschreven: true, logboekGeschreven: true },
        bevestigdOp: "2026-08-20T10:00:00.000Z",
        bevestigdDoorTrainerNaam: "Oorspronkelijke Trainer",
      },
      overrideAccess: true,
    });
  }

  it("1. wijzigVerslagAlsAdmin wijzigt in de ECHTE database alleen definitieveTekst — elk Monday-writebackveld staat er, byte-identiek, nog exact zo bij", async () => {
    const trainer = await maakTrainer();
    const verslag = await maakVoltooidVerslag(trainer.id as number);

    const uitkomst = await wijzigVerslagAlsAdmin(payload, verslag.id as number, { definitieveTekst: "Door admin gecorrigeerde tekst." });
    expect(uitkomst.soort).toBe("ok");

    const bijgewerkt = await payload.findByID({ collection: "training-verslagen", id: verslag.id as number, overrideAccess: true, depth: 0 });
    expect(bijgewerkt.definitieveTekst).toBe("Door admin gecorrigeerde tekst.");

    // Alles wat een Monday-write zou (kunnen) triggeren of verraden, exact ongewijzigd:
    expect(bijgewerkt.status).toBe("voltooid");
    expect(bijgewerkt.trainingUpdateStatus).toBe("geschreven");
    expect(bijgewerkt.trainingUpdateMondayId).toBe("monday-update-training-abc");
    expect(bijgewerkt.schoolUpdateStatus).toBe("geschreven");
    expect(bijgewerkt.schoolUpdateMondayId).toBe("monday-update-school-def");
    expect(bijgewerkt.afrondingResultaat).toEqual({ statusGeschreven: true, logboekGeschreven: true });
    expect(bijgewerkt.bevestigdOp).toBe("2026-08-20T10:00:00.000Z");
    expect(bijgewerkt.bevestigdDoorTrainerNaam).toBe("Oorspronkelijke Trainer");
    // En ook de overige identiteitsvelden — nooit stilzwijgend school/trainer/training wijzigen:
    expect(bijgewerkt.trainer).toBe(trainer.id); // depth: 0 -> kale FK-ID, geen gepopuleerd object
    expect(bijgewerkt.schoolNaam).toBe("Testschool");
    expect(bijgewerkt.trainingNaam).toBe("Testtraining");
    expect(bijgewerkt.bron).toBe("portal");
    expect(bijgewerkt.trainerInvoer).toBe("Oorspronkelijke trainerinvoer.");
  });

  it("2. verwijderVerslagAlsAdmin: de gekoppelde telefonie-oproeprij (transcriptie-/callhistorie) blijft echt bestaan, met verslag op null — de echte ON DELETE SET NULL-FK", async () => {
    const trainer = await maakTrainer();
    const verslag = await maakVoltooidVerslag(trainer.id as number);
    const oproep = await payload.create({
      collection: "trainer-telefonie-oproepen",
      data: {
        provider: "telnyx",
        providerCallId: `call-${volgendeSuffix()}`,
        trainer: trainer.id as number,
        status: "concept_klaar",
        ontvangenOp: "2026-08-20T09:55:00.000Z",
        transcriptiePogingen: 1,
        transcriptieLengte: 812,
        verslag: verslag.id as number,
      },
      overrideAccess: true,
    });

    const uitkomst = await verwijderVerslagAlsAdmin(payload, verslag.id as number);
    expect(uitkomst).toBe("verwijderd");

    await expect(payload.findByID({ collection: "training-verslagen", id: verslag.id as number, overrideAccess: true, depth: 0 })).rejects.toThrow();

    const oproepNa = await payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproep.id as number, overrideAccess: true, depth: 0 });
    expect(oproepNa).toBeTruthy();
    expect(oproepNa.verslag ?? null).toBeNull();
    // De rest van de call-/transcriptiehistorie blijft ongewijzigd — geen blinde cascade:
    expect(oproepNa.status).toBe("concept_klaar");
    expect(oproepNa.transcriptiePogingen).toBe(1);
    expect(oproepNa.transcriptieLengte).toBe(812);
  });

  it("3. verwijderTrainerAccountAlsAdmin: een trainer met een gekoppeld verslag wordt écht niet verwijderd — de rij bestaat na de aanroep nog gewoon", async () => {
    const trainer = await maakTrainer();
    await maakVoltooidVerslag(trainer.id as number);

    const uitkomst = await verwijderTrainerAccountAlsAdmin(payload, trainer.id as number);
    if (uitkomst.soort !== "heeft_relaties") throw new Error(`verwachtte heeft_relaties, kreeg ${uitkomst.soort}`);
    expect(uitkomst.relaties).toEqual([{ label: "trainingsverslagen", aantal: 1 }]);

    const trainerNa = await payload.findByID({ collection: "trainer-accounts", id: trainer.id as number, overrideAccess: true, depth: 0 });
    expect(trainerNa).toBeTruthy();
    expect(trainerNa.name).toBe(trainer.name);
  });

  it("4. zetTrainerActiefStatus(false) maakt een AL EERDER uitgegeven, geldig sessietoken direct ongeldig — de trainer blijft niet geauthenticeerd, ook niet met een cookie die al in de browser lag", async () => {
    const trainer = await maakTrainer({ wachtwoord: WACHTWOORD });
    const login = await payload.login({ collection: "trainer-accounts", data: { email: trainer.email as string, password: WACHTWOORD } });
    if (!login.token) throw new Error("Verwachtte een token na een geslaagde testlogin.");
    const token = login.token;

    // Vóór deactiveren: hetzelfde token werkt gewoon (nulmeting).
    const voor = await verifyTrainerSessionCookie(payload, token);
    expect(voor.trainer?.id).toBe(trainer.id);

    const uitkomst = await zetTrainerActiefStatus(payload, trainer.id as number, false);
    expect(uitkomst).toEqual({ soort: "ok", actief: false });

    // Na deactiveren: LETTERLIJK HETZELFDE token (geen nieuwe inlogpoging, geen nieuw JWT) wordt geweigerd.
    const na = await verifyTrainerSessionCookie(payload, token);
    expect(na.trainer).toBeNull();
    expect(na.reden).toBe("trainer-inactief");

    // En een geheel NIEUWE inlogpoging met het (nog steeds correcte) wachtwoord slaagt ook niet meer.
    await expect(payload.login({ collection: "trainer-accounts", data: { email: trainer.email as string, password: WACHTWOORD } })).rejects.toThrow();
  });

  it("5. zetTrainerActiefStatus(true) (heractiveren) geeft een eerder geweigerde trainer weer toegang, met hetzelfde wachtwoord", async () => {
    const trainer = await maakTrainer({ wachtwoord: WACHTWOORD, actief: false });

    await expect(payload.login({ collection: "trainer-accounts", data: { email: trainer.email as string, password: WACHTWOORD } })).rejects.toThrow();

    const uitkomst = await zetTrainerActiefStatus(payload, trainer.id as number, true);
    expect(uitkomst).toEqual({ soort: "ok", actief: true });

    const login = await payload.login({ collection: "trainer-accounts", data: { email: trainer.email as string, password: WACHTWOORD } });
    expect(login.token).toBeTruthy();
    const controle = await verifyTrainerSessionCookie(payload, login.token);
    expect(controle.trainer?.id).toBe(trainer.id);
  });
});
