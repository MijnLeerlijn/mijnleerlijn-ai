// Trainertelefonie V1-afronding (2026-08-26) — spec §7/§22: "Een race tussen
// twee gelijktijdige gesprekken die dezelfde training claimen moet maximaal
// één actief concept opleveren; de verliezende kant krijgt een normale,
// niet-technische uitkomst, nooit stilzwijgend overschreven." Zelfde
// architectuurredenering als lib/trainers/verslag.concurrency.real-postgres.test.ts
// (dat bestand se eigen doc-comment legt uit WAAROM dit tegen een ECHTE
// Postgres moet draaien, niet tegen lib/support/fake-payload.ts — een
// in-memory fake heeft geen echte rijvergrendeling/unique-constraint en kan
// dus nooit bewijzen dat de race daadwerkelijk atomisch beslecht wordt,
// ongeacht hoe overtuigend de assertions lijken).
//
// Twee lagen worden hier bewezen (zie gesprek.ts se kiesTrainingEnStartOpname/
// lib/trainers/verslag.ts se upsertConcept voor de volledige toelichting):
//  1. De AUTORITAIRE garantie: upsertConcept() se unique-index-gebaseerde
//     race-afhandeling — dit is de laag die ONVOORWAARDELIJK "maximaal één
//     concept" garandeert, ongeacht timing. Rechtstreeks getest met twee
//     ECHT gelijktijdige upsertConcept-aanroepen (Promise.all), met
//     VERSCHILLENDE telefonieOproepId's (dus twee verschillende gesprekken).
//  2. Realistische end-to-end-simulatie: twee complete, echte oproeprijen
//     (verschillende providerCallId's, dezelfde trainer) die beide dezelfde
//     training kiezen en vervolgens (bijna) gelijktijdig hun opname-status-
//     webhook krijgen — bewijst dat de HELE gesprek.ts-orchestratie
//     (claimOpnameVerwerking + upsertConcept samen) zich onder échte
//     concurrency identiek gedraagt als laag 1 hierboven belooft.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import type { Payload } from "payload";
import { haalTrainingVoorMutatie, haalSchoolDetail, haalRecenteTrainingenVoorTelefonie } from "./../monday-links";
import { haalUpdatesVoorItem, maakUpdate, leesKolomWaarden, wijzigKolomWaarde, wijzigKolomWaardeJson, haalItemMetKolomWaarden } from "@/lib/sales/monday-client";
import { generateStructuredOutput, transcribeAudio } from "@/services/ai-client";
import type { AuthTrainer } from "../auth";
import type { TrainingMetSchool, TrainingVoorMutatie, SchoolDetail } from "../monday-links";
import type { TelefonieProvider, InkomendeCallGegevens, GatherResultaat, OpnameStatusGegevens } from "./provider";

vi.mock("./../monday-links", async (importOriginal) => {
  const echt = await importOriginal<typeof import("../monday-links")>();
  return { ...echt, haalTrainingVoorMutatie: vi.fn(), haalSchoolDetail: vi.fn(), haalRecenteTrainingenVoorTelefonie: vi.fn() };
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
vi.mock("@/services/ai-client", () => ({ generateStructuredOutput: vi.fn(), transcribeAudio: vi.fn() }));

const mockHaalTrainingVoorMutatie = vi.mocked(haalTrainingVoorMutatie);
const mockHaalSchoolDetail = vi.mocked(haalSchoolDetail);
const mockHaalRecenteTrainingen = vi.mocked(haalRecenteTrainingenVoorTelefonie);
const mockHaalUpdatesVoorItem = vi.mocked(haalUpdatesVoorItem);
const mockMaakUpdate = vi.mocked(maakUpdate);
const mockLeesKolomWaarden = vi.mocked(leesKolomWaarden);
const mockWijzigKolomWaarde = vi.mocked(wijzigKolomWaarde);
const mockWijzigKolomWaardeJson = vi.mocked(wijzigKolomWaardeJson);
const mockHaalItemMetKolomWaarden = vi.mocked(haalItemMetKolomWaarden);
const mockGenerateStructuredOutput = vi.mocked(generateStructuredOutput);
const mockTranscribeAudio = vi.mocked(transcribeAudio);

const TEST_DATABASE_URI = process.env.TELEFONIE_CONCURRENCY_TEST_DATABASE_URI ?? "postgres://mijnleerlijn:mijnleerlijn@localhost:5432/mijnleerlijn";
const TEST_DB_NAAM = "mijnleerlijn_telefonie_concurrency_test";

function vervangDatabasenaam(uri: string, nieuweNaam: string): string {
  const url = new URL(uri);
  url.pathname = `/${nieuweNaam}`;
  return url.toString();
}

function draaiPayloadMigrate(databaseUri: string): void {
  execFileSync("npx", ["payload", "migrate"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URI: databaseUri, PAYLOAD_MIGRATING: "true" }, stdio: "pipe" });
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
    id: "race-training",
    naam: "Racetraining",
    status: "gepland",
    ruweStatusTekst: "Gepland",
    datum: "2026-08-26",
    logboekIngevuld: false,
    trainerboardItemId: "tb-race",
    schoolId: "school-race",
    schoolNaam: "Racetestschool",
    ...overrides,
  };
}

