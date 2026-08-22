// Live production-bug (2026-08-25, gevonden via een Vercel-functielog bij een
// echte call.recording.saved-webhook): "syntax error at or near RETURNING".
// Root cause: een ";" ná de WHERE-clausule in claimOpnameVerwerking (en,
// hetzelfde patroon, in claimTranscriptieRetry — hieronder ook gedekt) sloot
// het UPDATE-statement af vóórdat RETURNING werd bereikt. Bij ELKE
// binnenkomende opname faalde de claim dus met een Postgres-syntaxfout ->
// nooit een geclaimde rij -> nooit een concept: exact het gerapporteerde
// symptoom ("ontbrekend telefonieconcept").
//
// De bestaande lib/trainers/telefonie/oproep-state.test.ts draait tegen
// lib/support/fake-payload.ts — die fake herkent een raw-SQL-aanroep aan een
// substring-match op de queryTEKST zelf (bv.
// tekst.includes("SET status = 'opname_ontvangen'")) en simuleert de
// statustransitie in JS, zonder de SQL-string ooit door een echte
// SQL-parser te halen. Een syntaxfout in de raw SQL is voor die fake dus
// structureel onzichtbaar — precies waarom dit ongemerkt kon blijven tot de
// live test. Dit bestand draait daarom, zelfde bewezen
// scratch-database-patroon als lib/trainers/verslag.concurrency.real-postgres.test.ts
// (describe.skipIf zonder bereikbare Postgres, "payload migrate" via de
// echte CLI), tegen een ECHTE Postgres: als de ";"-fout ooit terugkeert (bv.
// bij een toekomstige wijziging aan deze queries) gooit elke aanroep
// hieronder een echte "syntax error at or near RETURNING" — een assertion
// tegen een fake kan dat nooit detecteren, een awaited throw tegen een echte
// database wel.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import type { AuthTrainer } from "../auth";
import type { TelefonieProvider, InkomendeCallGegevens, GatherResultaat, OpnameStatusGegevens } from "./provider";
import type { TrainingMetSchool, TrainingVoorMutatie, SchoolDetail } from "../monday-links";

// Alleen de externe LEESrand gemockt (Monday-leeslaag + AI-client) — zelfde
// afbakening als lib/trainers/telefonie/gesprek.test.ts. Monday-SCHRIJF-
// functies (@/lib/sales/monday-client) blijven bewust ongemockt: die worden
// door dit pad structureel nooit aangeroepen (spec §29, al bewezen in
// gesprek.test.ts se architectuurtest) — geen reden om dat bewijs hier te
// dupliceren.
vi.mock("../monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("../monday-links")>();
  return { ...echt, haalTrainingVoorMutatie: vi.fn(), haalRecenteTrainingenVoorTelefonie: vi.fn(), haalSchoolDetail: vi.fn() };
});
vi.mock("@/services/ai-client", () => ({ generateStructuredOutput: vi.fn(), transcribeAudio: vi.fn() }));

import { haalTrainingVoorMutatie, haalRecenteTrainingenVoorTelefonie, haalSchoolDetail } from "../monday-links";
import { generateStructuredOutput, transcribeAudio } from "@/services/ai-client";

const mockHaalTrainingVoorMutatie = vi.mocked(haalTrainingVoorMutatie);
const mockHaalRecenteTrainingen = vi.mocked(haalRecenteTrainingenVoorTelefonie);
const mockHaalSchoolDetail = vi.mocked(haalSchoolDetail);
const mockGenerateStructuredOutput = vi.mocked(generateStructuredOutput);
const mockTranscribeAudio = vi.mocked(transcribeAudio);

const TEST_DATABASE_URI = process.env.TELEFONIE_REAL_POSTGRES_TEST_DATABASE_URI ?? "postgres://mijnleerlijn:mijnleerlijn@localhost:5432/mijnleerlijn";
const TEST_DB_NAAM = "mijnleerlijn_telefonie_real_postgres_test";

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

function training(overrides: Partial<TrainingMetSchool> = {}): TrainingMetSchool {
  return {
    id: "111",
    naam: "Training",
    status: "gepland",
    ruweStatusTekst: "Gepland",
    datum: "2026-08-20",
    logboekIngevuld: false,
    trainerboardItemId: "222",
    schoolId: "500",
    schoolNaam: "Testschool",
    ...overrides,
  };
}

