// Concurrencyfix (2026-08-24, bovenop de oorspronkelijke Ronde 3-oplevering)
// — DIT bestand is het bewijs dat de opdracht expliciet eiste: "Voeg
// concurrencytests toe met daadwerkelijk parallelle requests/aanroepen, niet
// twee sequentiële mocks." De bestaande, snellere lib/trainers/verslag.test.ts
// gebruikt lib/support/fake-payload.ts — een in-memory nabootsing die zelf
// geen echte rijvergrendeling kent en dus GEEN garantie tegen een echte
// databaseraceconditie kan bewijzen, ongeacht hoe overtuigend de assertions
// erin lijken. Hier draait daarom een ECHTE Postgres (scratch-database) +
// een ECHTE Payload-boot, en wordt bevestigVerslag() daadwerkelijk parallel
// aangeroepen via Promise.all()/losse, interleavende promises — de
// atomische claim (payload.db.drizzle.execute in lib/trainers/verslag.ts)
// moet het hier van ECHTE Postgres-rijvergrendeling hebben, niet van
// JavaScript's single-threaded run-to-completion-semantiek (die de fake-mock
// wél, per ongeluk, gratis meekrijgt).
//
// Zelfde bewezen scratch-database-patroon als app/api/trainers/trainingen/
// [id]/route.real-auth.test.ts (describe.skipIf zonder bereikbare Postgres,
// "payload migrate" via de echte CLI — payload.db.migrate() rechtstreeks
// vanuit vitest loopt stuk op Payload's dynamicImport()). Geen login/JWT
// nodig hier (in tegenstelling tot dat bestand): bevestigVerslag()/
// upsertConcept() nemen een AuthTrainer rechtstreeks als parameter, geen
// HTTP-/cookielaag ertussen — dus geen @vitest-environment node nodig (die
// was daar specifiek voor payload.login() se jose/jsdom-realmmismatch, hier
// nooit aangeroepen).
//
// Alleen de Monday-transportlaag (@/lib/sales/monday-client) en de externe
// Monday-resolutie (./monday-links se haalTrainingVoorMutatie) zijn gemockt
// — exact zoals lib/trainers/verslag.test.ts. Alles wat met "training-
// verslagen" zelf te maken heeft (upsertConcept/bevestigVerslag/
// haalVerslagVoorTraining, en dus ook claimUpdateSlot) draait ECHT, tegen de
// scratch-Postgres.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import type { Payload } from "payload";
import { haalTrainingVoorMutatie } from "./monday-links";
import { haalUpdatesVoorItem, maakUpdate, leesKolomWaarden, wijzigKolomWaarde, wijzigKolomWaardeJson, haalItemMetKolomWaarden } from "@/lib/sales/monday-client";
import { KOLOM_VOOR } from "./monday-columns";
import type { AuthTrainer } from "./auth";
import type { TrainingVoorMutatie } from "./monday-links";

vi.mock("./monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("./monday-links")>();
  return { ...echt, haalTrainingVoorMutatie: vi.fn() };
});
vi.mock("@/lib/sales/monday-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sales/monday-client")>();
  return {
    ...echt,
    haalUpdatesVoorItem: vi.fn(),
    maakUpdate: vi.fn(),
    leesKolomWaarden: vi.fn(),
    wijzigKolomWaarde: vi.fn(),
    wijzigKolomWaardeJson: vi.fn(),
    haalItemMetKolomWaarden: vi.fn(),
  };
});

const mockHaalTrainingVoorMutatie = vi.mocked(haalTrainingVoorMutatie);
const mockHaalUpdatesVoorItem = vi.mocked(haalUpdatesVoorItem);
const mockMaakUpdate = vi.mocked(maakUpdate);
const mockLeesKolomWaarden = vi.mocked(leesKolomWaarden);
const mockWijzigKolomWaarde = vi.mocked(wijzigKolomWaarde);
const mockWijzigKolomWaardeJson = vi.mocked(wijzigKolomWaardeJson);
const mockHaalItemMetKolomWaarden = vi.mocked(haalItemMetKolomWaarden);