function maakFakeProvider(overrides: Partial<TelefonieProvider> = {}): TelefonieProvider {
  return {
    naam: "fake",
    verifieerWebhookSignature: () => true,
    ontleedInkomendeCall: vi.fn(() => ({ providerCallId: "CA1", vanNummerRuw: "+31612345678", nummerVerborgen: false }) as InkomendeCallGegevens),
    ontleedGatherResultaat: vi.fn(() => ({ cijfers: null }) as GatherResultaat),
    ontleedOpnameStatus: vi.fn(
      () => ({ providerCallId: "CA1", providerRecordingId: "RE1", status: "voltooid", duurSeconden: 30, ophaalReferentie: "https://provider.example/RE1", clientState: null }) as OpnameStatusGegevens
    ),
    ontleedSpreekAfgerond: vi.fn(() => ({ providerCallId: "CA1", clientState: null })),
    voerVoiceInstructiesUit: vi.fn().mockResolvedValue({ status: 200, contentType: null, body: null }),
    beantwoordOproep: vi.fn().mockResolvedValue(undefined),
    haalOpnameOp: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    verwijderOpname: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe.skipIf(!beschikbaar)("Trainertelefonie — ECHTE concurrency tegen echte Postgres (spec §7/§22, geen fake-mock)", () => {
  let payload: Payload;
  let getPayload: typeof import("payload").getPayload;
  let config: typeof import("@/payload.config").default;
  let upsertConcept: typeof import("../verslag").upsertConcept;
  let haalVerslagVoorTraining: typeof import("../verslag").haalVerslagVoorTraining;
  let verwerkInkomendeCall: typeof import("./gesprek").verwerkInkomendeCall;
  let verwerkTrainingKeuze: typeof import("./gesprek").verwerkTrainingKeuze;
  let verwerkOpnameStatus: typeof import("./gesprek").verwerkOpnameStatus;
  let maakOfHaalOproep: typeof import("./oproep-state").maakOfHaalOproep;
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
    ({ upsertConcept, haalVerslagVoorTraining } = await import("../verslag"));
    ({ verwerkInkomendeCall, verwerkTrainingKeuze, verwerkOpnameStatus } = await import("./gesprek"));
    ({ maakOfHaalOproep } = await import("./oproep-state"));

    draaiPayloadMigrate(scratchUri);
    payload = await getPayload({ config, key: "telefonie-concurrency" });
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
    mockHaalUpdatesVoorItem.mockReset().mockResolvedValue([]);
    mockMaakUpdate.mockReset().mockImplementation(async () => ({ id: `monday-update-${Math.random().toString(36).slice(2)}` }));
    mockLeesKolomWaarden.mockReset().mockImplementation(async (_itemId: string, columnIds: string[]) => columnIds.map((id) => ({ id, text: null, value: null })));
    mockWijzigKolomWaarde.mockReset().mockResolvedValue(undefined);
    mockWijzigKolomWaardeJson.mockReset().mockResolvedValue(undefined);
    mockHaalItemMetKolomWaarden.mockReset().mockImplementation(async (itemId: string, columnIds: string[]) => ({
      id: itemId,
      name: "x",
      column_values: [{ id: columnIds[0]!, text: "v", value: JSON.stringify({ checked: "true" }) }],
    }));
    mockGenerateStructuredOutput.mockReset().mockResolvedValue({
      behandeld: "Rekenen",
      keuzes: null,
      gingGoed: null,
      kanBeter: null,
      knelpunten: null,
      afspraken: null,
      actieSchool: null,
      actieTrainer: null,
      vervolg: null,
    });
    mockTranscribeAudio.mockReset().mockResolvedValue("Verslag ingesproken tijdens racetest.");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // AuthTrainer (auth.ts) draagt bewust GEEN mobielNummer (dat leeft
  // uitsluitend op de ruwe trainer-accounts-rij, gelezen door
  // trainer-lookup.ts) — dit bestand geeft het daarom apart terug, i.p.v.
  // trainer.mobielNummer aan te nemen (dat zou altijd undefined zijn en
  // verwerkInkomendeCall ten onrechte op "nummer verborgen" laten belanden).
  async function maakTrainerRow(naam: string): Promise<{ trainer: AuthTrainer; mobielNummer: string }> {
    volgendTrainerSuffix += 1;
    const suffix = volgendTrainerSuffix;
    const mobielNummer = `+3161235${String(suffix).padStart(4, "0")}`;
    const rij = await payload.create({
      collection: "trainer-accounts",
      data: {
        name: naam,
        email: `telefonie-race-${suffix}@mijnleerlijn.nl`,
        password: "TelefonieRaceTest#2026!!",
        mondayTrainerboardId: `82${String(suffix).padStart(9, "0")}`,
        mondayUitvoerderItemId: `72${String(suffix).padStart(9, "0")}`,
        mobielNummer,
        telefonieActief: true,
        actief: true,
      },
      overrideAccess: true,
    });
    return {
      trainer: {
        id: rij.id as number,
        name: naam,
        email: rij.email as string,
        mondayTrainerboardId: rij.mondayTrainerboardId as string,
        mondayUitvoerderItemId: rij.mondayUitvoerderItemId as string,
        actief: true,
      },
      mobielNummer,
    };
  }

  it("1. laag 1 (de autoritaire garantie): twee ECHT gelijktijdige upsertConcept-aanroepen voor DEZELFDE training, vanuit TWEE verschillende oproepen -> precies één concept, de verliezer krijgt 'bestaat_al', nooit een overschrijving", async () => {
    const { trainer } = await maakTrainerRow("Race Trainer 1");
    mockHaalTrainingVoorMutatie.mockResolvedValue({
      training: { id: "race-1", naam: "Training", status: "gepland", ruweStatusTekst: "Gepland", datum: "2026-08-26", logboekIngevuld: false, trainerboardItemId: "tb-1" },
      schoolId: "school-1",
      schoolNaam: "School Race 1",
    } as TrainingVoorMutatie);

    // telefonieOproep is een echte, FK-begrensde relatie (trainer_telefonie_
    // oproepen) — twee echte oproeprijen nodig, geen verzonnen ID's.
    const oproepA = await maakOfHaalOproep(payload, "CA-DIRECT-A");
    const oproepB = await maakOfHaalOproep(payload, "CA-DIRECT-B");

    const [eerste, tweede] = await Promise.all([
      upsertConcept(payload, trainer, "race-1", { trainerInvoer: "Tekst van gesprek A", bron: "telefoon", telefonieOproepId: oproepA.id }),
      upsertConcept(payload, trainer, "race-1", { trainerInvoer: "Tekst van gesprek B", bron: "telefoon", telefonieOproepId: oproepB.id }),
    ]);

    const uitkomsten = [eerste, tweede];
    const winnaars = uitkomsten.filter((u) => u.soort === "ok");
    const verliezers = uitkomsten.filter((u) => u.soort === "bestaat_al");
    expect(winnaars).toHaveLength(1);
    expect(verliezers).toHaveLength(1);

    const finaleRij = await haalVerslagVoorTraining(payload, trainer, "race-1");
    expect(finaleRij).not.toBeNull();
    // De verliezer se oproep-ID mag NOOIT het uiteindelijke record "gewonnen"
    // hebben — het concept hoort bij precies één van de twee oproepen.
    expect([oproepA.id, oproepB.id]).toContain(finaleRij?.telefonieOproep);
    // De inhoud is die van de WINNAAR — nooit een mix/overschrijving door de verliezer.
    const winnaarOproepId = finaleRij?.telefonieOproep;
    expect(finaleRij?.trainerInvoer).toBe(winnaarOproepId === oproepA.id ? "Tekst van gesprek A" : "Tekst van gesprek B");

    const alleRijen = await payload.find({ collection: "training-verslagen", overrideAccess: true, where: { mondayTrainingId: { equals: "race-1" } } });
    expect(alleRijen.totalDocs).toBe(1); // NOOIT twee rijen voor dezelfde [trainer, mondayTrainingId]
  });

  it("2. end-to-end: twee ECHTE, verschillende oproepen van dezelfde trainer kiezen (bijna) gelijktijdig dezelfde training en verwerken hun opname gelijktijdig -> precies één concept_klaar, de ander verslag_bestaat_al, geen dubbele Monday-write", async () => {
    const { trainer, mobielNummer } = await maakTrainerRow("Race Trainer 2");
    mockHaalRecenteTrainingen.mockReset().mockResolvedValue([training({ id: "race-2" })]);
    mockHaalTrainingVoorMutatie.mockReset().mockResolvedValue({
      training: { id: "race-2", naam: "Racetraining", status: "gepland", ruweStatusTekst: "Gepland", datum: "2026-08-26", logboekIngevuld: false, trainerboardItemId: "tb-race" },
      schoolId: "school-race",
      schoolNaam: "Racetestschool",
    } as TrainingVoorMutatie);
    mockHaalSchoolDetail.mockResolvedValue({
      id: "school-race",
      naam: "Racetestschool",
      onderwijstype: null,
      locatie: null,
      implementatiefase: null,
      contactpersoonNaam: null,
      contactpersoonBetrouwbaar: false,
      bron: "trainer-relatie",
      trainingen: { verslag_nog_invullen: [], vandaag: [], komend: [], open: [], gedaan: [], geannuleerd: [] },
      logboek: [],
    } as SchoolDetail);

    // Twee volledig aparte gesprekken (verschillende providerCallId's), beide
    // herkennen dezelfde trainer en kiezen — nog vóórdat een van beide een
    // concept heeft — dezelfde (enige) aangeboden training.
    const providerA = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: "CA-RACE-A", vanNummerRuw: mobielNummer, nummerVerborgen: false }) });
    const providerB = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: "CA-RACE-B", vanNummerRuw: mobielNummer, nummerVerborgen: false }) });
    await verwerkInkomendeCall(payload, providerA, {});
    await verwerkInkomendeCall(payload, providerB, {});
    const oproepA = await maakOfHaalOproep(payload, "CA-RACE-A");
    const oproepB = await maakOfHaalOproep(payload, "CA-RACE-B");

    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepA.id, {});
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepB.id, {});

    // Beide gesprekken hebben nu ONAFHANKELIJK dezelfde training vastgelegd
    // (spec §7 se écht-gelijktijdige-racevenster) — nu (bijna) gelijktijdig
    // de opnamestatus laten binnenkomen, elk met een eigen recordingProviderId.
    const providerOpnameA = maakFakeProvider({
      ontleedOpnameStatus: () => ({ providerCallId: "CA-RACE-A", providerRecordingId: "RE-A", status: "voltooid", duurSeconden: 30, ophaalReferentie: "https://provider.example/RE-A", clientState: null }),
    });
    const providerOpnameB = maakFakeProvider({
      ontleedOpnameStatus: () => ({ providerCallId: "CA-RACE-B", providerRecordingId: "RE-B", status: "voltooid", duurSeconden: 30, ophaalReferentie: "https://provider.example/RE-B", clientState: null }),
    });

    await Promise.all([verwerkOpnameStatus(payload, providerOpnameA, oproepA.id, {}), verwerkOpnameStatus(payload, providerOpnameB, oproepB.id, {})]);

    const alleRijen = await payload.find({ collection: "training-verslagen", overrideAccess: true, where: { mondayTrainingId: { equals: "race-2" } } });
    expect(alleRijen.totalDocs).toBe(1); // nooit twee concepten voor dezelfde training

    const statusA = (await payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproepA.id, overrideAccess: true, depth: 0 })).status;
    const statusB = (await payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproepB.id, overrideAccess: true, depth: 0 })).status;
    const statussen = [statusA, statusB].sort();
    // Eén kant concept_klaar (won de race), de andere verslag_bestaat_al
    // (verloor) — NOOIT allebei concept_klaar, NOOIT een technische foutstatus.
    expect(statussen).toEqual(["concept_klaar", "verslag_bestaat_al"]);

    // Spec §29 (architectuurgrens, ongewijzigd): ook onder deze race gaat er
    // nooit een Monday-schrijving uit — de conceptfase raakt Monday nooit.
    expect(mockMaakUpdate).not.toHaveBeenCalled();
    expect(mockWijzigKolomWaarde).not.toHaveBeenCalled();
    expect(mockWijzigKolomWaardeJson).not.toHaveBeenCalled();
  });
});