function gevondenTrainingVoorMutatie(overrides: Partial<TrainingMetSchool> = {}): TrainingVoorMutatie {
  const t = training(overrides);
  return {
    training: { id: t.id, naam: t.naam, status: t.status, ruweStatusTekst: t.ruweStatusTekst, datum: t.datum, logboekIngevuld: t.logboekIngevuld, trainerboardItemId: t.trainerboardItemId },
    schoolId: t.schoolId,
    schoolNaam: t.schoolNaam,
  };
}

function maakSchoolDetail(overrides: Partial<SchoolDetail> = {}): SchoolDetail {
  return {
    id: "500",
    naam: "Testschool",
    onderwijstype: null,
    locatie: null,
    implementatiefase: null,
    contactpersoonNaam: null,
    contactpersoonBetrouwbaar: false,
    bron: "trainer-relatie",
    trainingen: { verslag_nog_invullen: [], vandaag: [], komend: [], open: [], gedaan: [], geannuleerd: [] },
    logboek: [],
    ...overrides,
  };
}

function maakFakeProvider(overrides: Partial<TelefonieProvider> = {}): TelefonieProvider {
  return {
    naam: "fake",
    verifieerWebhookSignature: () => true,
    ontleedInkomendeCall: vi.fn(() => ({ providerCallId: "CA1", vanNummerRuw: "+31612345678", nummerVerborgen: false }) as InkomendeCallGegevens),
    ontleedGatherResultaat: vi.fn(() => ({ cijfers: null, clientState: null }) as GatherResultaat),
    ontleedOpnameStatus: vi.fn(
      () =>
        ({
          providerCallId: "CA1",
          providerRecordingId: "RE1",
          status: "voltooid",
          duurSeconden: 60,
          ophaalReferentie: "https://provider.example/recordings/RE1",
          clientState: null,
        }) as OpnameStatusGegevens
    ),
    ontleedSpreekAfgerond: vi.fn(() => ({ providerCallId: "CA1", clientState: null })),
    voerVoiceInstructiesUit: vi.fn().mockResolvedValue({ status: 200, contentType: null, body: null }),
    beantwoordOproep: vi.fn().mockResolvedValue(undefined),
    haalOpnameOp: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    verwijderOpname: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe.skipIf(!beschikbaar)("telefonie/oproep-state — ECHTE Postgres (reproduceert de live call.recording.saved-syntaxfout, 2026-08-25)", () => {
  let payload: Payload;
  let adminPool: Pool;
  let maakOfHaalOproep: typeof import("./oproep-state").maakOfHaalOproep;
  let zetTrainerHerkend: typeof import("./oproep-state").zetTrainerHerkend;
  let zetTrainingGekozen: typeof import("./oproep-state").zetTrainingGekozen;
  let zetOpnameVerwacht: typeof import("./oproep-state").zetOpnameVerwacht;
  let claimOpnameVerwerking: typeof import("./oproep-state").claimOpnameVerwerking;
  let zetTranscriptieBezig: typeof import("./oproep-state").zetTranscriptieBezig;
  let zetTranscriptieHerstelbaarMislukt: typeof import("./oproep-state").zetTranscriptieHerstelbaarMislukt;
  let claimTranscriptieRetry: typeof import("./oproep-state").claimTranscriptieRetry;
  let verwerkInkomendeCall: typeof import("./gesprek").verwerkInkomendeCall;
  let verwerkTrainingKeuze: typeof import("./gesprek").verwerkTrainingKeuze;
  let verwerkOpnameStatus: typeof import("./gesprek").verwerkOpnameStatus;
  let volgendTrainerSuffix = 0;
  let volgendCallSuffix = 0;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: TEST_DATABASE_URI });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAAM};`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAAM};`);

    process.env.DATABASE_URI = scratchUri;
    process.env.PAYLOAD_MIGRATING = "true";

    const { getPayload } = await import("payload");
    const config = (await import("@/payload.config")).default;
    ({ maakOfHaalOproep, zetTrainerHerkend, zetTrainingGekozen, zetOpnameVerwacht, claimOpnameVerwerking, zetTranscriptieBezig, zetTranscriptieHerstelbaarMislukt, claimTranscriptieRetry } =
      await import("./oproep-state"));
    ({ verwerkInkomendeCall, verwerkTrainingKeuze, verwerkOpnameStatus } = await import("./gesprek"));

    draaiPayloadMigrate(scratchUri);
    payload = await getPayload({ config, key: "telefonie-oproep-state-real-postgres" });
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

  beforeEach(() => {
    vi.stubEnv("TRAINER_TELEFONIE_ENABLED", "true");
    mockHaalTrainingVoorMutatie.mockReset().mockResolvedValue(gevondenTrainingVoorMutatie());
    mockHaalRecenteTrainingen.mockReset().mockResolvedValue([training()]);
    mockHaalSchoolDetail.mockReset().mockResolvedValue(maakSchoolDetail());
    mockGenerateStructuredOutput.mockReset().mockResolvedValue({
      behandeld: "Rekenen",
      keuzes: null,
      gingGoed: "Fijne sfeer",
      kanBeter: null,
      knelpunten: null,
      afspraken: null,
      actieSchool: null,
      actieTrainer: null,
      vervolg: null,
    });
    mockTranscribeAudio.mockReset().mockResolvedValue("Vandaag rekenen gedaan, het ging goed.");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function maakTrainerRow(): Promise<AuthTrainer & { mobielNummer: string }> {
    volgendTrainerSuffix += 1;
    const suffix = volgendTrainerSuffix;
    const mobielNummer = `+3161234${String(suffix).padStart(4, "0")}`; // uniek per rij (unique:true op TrainerAccounts.mobielNummer) — nooit een vaste waarde hergebruiken tussen tests
    const rij = await payload.create({
      collection: "trainer-accounts",
      data: {
        name: `Real-Postgres Trainer ${suffix}`,
        email: `oproep-state-real-postgres-${suffix}@mijnleerlijn.nl`,
        password: "RealPostgresTest#2026!!",
        mondayTrainerboardId: `82${String(suffix).padStart(9, "0")}`,
        mondayUitvoerderItemId: `72${String(suffix).padStart(9, "0")}`,
        mobielNummer,
        telefonieActief: true,
        actief: true,
      },
      overrideAccess: true,
    });
    return {
      id: rij.id as number,
      name: rij.name as string,
      email: rij.email as string,
      mondayTrainerboardId: rij.mondayTrainerboardId as string,
      mondayUitvoerderItemId: rij.mondayUitvoerderItemId as string,
      actief: true,
      mobielNummer,
    };
  }

  function nieuweCallId(): string {
    volgendCallSuffix += 1;
    return `CA-REAL-${volgendCallSuffix}`;
  }

  /** Bouwt een oproeprij uitsluitend via de echte, exporteerde oproep-state-functies — geen rechtstreekse rijmutatie. */
  async function maakOproepBijStatus(trainer: AuthTrainer, eindStatus: "training_gekozen" | "opname_verwacht") {
    const oproep = await maakOfHaalOproep(payload, nieuweCallId());
    await zetTrainerHerkend(payload, oproep.id, { trainerId: trainer.id, ruwNummer: "+31612345678", genormaliseerdNummer: "+31612345678", nummerVerborgen: false });
    const bijTrainingGekozen = await zetTrainingGekozen(payload, oproep.id, {
      kandidaatTrainingen: [{ id: "111", naam: "Training", schoolNaam: "Testschool", datum: "2026-08-20" }],
      mondayTrainingId: "111",
      mondaySchoolId: "500",
      mondayTrainerboardItemId: "222",
      schoolNaam: "Testschool",
      trainingNaam: "Training",
    });
    if (eindStatus === "training_gekozen") return bijTrainingGekozen;
    return zetOpnameVerwacht(payload, oproep.id);
  }

  async function herlees(oproepId: number) {
    return payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproepId, overrideAccess: true, depth: 0 });
  }

  // ---------------------------------------------------------------------------
  // claimOpnameVerwerking — de exacte live call.recording.saved-toestand
  // ---------------------------------------------------------------------------

  describe("claimOpnameVerwerking — de exacte live call.recording.saved-toestand", () => {
    it("status='training_gekozen', recording_provider_id leeg -> claim slaagt zonder syntax error, RETURNING geeft precies 1 rij, status wordt opname_ontvangen", async () => {
      const trainer = await maakTrainerRow();
      const oproep = await maakOproepBijStatus(trainer, "training_gekozen");
      expect(oproep.status).toBe("training_gekozen");
      expect(oproep.recordingProviderId ?? null).toBeNull();

      const gewonnen = await claimOpnameVerwerking(payload, oproep.id, "RE1", "https://provider.example/recordings/RE1");
      expect(gewonnen).toBe(true); // RETURNING id gaf precies 1 rij terug (rows.length > 0)

      const bijgewerkt = await herlees(oproep.id);
      expect(bijgewerkt.status).toBe("opname_ontvangen");
      expect(bijgewerkt.recordingProviderId).toBe("RE1");
      expect(bijgewerkt.opnameOphaalReferentie).toBe("https://provider.example/recordings/RE1");
    });

    it("status='opname_verwacht', recording_provider_id leeg -> claim slaagt eveneens zonder syntax error", async () => {
      const trainer = await maakTrainerRow();
      const oproep = await maakOproepBijStatus(trainer, "opname_verwacht");
      expect(oproep.status).toBe("opname_verwacht");

      const gewonnen = await claimOpnameVerwerking(payload, oproep.id, "RE2", "https://provider.example/recordings/RE2");
      expect(gewonnen).toBe(true);

      const bijgewerkt = await herlees(oproep.id);
      expect(bijgewerkt.status).toBe("opname_ontvangen");
    });

    it("een tweede, identieke call.recording.saved-aanroep (zelfde recordingProviderId) blijft idempotent: false, geen throw, geen extra statuswijziging", async () => {
      const trainer = await maakTrainerRow();
      const oproep = await maakOproepBijStatus(trainer, "opname_verwacht");

      expect(await claimOpnameVerwerking(payload, oproep.id, "RE3", "https://provider.example/recordings/RE3")).toBe(true);
      expect(await claimOpnameVerwerking(payload, oproep.id, "RE3", "https://provider.example/recordings/RE3")).toBe(false);

      const bijgewerkt = await herlees(oproep.id);
      expect(bijgewerkt.status).toBe("opname_ontvangen"); // ongewijzigd, niet nogmaals "verwerkt"
    });

    it("een rij die al voorbij opname_ontvangen is (bv. concept_klaar) is nooit meer claimbaar — 0 rijen, geen syntax error", async () => {
      const trainer = await maakTrainerRow();
      const oproep = await maakOproepBijStatus(trainer, "opname_verwacht");
      await claimOpnameVerwerking(payload, oproep.id, "RE4", "https://provider.example/recordings/RE4");
      await zetTranscriptieBezig(payload, oproep.id, 60);

      const dubbeleWebhookNaAfronding = await claimOpnameVerwerking(payload, oproep.id, "RE4", "https://provider.example/recordings/RE4");
      expect(dubbeleWebhookNaAfronding).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // claimTranscriptieRetry — hetzelfde retry-/cron-pad, expliciet ook gevraagd te controleren
  // ---------------------------------------------------------------------------

  describe("claimTranscriptieRetry — het retry-/cron-pad voor transcriptieherstel, tegen echte Postgres", () => {
    it("herstelbare rij met verstreken 'volgende poging'-tijdstip -> claim slaagt zonder syntax error", async () => {
      const trainer = await maakTrainerRow();
      const oproep = await maakOproepBijStatus(trainer, "opname_verwacht");
      await claimOpnameVerwerking(payload, oproep.id, "RE5", "https://provider.example/recordings/RE5");
      await zetTranscriptieHerstelbaarMislukt(payload, oproep.id, {
        pogingen: 1,
        volgendePogingOp: new Date(Date.now() - 1000).toISOString(),
        foutmelding: "Whisper tijdelijk onbereikbaar",
      });

      const gewonnen = await claimTranscriptieRetry(payload, oproep.id, new Date(Date.now() - 20 * 60 * 1000).toISOString());
      expect(gewonnen).toBe(true);

      const bijgewerkt = await herlees(oproep.id);
      expect(bijgewerkt.status).toBe("transcriptie_bezig");
    });

    it("vastgelopen rij (updated_at ouder dan de vastgelopen-grens) vanuit opname_ontvangen -> claim slaagt via het crashherstelpad", async () => {
      const trainer = await maakTrainerRow();
      const oproep = await maakOproepBijStatus(trainer, "opname_verwacht");
      await claimOpnameVerwerking(payload, oproep.id, "RE6", "https://provider.example/recordings/RE6");

      // Backdateert updated_at rechtstreeks — payload.update() zou het bewust
      // altijd zelf weer op "nu" zetten, dus geen bruikbare weg om een
      // vastgelopen rij te simuleren; zelfde escape hatch als de rest van dit
      // bestand (raw SQL via payload.db.drizzle.execute).
      await payload.db.drizzle.execute(sql`UPDATE trainer_telefonie_oproepen SET updated_at = ${new Date(Date.now() - 30 * 60 * 1000).toISOString()} WHERE id = ${oproep.id};`);

      const gewonnen = await claimTranscriptieRetry(payload, oproep.id, new Date(Date.now() - 20 * 60 * 1000).toISOString());
      expect(gewonnen).toBe(true);
    });

    it("een dubbele onderhoudsronde-claim voor dezelfde rij wint maar één keer — idempotent bij overlappende cronruns", async () => {
      const trainer = await maakTrainerRow();
      const oproep = await maakOproepBijStatus(trainer, "opname_verwacht");
      await claimOpnameVerwerking(payload, oproep.id, "RE7", "https://provider.example/recordings/RE7");
      await zetTranscriptieHerstelbaarMislukt(payload, oproep.id, {
        pogingen: 1,
        volgendePogingOp: new Date(Date.now() - 1000).toISOString(),
        foutmelding: "fout",
      });

      const vastgelopenVoorTijdstip = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      expect(await claimTranscriptieRetry(payload, oproep.id, vastgelopenVoorTijdstip)).toBe(true);
      expect(await claimTranscriptieRetry(payload, oproep.id, vastgelopenVoorTijdstip)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Einde-tot-einde: na een succesvolle claim kan de flow door naar
  // recording lookup/download/transcriptie/concept (Telnyx en AI gemockt,
  // de rest — inclusief ELKE database-schrijving — loopt echt).
  // ---------------------------------------------------------------------------

  describe("einde-tot-einde: call.recording.saved -> opname ophalen/transcriberen/concept, tegen echte Postgres", () => {
    it("een volledige, realistische call.recording.saved-afhandeling resulteert in status concept_klaar en een echte training-verslagen-rij", async () => {
      const trainer = await maakTrainerRow();
      const callId = nieuweCallId();
      // vanNummerRuw = trainer.mobielNummer (al genormaliseerd E.164) — trainer-lookup
      // matcht op genormaliseerd nummer, dus geen aparte update() nodig om te laten overeenkomen.
      const inkomendeProvider = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: callId, vanNummerRuw: trainer.mobielNummer, nummerVerborgen: false }) });

      await verwerkInkomendeCall(payload, inkomendeProvider, {});
      const oproepNaInkomend = await maakOfHaalOproep(payload, callId); // idempotente find, geen tweede rij
      const oproepId = oproepNaInkomend.id;

      await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1", clientState: null }) }), oproepId, {});
      expect((await herlees(oproepId)).status).toBe("opname_verwacht");

      const opnameProvider = maakFakeProvider({
        ontleedOpnameStatus: () =>
          ({
            providerCallId: callId,
            providerRecordingId: "RE-E2E",
            status: "voltooid",
            duurSeconden: 42,
            ophaalReferentie: "https://provider.example/recordings/RE-E2E",
          }) as OpnameStatusGegevens,
      });
      await verwerkOpnameStatus(payload, opnameProvider, oproepId, {});

      const afgerond = await herlees(oproepId);
      expect(afgerond.status).toBe("concept_klaar");
      expect(afgerond.recordingProviderId).toBe("RE-E2E");

      const verslagen = await payload.find({ collection: "training-verslagen", overrideAccess: true, where: { telefonieOproep: { equals: oproepId } } });
      expect(verslagen.totalDocs).toBe(1);
      expect(verslagen.docs[0]?.trainerInvoer).toBe("Vandaag rekenen gedaan, het ging goed.");
      expect(opnameProvider.verwijderOpname).toHaveBeenCalledWith("RE-E2E");
    });

    it("een tweede, identieke call.recording.saved-webhook voor hetzelfde gesprek levert nooit een tweede concept op", async () => {
      const trainer = await maakTrainerRow();
      const callId = nieuweCallId();
      const inkomendeProvider = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: callId, vanNummerRuw: trainer.mobielNummer, nummerVerborgen: false }) });

      await verwerkInkomendeCall(payload, inkomendeProvider, {});
      const oproepId = (await maakOfHaalOproep(payload, callId)).id;
      await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1", clientState: null }) }), oproepId, {});

      const opnameProvider = maakFakeProvider({
        ontleedOpnameStatus: () =>
          ({
            providerCallId: callId,
            providerRecordingId: "RE-DUP",
            status: "voltooid",
            duurSeconden: 42,
            ophaalReferentie: "https://provider.example/recordings/RE-DUP",
          }) as OpnameStatusGegevens,
      });

      await verwerkOpnameStatus(payload, opnameProvider, oproepId, {}); // 1e (echte) event
      await verwerkOpnameStatus(payload, opnameProvider, oproepId, {}); // 2e, identiek (bv. Telnyx-redelivery)

      expect(mockTranscribeAudio).toHaveBeenCalledTimes(1);
      const verslagen = await payload.find({ collection: "training-verslagen", overrideAccess: true, where: { telefonieOproep: { equals: oproepId } } });
      expect(verslagen.totalDocs).toBe(1);
    });
  });
});