const TEST_DATABASE_URI = process.env.VERSLAG_CONCURRENCY_TEST_DATABASE_URI ?? "postgres://mijnleerlijn:mijnleerlijn@localhost:5432/mijnleerlijn";
const TEST_DB_NAAM = "mijnleerlijn_verslag_concurrency_test";

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

/** Elke test gebruikt zijn eigen mondayTrainingId-reeks — geen gedeelde/opgeruimde staat nodig tussen tests. */
let volgendTrainingIdSuffix = 0;
function nieuweTrainingId(): string {
  volgendTrainingIdSuffix += 1;
  return `92${String(volgendTrainingIdSuffix).padStart(9, "0")}`;
}

/**
 * Genereert een consistente, geldige TrainingVoorMutatie voor WELKE
 * trainingId dan ook — laat mockHaalTrainingVoorMutatie dus voor de volle
 * breedte van dit bestand ongewijzigd staan, zonder per-test herconfiguratie.
 * ruweStatusTekst "Gepland" is bewust gelijk aan de leeswaarde die de
 * leesKolomWaarden-mock hieronder voor de statuskolom teruggeeft — anders
 * zou de afrondingsstap (werkTrainingBij) een conflict zien i.p.v. te
 * schrijven, wat voor de meeste tests hier van het eigenlijke onderwerp zou
 * afleiden.
 */
function trainingVoorMutatie(trainingId: string): TrainingVoorMutatie {
  return {
    training: {
      id: trainingId,
      naam: "Training",
      status: "gepland",
      ruweStatusTekst: "Gepland",
      datum: "2026-08-20",
      logboekIngevuld: false,
      trainerboardItemId: `tb-${trainingId}`,
      bron: "mijnleerlijn",
    },
    schoolId: `school-${trainingId}`,
    schoolNaam: "Testschool",
  };
}

describe.skipIf(!beschikbaar)("bevestigVerslag — ECHTE concurrency tegen echte Postgres (geen fake-mock)", () => {
  let payload: Payload;
  let payloadTweedeVerbinding: Payload;
  let getPayload: typeof import("payload").getPayload;
  let config: typeof import("@/payload.config").default;
  let bevestigVerslag: typeof import("./verslag").bevestigVerslag;
  let upsertConcept: typeof import("./verslag").upsertConcept;
  let haalVerslagVoorTraining: typeof import("./verslag").haalVerslagVoorTraining;
  let adminPool: Pool;
  let volgendTrainerSuffix = 0;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: TEST_DATABASE_URI });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM};`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAAM};`);

    process.env.DATABASE_URI = scratchUri;
    process.env.PAYLOAD_MIGRATING = "true";

    ({ getPayload } = await import("payload"));
    config = (await import("@/payload.config")).default;
    ({ bevestigVerslag, upsertConcept, haalVerslagVoorTraining } = await import("./verslag"));

    draaiPayloadMigrate(scratchUri);
    // Twee VOLLEDIG gescheiden Payload-instanties (verschillende `key`,
    // dus verschillende onderliggende pg.Pool/verbinding) tegen DEZELFDE
    // scratch-database — de "twee browser-tabs"/"geen in-memory mutex"-test
    // hieronder gebruikt bewust de TWEEDE, om uit te sluiten dat correctheid
    // ergens toevallig leunt op gedeeld in-process JS-geheugen (bv. een
    // module-level Map/mutex) in plaats van op de database zelf.
    payload = await getPayload({ config, key: "verslag-concurrency-1" });
    payloadTweedeVerbinding = await getPayload({ config, key: "verslag-concurrency-2" });
  }, 120000);

  afterAll(async () => {
    const pool = (payload?.db as unknown as { pool?: { on: (event: string, cb: () => void) => void } })?.pool;
    pool?.on("error", () => {});
    const pool2 = (payloadTweedeVerbinding?.db as unknown as { pool?: { on: (event: string, cb: () => void) => void } })?.pool;
    pool2?.on("error", () => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM} WITH (FORCE);`);
    await adminPool.end();

    if (oorspronkelijkeDatabaseUri === undefined) delete process.env.DATABASE_URI;
    else process.env.DATABASE_URI = oorspronkelijkeDatabaseUri;
    if (oorspronkelijkePayloadMigrating === undefined) delete process.env.PAYLOAD_MIGRATING;
    else process.env.PAYLOAD_MIGRATING = oorspronkelijkePayloadMigrating;
  }, 30000);

  beforeEach(() => {
    vi.stubEnv("TRAINER_MONDAY_VERSLAG_ENABLED", "true");
    vi.stubEnv("TRAINER_MONDAY_WRITEBACK_ENABLED", "true");
    mockHaalTrainingVoorMutatie.mockImplementation(async (_trainer: AuthTrainer, trainingId: string) => trainingVoorMutatie(trainingId));
    mockHaalUpdatesVoorItem.mockReset().mockResolvedValue([]);
    mockMaakUpdate.mockReset().mockImplementation(async () => ({ id: `monday-update-${Math.random().toString(36).slice(2)}` }));
    mockLeesKolomWaarden.mockReset().mockImplementation(async (_itemId: string, columnIds: string[]) =>
      columnIds.map((id) => ({ id, text: id === KOLOM_VOOR.centraal.status ? "Gepland" : null, value: null }))
    );
    mockWijzigKolomWaarde.mockReset().mockResolvedValue(undefined);
    mockWijzigKolomWaardeJson.mockReset().mockResolvedValue(undefined);
    // Root-cause-fix (2026-08-20, writeback.ts): checkbox-kolommen gaan via
    // change_column_value (wijzigKolomWaardeJson) en vereisen daarna een
    // herlees-bevestiging — standaard-gelukkig-pad hier, zelfde patroon als
    // lib/trainers/verslag.test.ts.
    mockHaalItemMetKolomWaarden.mockReset().mockImplementation(async (itemId: string, columnIds: string[]) => ({
      id: itemId,
      name: "x",
      column_values: [{ id: columnIds[0]!, text: "v", value: JSON.stringify({ checked: "true" }) }],
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Elke test krijgt zijn eigen trainer-rij — nooit gedeeld, zodat ownership/claim-tests elkaar nooit kunnen beïnvloeden. */
  async function maakTrainerRow(p: Payload, naam: string): Promise<AuthTrainer> {
    volgendTrainerSuffix += 1;
    const suffix = volgendTrainerSuffix;
    const rij = await p.create({
      collection: "trainer-accounts",
      data: {
        name: naam,
        email: `concurrency-trainer-${suffix}@mijnleerlijn.nl`,
        password: "ConcurrencyTest#2026!!",
        mondayTrainerboardId: `81${String(suffix).padStart(9, "0")}`,
        mondayUitvoerderItemId: `71${String(suffix).padStart(9, "0")}`,
        actief: true,
      },
      overrideAccess: true,
    });
    return {
      id: rij.id as number,
      name: naam,
      email: rij.email as string,
      mondayTrainerboardId: rij.mondayTrainerboardId as string,
      mondayUitvoerderItemId: rij.mondayUitvoerderItemId as string,
      actief: true,
    };
  }

  async function maakConceptRij(p: Payload, trainer: AuthTrainer, trainingId: string) {
    const uitkomst = await upsertConcept(p, trainer, trainingId, { trainerInvoer: "Notities" });
    if (uitkomst.soort !== "ok") throw new Error("setup mislukt: concept aanmaken faalde");
    return uitkomst.verslag;
  }


  // Upsell-ronde (2026-09-02, spec §B7) — bevestigVerslag schrijft niet
  // langer een Monday-Update voor het verslag zelf (die stap is uit de
  // functie verwijderd, zie de doc-comment daar). De concurrency-garantie
  // die dit bestand moet bewijzen is dus verschoven: niet langer "de twee
  // Update-writes zijn race-safe", maar (a) de atomische stap-3-claim op
  // definitieveTekst/status is nog altijd race-safe tegen ECHTE Postgres, en
  // (b) maakUpdate wordt door bevestigVerslag NOOIT meer aangeroepen, ook
  // niet onder gelijktijdige belasting. schrijfVerslagUpdateIdempotent/
  // claimUpdateSlot zelf blijven ongewijzigd or (bewust EXPORTED, zie
  // verslag.ts) maar hebben vanuit bevestigVerslag geen aanroeper meer — hun
  // eigen concurrency-eigenschap is dus geen onderwerp meer van DEZE suite.
  it("1. twee écht gelijktijdige eerste 'Definitief opslaan'-requests -> precies één tekst wint de atomische stap-3-claim, beide callers zien daarna dezelfde definitieve tekst en status", async () => {
    const trainingId = nieuweTrainingId();
    const trainer = await maakTrainerRow(payload, "Concurrency Trainer 1");
    await maakConceptRij(payload, trainer, trainingId);

    const [eerste, tweede] = await Promise.all([
      bevestigVerslag(payload, trainer, trainingId, "Tekst van poging A"),
      bevestigVerslag(payload, trainer, trainingId, "Tekst van poging B"),
    ]);

    expect(eerste.soort).toBe("resultaat");
    expect(tweede.soort).toBe("resultaat");
    if (eerste.soort === "resultaat" && tweede.soort === "resultaat") {
      expect(eerste.verslag.definitieveTekst).toBe(tweede.verslag.definitieveTekst);
      expect(["Tekst van poging A", "Tekst van poging B"]).toContain(eerste.verslag.definitieveTekst);
    }

    const finaleRij = await haalVerslagVoorTraining(payload, trainer, trainingId);
    expect(finaleRij?.status).toBe("voltooid");
    expect(finaleRij?.trainingBron).toBe("mijnleerlijn");
    expect(mockMaakUpdate).not.toHaveBeenCalled();
  });

  it("2. twee browser-tabs (twee volledig gescheiden Payload/DB-verbindingen, GEEN gedeeld in-memory object) -> zelfde garantie, bewijst dat correctheid uit de database komt, niet uit een in-process mutex", async () => {
    const trainingId = nieuweTrainingId();
    const trainer = await maakTrainerRow(payload, "Concurrency Trainer 2");
    await maakConceptRij(payload, trainer, trainingId);

    // trainer bestaat als rij in de database, dus ook zichtbaar/bruikbaar
    // via de TWEEDE, volledig aparte Payload-instantie/verbinding.
    const [tabEen, tabTwee] = await Promise.all([
      bevestigVerslag(payload, trainer, trainingId, "Tekst uit tabblad 1"),
      bevestigVerslag(payloadTweedeVerbinding, trainer, trainingId, "Tekst uit tabblad 2"),
    ]);

    expect(tabEen.soort).toBe("resultaat");
    expect(tabTwee.soort).toBe("resultaat");
    if (tabEen.soort === "resultaat" && tabTwee.soort === "resultaat") {
      expect(tabEen.verslag.definitieveTekst).toBe(tabTwee.verslag.definitieveTekst);
    }
  });

  it("3. bevestigVerslag roept nooit maakUpdate aan — ook niet onder gelijktijdige belasting, ook niet bij een retry ná een geslaagde bevestiging (spec §B7: geen automatische volledige verslag-writeback meer naar Monday)", async () => {
    const trainingId = nieuweTrainingId();
    const trainer = await maakTrainerRow(payload, "Concurrency Trainer 3");
    await maakConceptRij(payload, trainer, trainingId);

    await Promise.all([bevestigVerslag(payload, trainer, trainingId, "Tekst A"), bevestigVerslag(payload, trainer, trainingId, "Tekst B")]);
    expect(mockMaakUpdate).not.toHaveBeenCalled();

    await bevestigVerslag(payload, trainer, trainingId, "Genegeerde retry-tekst");
    expect(mockMaakUpdate).not.toHaveBeenCalled();
  });

  it("4. status gaat pas naar 'voltooid' zodra de ML-afronding (werkTrainingBij: status/logboek-kolommen) slaagt; blijft 'bevestigd' zolang die mislukt, ook bij gelijktijdige retries — en nooit een Update-schrijving erbij", async () => {
    const trainingId = nieuweTrainingId();
    const trainer = await maakTrainerRow(payload, "Concurrency Trainer 4");
    await maakConceptRij(payload, trainer, trainingId);

    mockWijzigKolomWaarde.mockRejectedValue(new Error("Monday tijdelijk onbereikbaar"));
    const eerste = await bevestigVerslag(payload, trainer, trainingId, "Tekst");
    expect(eerste.soort).toBe("resultaat");
    if (eerste.soort === "resultaat") {
      expect(eerste.verslag.status).toBe("bevestigd"); // nooit "voltooid" zolang afronding mislukt
    }

    mockWijzigKolomWaarde.mockReset().mockResolvedValue(undefined); // afronding lukt nu wél
    const [retryA, retryB] = await Promise.all([bevestigVerslag(payload, trainer, trainingId), bevestigVerslag(payload, trainer, trainingId)]);
    expect(retryA.soort).toBe("resultaat");
    expect(retryB.soort).toBe("resultaat");

    const finaleRij = await haalVerslagVoorTraining(payload, trainer, trainingId);
    expect(finaleRij?.status).toBe("voltooid");
    expect(mockMaakUpdate).not.toHaveBeenCalled();
  });

  it("5. twee verschillende trainers, gelijktijdig, elk hun eigen verslag -> volledig onafhankelijk, geen kruisbestuiving, geen onderlinge blokkade (geen globale lock)", async () => {
    const trainingIdA = nieuweTrainingId();
    const trainingIdB = nieuweTrainingId();
    const trainerA = await maakTrainerRow(payload, "Trainer A Concurrency");
    const trainerB = await maakTrainerRow(payload, "Trainer B Concurrency");
    const rijA = await maakConceptRij(payload, trainerA, trainingIdA);
    const rijB = await maakConceptRij(payload, trainerB, trainingIdB);

    const [uitkomstA, uitkomstB] = await Promise.all([
      bevestigVerslag(payload, trainerA, trainingIdA, "Tekst van trainer A"),
      bevestigVerslag(payload, trainerB, trainingIdB, "Tekst van trainer B"),
    ]);

    expect(uitkomstA.soort).toBe("resultaat");
    expect(uitkomstB.soort).toBe("resultaat");

    // Trainer B kan trainer A se rij nooit lezen/claimen, ook niet indirect.
    const finaleRijA = await haalVerslagVoorTraining(payload, trainerA, trainingIdA);
    const finaleRijB = await haalVerslagVoorTraining(payload, trainerB, trainingIdB);
    expect(finaleRijA?.id).toBe(rijA.id);
    expect(finaleRijB?.id).toBe(rijB.id);
    expect(finaleRijA?.definitieveTekst).toBe("Tekst van trainer A");
    expect(finaleRijB?.definitieveTekst).toBe("Tekst van trainer B");

    // Trainer B kan trainer A se training-ID niet claimen, ook al zou hij hem kennen.
    const kruispoging = await bevestigVerslag(payload, trainerB, trainingIdA, "Poging door trainer B");
    expect(kruispoging.soort).toBe("niet_gevonden");
  });
});
