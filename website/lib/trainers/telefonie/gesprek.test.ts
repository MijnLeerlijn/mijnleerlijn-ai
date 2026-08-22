import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verwerkInkomendeCall, verwerkTrainingKeuze, verwerkOpnameToets, verwerkSpreekAfgerond, verwerkOpnameAfgerond, verwerkOpnameStatus, verwerkTelefonieOnderhoud, verwerkTelefonieHandmatigeRetry } from "./gesprek";
import { claimOpnameVerwerking } from "./oproep-state";
import { haalRecenteTrainingenVoorTelefonie, haalTrainingVoorMutatie, haalSchoolDetail, vandaagIsoAmsterdam } from "../monday-links";
import { haalUpdatesVoorItem, maakUpdate, leesKolomWaarden, wijzigKolomWaarde, wijzigKolomWaardeJson, haalItemMetKolomWaarden } from "@/lib/sales/monday-client";
import { generateStructuredOutput, transcribeAudio } from "@/services/ai-client";
import { haalVerslagVoorTraining } from "../verslag";
import { maakFakePayload } from "@/lib/support/fake-payload";
import type { AuthTrainer } from "../auth";
import type { TelefonieProvider, InkomendeCallGegevens, GatherResultaat, OpnameStatusGegevens } from "./provider";
import type { TrainingMetSchool, TrainingVoorMutatie, SchoolDetail } from "../monday-links";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — dekt lib/trainers/telefonie/
// gesprek.ts, de kernorchestratie van de telefoonflow. Draait tegen de ECHTE
// trainer-lookup.ts/oproep-state.ts/verslag.ts (upsertConcept/
// structureerVerslag) + fake-payload — GEEN mock van deze eigen modules: de
// hele waarde van deze testsuite zit 'm er juist in dat het daadwerkelijke,
// end-to-end pad bewezen wordt, zeker voor de kritieke architectuurclaim
// hieronder (spec §29). Uitsluitend de ECHTE externe randen worden gemockt:
// haalRecenteTrainingenVoorTelefonie/haalTrainingVoorMutatie/haalSchoolDetail
// (Monday-leeslaag — heeft al eigen dekking in monday-links.test.ts),
// @/lib/sales/monday-client se schrijffuncties (Monday-mutatielaag — moeten
// hier bewijsbaar NOOIT aangeroepen worden) en @/services/ai-client
// (transcribeAudio/generateStructuredOutput — externe OpenAI-aanroepen). De
// TelefonieProvider zelf is providerneutraal en wordt hier als eenvoudig fake
// object doorgegeven — geen Telnyx-specifieke mock nodig (die staat apart in
// telnyx-provider.test.ts).
vi.mock("../monday-links", async (importOriginal) => {
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

const mockHaalRecenteTrainingen = vi.mocked(haalRecenteTrainingenVoorTelefonie);
const mockHaalTrainingVoorMutatie = vi.mocked(haalTrainingVoorMutatie);
const mockHaalSchoolDetail = vi.mocked(haalSchoolDetail);
const mockHaalUpdatesVoorItem = vi.mocked(haalUpdatesVoorItem);
const mockMaakUpdate = vi.mocked(maakUpdate);
const mockLeesKolomWaarden = vi.mocked(leesKolomWaarden);
const mockWijzigKolomWaarde = vi.mocked(wijzigKolomWaarde);
const mockWijzigKolomWaardeJson = vi.mocked(wijzigKolomWaardeJson);
const mockHaalItemMetKolomWaarden = vi.mocked(haalItemMetKolomWaarden);
const mockGenerateStructuredOutput = vi.mocked(generateStructuredOutput);
const mockTranscribeAudio = vi.mocked(transcribeAudio);

const TRAINER: AuthTrainer = {
  id: 101,
  name: "Wessel Kok",
  email: "wessel@mijnleerlijn.nl",
  mondayTrainerboardId: "18424768045",
  mondayUitvoerderItemId: "12419116827",
  actief: true,
};
const TRAINER_B: AuthTrainer = { ...TRAINER, id: 102, name: "Andere Trainer", mondayUitvoerderItemId: "999999" };

const TRAINING_ID = "111";
const TRAINERBOARD_ITEM_ID = "222";
const SCHOOL_ID = "500";
const SCHOOL_NAAM = "Montessori Gorinchem";

function trainerRij(trainer: AuthTrainer, overrides: Record<string, unknown> = {}) {
  return {
    id: trainer.id,
    name: trainer.name,
    email: trainer.email,
    mondayTrainerboardId: trainer.mondayTrainerboardId,
    mondayUitvoerderItemId: trainer.mondayUitvoerderItemId,
    actief: true,
    mobielNummer: "+31612345678",
    telefonieActief: true,
    ...overrides,
  };
}

function dagenGeleden(n: number): string {
  const d = new Date(`${vandaagIsoAmsterdam()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function training(overrides: Partial<TrainingMetSchool> = {}): TrainingMetSchool {
  return {
    id: TRAINING_ID,
    naam: "Online spreekuur",
    status: "gepland",
    ruweStatusTekst: "Gepland",
    datum: vandaagIsoAmsterdam(),
    logboekIngevuld: false,
    trainerboardItemId: TRAINERBOARD_ITEM_ID,
    schoolId: SCHOOL_ID,
    schoolNaam: SCHOOL_NAAM,
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
    id: SCHOOL_ID,
    naam: SCHOOL_NAAM,
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
    ontleedGatherResultaat: vi.fn(() => ({ cijfers: null }) as GatherResultaat),
    ontleedOpnameStatus: vi.fn(
      () =>
        ({
          providerCallId: "CA1",
          providerRecordingId: "RE1",
          status: "voltooid",
          duurSeconden: 60,
          ophaalReferentie: "https://provider.example/recordings/RE1",
          clientState: Buffer.from("0", "utf8").toString("base64"), // poging 0 — matcht de default heropnamePogingen van een verse oproep
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

let payload: ReturnType<typeof maakFakePayload>["payload"];
let collection: ReturnType<typeof maakFakePayload>["collection"];

beforeEach(() => {
  vi.stubEnv("TRAINER_TELEFONIE_ENABLED", "true");
  ({ payload, collection } = maakFakePayload({ "trainer-accounts": [trainerRij(TRAINER), trainerRij(TRAINER_B, { mobielNummer: "+31699999999" })] }));

  mockHaalRecenteTrainingen.mockReset().mockResolvedValue([training()]);
  mockHaalTrainingVoorMutatie.mockReset().mockResolvedValue(gevondenTrainingVoorMutatie());
  mockHaalSchoolDetail.mockReset().mockResolvedValue(maakSchoolDetail());
  mockHaalUpdatesVoorItem.mockReset().mockResolvedValue([]);
  mockMaakUpdate.mockReset().mockImplementation(async () => ({ id: `update-${Math.random()}` }));
  mockLeesKolomWaarden.mockReset().mockImplementation(async (itemId: string, columnIds: string[]) => columnIds.map((id) => ({ id, text: null, value: null })));
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

/** Alle Monday-MUTATIEFUNCTIES in één keer opvragen — spec §23/§29 se kernbewijs. */
function verwachtGeenEnkeleMondayMutatie() {
  expect(mockMaakUpdate).not.toHaveBeenCalled();
  expect(mockWijzigKolomWaarde).not.toHaveBeenCalled();
  expect(mockWijzigKolomWaardeJson).not.toHaveBeenCalled();
}

// ---------------------------------------------------------------------------
// verwerkInkomendeCall
// ---------------------------------------------------------------------------

describe("verwerkInkomendeCall", () => {
  it("scenario 27: TRAINER_TELEFONIE_ENABLED uit -> direct 'niet beschikbaar', geen enkele call-staterij aangemaakt", async () => {
    vi.stubEnv("TRAINER_TELEFONIE_ENABLED", "false");
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    expect(instructies).toEqual([{ soort: "zeg_en_ophangen", tekst: "Deze functie is nog niet beschikbaar.", reden: "niet_beschikbaar" }]);
    expect(collection("trainer-telefonie-oproepen")).toHaveLength(0);
    expect(provider.ontleedInkomendeCall).not.toHaveBeenCalled();
  });

  it("ontbrekend CallSid (structureel onmogelijk via de echte provider) -> niet beschikbaar", async () => {
    const provider = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: "", vanNummerRuw: "+31612345678", nummerVerborgen: false }) });
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    expect(instructies[0]).toEqual({ soort: "zeg_en_ophangen", tekst: "Deze functie is nog niet beschikbaar.", reden: "niet_beschikbaar" });
  });

  it("scenario 3: verborgen/anoniem nummer -> geen enkele trainerherkenning geprobeerd, vaste afwijzingsboodschap", async () => {
    const provider = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: "CA1", vanNummerRuw: null, nummerVerborgen: true }) });
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    expect(instructies).toEqual([{ soort: "zeg_en_ophangen", tekst: "Ik kan je telefoonnummer niet zien. Bel met een zichtbaar nummer, of log in op de traineromgeving.", reden: "nummer_verborgen" }]);
    expect(mockHaalRecenteTrainingen).not.toHaveBeenCalled();
    const rij = collection("trainer-telefonie-oproepen")[0]!;
    expect(rij.status).toBe("mislukt");
    expect(rij.foutcode).toBe("nummer_verborgen");
  });

  it("scenario 2: onbekend (niet-gekoppeld) nummer -> exact de opgegeven boodschap, geen enkele schoolinformatie prijsgegeven", async () => {
    const provider = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: "CA1", vanNummerRuw: "+31600000000", nummerVerborgen: false }) });
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    expect(instructies).toEqual([
      {
        soort: "zeg_en_ophangen",
        tekst: "Dit telefoonnummer is niet gekoppeld aan een traineraccount. Log in op de traineromgeving om je telefoonnummer te controleren of neem contact op met MijnLeerlijn.",
        reden: "onbekend_nummer",
      },
    ]);
    expect(mockHaalRecenteTrainingen).not.toHaveBeenCalled();
  });

  it("scenario 4: dubbele trainer-telefoonkoppeling (legacy-conflict) -> generieke boodschap, NOOIT de interne reden of een van beide trainers prijsgeven", async () => {
    const { payload: conflictPayload } = maakFakePayload({
      "trainer-accounts": [trainerRij(TRAINER, { mobielNummer: "+31611111111" }), trainerRij(TRAINER_B, { id: 102, mobielNummer: "+31611111111" })],
    });
    const provider = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: "CA1", vanNummerRuw: "+31611111111", nummerVerborgen: false }) });
    const instructies = await verwerkInkomendeCall(conflictPayload, provider, {});
    expect(instructies).toEqual([{ soort: "zeg_en_ophangen", tekst: "Er is een probleem met het herkennen van je account. Neem contact op met MijnLeerlijn.", reden: "conflict_meerdere_trainers" }]);
    expect(instructies[0]).not.toMatchObject({ tekst: expect.stringContaining("Wessel") });
    expect(mockHaalRecenteTrainingen).not.toHaveBeenCalled();
  });

  it("scenario 28: trainer herkend maar telefonieActief:false -> gepersonaliseerde 'nog niet beschikbaar'-boodschap, geen trainingzoektocht", async () => {
    const { payload: pilotUitPayload } = maakFakePayload({ "trainer-accounts": [trainerRij(TRAINER, { telefonieActief: false })] });
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(pilotUitPayload, provider, {});
    expect(instructies).toEqual([{ soort: "zeg_en_ophangen", tekst: "Hallo Wessel. Telefonische verslaglegging is nog niet beschikbaar voor jouw account.", reden: "trainer_niet_pilot" }]);
    expect(mockHaalRecenteTrainingen).not.toHaveBeenCalled();
  });

  it("spec §14: geen recente trainingen -> vaste 'geen beschikbare training'-boodschap, verwijzing naar de traineromgeving, geen lege DTMF-gather gestart", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([]);
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    expect(instructies).toEqual([
      { soort: "zeg_en_ophangen", tekst: "Hallo Wessel. Ik zie geen trainingen waarvoor nog een verslag kan worden ingesproken. Controleer je trainingen in de traineromgeving.", reden: "geen_training_gevonden" },
    ]);
    const rij = collection("trainer-telefonie-oproepen")[0]!;
    expect(rij.status).toBe("mislukt");
    expect(rij.foutcode).toBe("geen_training_gevonden");
  });

  it("spec §6/§14: alle recente trainingen hebben al een verslag -> zelfde 'geen beschikbare training'-boodschap als structureel niets recents (geen tweede statuslaag/apart pad)", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([training({ datum: vandaagIsoAmsterdam() })]);
    const { payload: payloadMetVerslag } = maakFakePayload({
      "trainer-accounts": [trainerRij(TRAINER)],
      "training-verslagen": [{ id: 1, trainer: TRAINER.id, mondayTrainingId: TRAINING_ID, status: "concept", bron: "telefoon" }],
    });
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payloadMetVerslag, provider, {});
    expect(instructies).toEqual([
      { soort: "zeg_en_ophangen", tekst: "Hallo Wessel. Ik zie geen trainingen waarvoor nog een verslag kan worden ingesproken. Controleer je trainingen in de traineromgeving.", reden: "geen_training_gevonden" },
    ]);
  });

  it("spec §1/§2: precies één training VANDAAG -> ja/nee-bevestiging met 'druk'-formulering, oproeprij op trainer_herkend met de kandidaat opgeslagen", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([training({ naam: "Training", schoolNaam: "Montessorischool Merlijn", datum: vandaagIsoAmsterdam() })]);
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payload, provider, {});

    expect(instructies).toHaveLength(1);
    const instructie = instructies[0]!;
    expect(instructie.soort).toBe("zeg_en_kies_cijfers");
    if (instructie.soort !== "zeg_en_kies_cijfers") return;
    expect(instructie.tekst).toContain("Hallo Wessel.");
    expect(instructie.tekst).toContain("Montessorischool Merlijn");
    expect(instructie.tekst).toContain("vandaag");
    expect(instructie.tekst).toContain("Druk 1 voor ja, druk 2 voor nee.");
    expect(instructie.tekst).not.toMatch(/zeg \d/i);
    expect(instructie.maxCijfers).toBe(1);
    expect(instructie.actieUrl).toContain("kies-training?oproepId=");

    const rij = collection("trainer-telefonie-oproepen")[0]!;
    expect(rij.status).toBe("trainer_herkend");
    expect(rij.trainer).toBe(TRAINER.id);
    expect((rij.kandidaatTrainingen as { fase: string; kandidaten: unknown[] }).fase).toBe("vandaag");
    expect((rij.kandidaatTrainingen as { fase: string; kandidaten: unknown[] }).kandidaten).toHaveLength(1);
  });

  it("spec §3: meerdere trainingen VANDAAG -> genummerde keuzelijst met 'druk'-formulering, elke optie herkenbaar via schoolnaam", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([
      training({ id: "111", schoolNaam: "Montessorischool Merlijn", datum: vandaagIsoAmsterdam() }),
      training({ id: "222", schoolNaam: "CBS de Wereld", datum: vandaagIsoAmsterdam() }),
    ]);
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    const instructie = instructies[0]!;
    expect(instructie.soort).toBe("zeg_en_kies_cijfers");
    if (instructie.soort !== "zeg_en_kies_cijfers") return;
    expect(instructie.tekst).toContain("Druk 1 voor Montessorischool Merlijn");
    expect(instructie.tekst).toContain("Druk 2 voor CBS de Wereld");
    // Geen oudere trainingen aanwezig -> geen escapecijfer 9 aangeboden (spec §3).
    expect(instructie.tekst).not.toContain("Druk 9");
  });

  it("spec §1/§3: trainingen vandaag ÉN ouder -> vandaag wordt eerst aangeboden (nooit meteen de volledige lijst); bij precies één vandaag-kandidaat loopt 'nee' vanzelf door naar ouder (geen apart escapecijfer nodig)", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([
      training({ id: "111", schoolNaam: "Vandaag School", datum: vandaagIsoAmsterdam() }),
      training({ id: "222", schoolNaam: "Gisteren School", datum: dagenGeleden(1) }),
    ]);
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    const instructie = instructies[0]!;
    if (instructie.soort !== "zeg_en_kies_cijfers") throw new Error("verwacht zeg_en_kies_cijfers");
    expect(instructie.tekst).toContain("Vandaag School");
    expect(instructie.tekst).not.toContain("Gisteren School");
    expect(instructie.tekst).toContain("Druk 1 voor ja, druk 2 voor nee.");
  });

  it("spec §3: meerdere trainingen vandaag ÉN een oudere laag -> het escapecijfer 9 wordt aangeboden (uitsluitend dan)", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([
      training({ id: "111", schoolNaam: "Vandaag School A", datum: vandaagIsoAmsterdam() }),
      training({ id: "222", schoolNaam: "Vandaag School B", datum: vandaagIsoAmsterdam() }),
      training({ id: "333", schoolNaam: "Gisteren School", datum: dagenGeleden(1) }),
    ]);
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    const instructie = instructies[0]!;
    if (instructie.soort !== "zeg_en_kies_cijfers") throw new Error("verwacht zeg_en_kies_cijfers");
    expect(instructie.tekst).toContain("Vandaag School A");
    expect(instructie.tekst).toContain("Vandaag School B");
    expect(instructie.tekst).not.toContain("Gisteren School");
    expect(instructie.tekst).toContain("Druk 9 voor andere trainingen.");
  });

  it("spec §4: GEEN training vandaag maar wel ouder -> meteen door naar de oudere laag, zonder tussenliggende 'niets vandaag'-melding", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([training({ id: "222", schoolNaam: "Gisteren School", datum: dagenGeleden(1) })]);
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    const instructie = instructies[0]!;
    if (instructie.soort !== "zeg_en_kies_cijfers") throw new Error("verwacht zeg_en_kies_cijfers");
    expect(instructie.tekst).toContain("Gisteren School");
    expect(instructie.tekst).toContain("gisteren");
    const rij = collection("trainer-telefonie-oproepen")[0]!;
    expect((rij.kandidaatTrainingen as { fase: string }).fase).toBe("ouder");
  });

  it("spec §5: datumformulering gebruikt vandaag/gisteren/eergisteren/een concrete datum, nooit interne ID's", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([
      training({ id: "1", schoolNaam: "A", datum: dagenGeleden(1) }),
      training({ id: "2", schoolNaam: "B", datum: dagenGeleden(2) }),
      training({ id: "3", schoolNaam: "C", datum: dagenGeleden(3) }),
    ]);
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    const instructie = instructies[0]!;
    if (instructie.soort !== "zeg_en_kies_cijfers") throw new Error("verwacht zeg_en_kies_cijfers");
    expect(instructie.tekst).toContain("gisteren");
    expect(instructie.tekst).toContain("eergisteren");
    expect(instructie.tekst).not.toContain(TRAINING_ID);
    expect(instructie.tekst).not.toMatch(/\b1\d{2,}\b/); // geen kale Monday-achtige ID's uitgesproken
  });

  it("spec §2/§3: schoolnaam is leidend; trainingnaam alleen erbij als twee kandidaten in DEZELFDE laag dezelfde school delen", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([
      training({ id: "1", schoolNaam: "Dezelfde School", naam: "Ochtend", datum: vandaagIsoAmsterdam() }),
      training({ id: "2", schoolNaam: "Dezelfde School", naam: "Middag", datum: vandaagIsoAmsterdam() }),
    ]);
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    const instructie = instructies[0]!;
    if (instructie.soort !== "zeg_en_kies_cijfers") throw new Error("verwacht zeg_en_kies_cijfers");
    expect(instructie.tekst).toContain("Dezelfde School — Ochtend");
    expect(instructie.tekst).toContain("Dezelfde School — Middag");
  });

  it("spec §1: begroet ALTIJD eerst met de echte voornaam, vóór elke vraag over trainingen", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([training({ datum: vandaagIsoAmsterdam() })]);
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    const instructie = instructies[0]!;
    if (instructie.soort !== "zeg_en_kies_cijfers") throw new Error("verwacht zeg_en_kies_cijfers");
    expect(instructie.tekst.startsWith("Hallo Wessel.")).toBe(true);
  });

  it("scenario 1: geldig, genormaliseerd nummer van een pilot-trainer wordt correct herkend, ook in een andere notatie", async () => {
    const provider = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: "CA1", vanNummerRuw: "0612345678", nummerVerborgen: false }) });
    await verwerkInkomendeCall(payload, provider, {});
    const rij = collection("trainer-telefonie-oproepen")[0]!;
    expect(rij.trainer).toBe(TRAINER.id);
    expect(rij.genormaliseerdNummer).toBe("+31612345678");
  });

  it("idempotent op providerCallId: een herhaalde inkomende-call-webhook voor dezelfde CallSid maakt geen tweede rij aan", async () => {
    const provider = maakFakeProvider();
    await verwerkInkomendeCall(payload, provider, {});
    await verwerkInkomendeCall(payload, provider, {});
    expect(collection("trainer-telefonie-oproepen")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// verwerkTrainingKeuze
// ---------------------------------------------------------------------------

describe("verwerkTrainingKeuze", () => {
  async function herkendeOproep(kandidaten: TrainingMetSchool[] = [training()]) {
    mockHaalRecenteTrainingen.mockResolvedValue(kandidaten);
    const provider = maakFakeProvider();
    await verwerkInkomendeCall(payload, provider, {});
    const rij = collection("trainer-telefonie-oproepen")[0]!;
    return rij.id as number;
  }

  it("scenario 27: TRAINER_TELEFONIE_ENABLED uit -> niet beschikbaar, geen enkele statuswijziging", async () => {
    const oproepId = await herkendeOproep();
    vi.stubEnv("TRAINER_TELEFONIE_ENABLED", "false");
    const provider = maakFakeProvider();
    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});
    expect(instructies[0]).toEqual({ soort: "zeg_en_ophangen", tekst: "Deze functie is nog niet beschikbaar.", reden: "niet_beschikbaar" });
  });

  it("scenario 5 vervolg: cijfer 1 (ja) bij één kandidaat -> bevestigd, status opname_verwacht, spreekt EERST de instructie (start dus zelf nog GEEN opname)", async () => {
    const oproepId = await herkendeOproep([training()]);
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) });

    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});

    expect(instructies).toHaveLength(1);
    const instructie = instructies[0]!;
    expect(instructie.soort).toBe("zeg_en_neem_op");
    if (instructie.soort !== "zeg_en_neem_op") return;
    expect(instructie.actieUrl).toContain(`opname-afgerond?oproepId=${oproepId}`);
    expect(instructie.statusCallbackUrl).toContain(`opname-status?oproepId=${oproepId}`);
    expect(instructie.stopToets).toBe("#");
    expect(instructie.poging).toBe(0);
    // Deze instructie bevat GEEN maxDuurSeconden/stilteTimeoutSeconden meer —
    // die zijn uitsluitend nodig voor de latere opname_starten-instructie,
    // pas geleverd ná call.speak.ended (zie verwerkSpreekAfgerond hieronder).
    expect(instructie).not.toHaveProperty("maxDuurSeconden");

    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("opname_verwacht");
    expect(rij.gekozenMondayTrainingId).toBe(TRAINING_ID);
    expect(rij.gekozenMondaySchoolId).toBe(SCHOOL_ID);
    expect(rij.gekozenMondayTrainerboardItemId).toBe(TRAINERBOARD_ITEM_ID);
  });

  it("spec §3/§15: cijfer 2 (nee) op de enige VANDAAG-kandidaat, met een oudere training beschikbaar -> gaat door naar de oudere laag (nooit meteen ophangen)", async () => {
    const oproepId = await herkendeOproep([training({ id: "111", datum: vandaagIsoAmsterdam() })]);
    // Verse her-fetch op keuzemoment (gaNaarOudereLaag) ziet nu ook de oudere training.
    mockHaalRecenteTrainingen.mockResolvedValue([training({ id: "111", datum: vandaagIsoAmsterdam() }), training({ id: "222", schoolNaam: "Oudere School", datum: dagenGeleden(1) })]);
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "2" }) });

    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});

    const instructie = instructies[0]!;
    if (instructie.soort !== "zeg_en_kies_cijfers") throw new Error("verwacht zeg_en_kies_cijfers (de oudere laag)");
    expect(instructie.tekst).toContain("Oudere School");
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("trainer_herkend"); // nog geen keuze gemaakt, alleen doorgeschoven naar de volgende laag
    expect((rij.kandidaatTrainingen as { fase: string }).fase).toBe("ouder");
  });

  it("spec §14: cijfer 2 (nee) op de enige VANDAAG-kandidaat, GEEN oudere training beschikbaar -> vaste 'geen kandidaten meer'-boodschap, nette afsluiting", async () => {
    const oproepId = await herkendeOproep([training({ datum: vandaagIsoAmsterdam() })]);
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "2" }) });

    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});

    expect(instructies).toEqual([
      { soort: "zeg_en_ophangen", tekst: "Ik zie geen trainingen waarvoor nog een verslag kan worden ingesproken. Controleer je trainingen in de traineromgeving.", reden: "geen_training_gevonden" },
    ]);
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("mislukt");
    expect(rij.foutcode).toBe("geen_training_gevonden");
  });

  it("spec §3: cijfer 9 (escape) bij meerdere VANDAAG-kandidaten -> toont de oudere laag", async () => {
    const oproepId = await herkendeOproep([training({ id: "111", datum: vandaagIsoAmsterdam() }), training({ id: "222", datum: vandaagIsoAmsterdam() })]);
    // Verse her-fetch op keuzemoment (gaNaarOudereLaag) ziet nu ook de oudere training.
    mockHaalRecenteTrainingen.mockResolvedValue([
      training({ id: "111", datum: vandaagIsoAmsterdam() }),
      training({ id: "222", datum: vandaagIsoAmsterdam() }),
      training({ id: "333", schoolNaam: "Oudere School", datum: dagenGeleden(1) }),
    ]);
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "9" }) });

    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});

    const instructie = instructies[0]!;
    if (instructie.soort !== "zeg_en_kies_cijfers") throw new Error("verwacht zeg_en_kies_cijfers (de oudere laag)");
    expect(instructie.tekst).toContain("Oudere School");
  });

  it("spec §15: cijfer 1 (ja) op de enige OUDERE-kandidaat -> bevestigd en opname gestart, net als bij vandaag", async () => {
    // herkendeOproep krijgt uitsluitend een ouder-gedateerde training -> verwerkInkomendeCall
    // presenteert meteen de ouder-laag (spec §4), cijfer 1 kiest 'm.
    const oproepId = await herkendeOproep([training({ id: "222", schoolNaam: "Oudere School", datum: dagenGeleden(1) })]);
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) });

    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});

    expect(instructies[0]!.soort).toBe("zeg_en_neem_op");
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("opname_verwacht");
    expect(rij.gekozenMondayTrainingId).toBe("222");
  });

  it("spec §14: cijfer 2 (nee) op de enige OUDERE-kandidaat -> dit WAS al de laatste laag, vaste 'geen kandidaten meer'-boodschap", async () => {
    const oproepId = await herkendeOproep([training({ id: "222", datum: dagenGeleden(1) })]);
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "2" }) });

    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});

    expect(instructies).toEqual([
      { soort: "zeg_en_ophangen", tekst: "Ik zie geen trainingen waarvoor nog een verslag kan worden ingesproken. Controleer je trainingen in de traineromgeving.", reden: "geen_training_gevonden" },
    ]);
  });

  it("spec §7: race — tussen aanbieden en kiezen is er al een verslag voor deze training ontstaan -> geen technische fout, vaste 'verslag bestaat al'-boodschap, geen overschrijving", async () => {
    const oproepId = await herkendeOproep([training()]);
    // Simuleert een net gewonnen ander gesprek: er bestaat nu al een verslag voor TRAINING_ID, van een ANDERE oproep.
    collection("training-verslagen").push({ id: 777, trainer: TRAINER.id, mondayTrainingId: TRAINING_ID, status: "concept", bron: "telefoon", telefonieOproep: 999999 });
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) });

    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});

    expect(instructies).toEqual([
      { soort: "zeg_en_ophangen", tekst: "Voor deze training staat al een verslag klaar. Kies een andere training in de traineromgeving of bel opnieuw voor een andere training.", reden: "verslag_bestaat_al" },
    ]);
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("verslag_bestaat_al");
    expect(rij.foutcode ?? null).toBeNull(); // NOOIT als technische fout gelabeld (spec §7/§17)
    expect(collection("training-verslagen")).toHaveLength(1); // ongewijzigd — nooit overschreven
  });

  it("scenario 6 vervolg: bij meerdere kandidaten kiest cijfer 2 daadwerkelijk de TWEEDE training, nooit de eerste", async () => {
    const kandidaten = [training({ id: "111", naam: "Eerste" }), training({ id: "222", naam: "Tweede", trainerboardItemId: "333" })];
    const oproepId = await herkendeOproep(kandidaten);
    // Her-resolutie op keuzemoment moet dezelfde twee kandidaten opnieuw vinden.
    mockHaalRecenteTrainingen.mockResolvedValue(kandidaten);
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "2" }) });

    await verwerkTrainingKeuze(payload, provider, oproepId, {});

    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.gekozenMondayTrainingId).toBe("222");
    expect(rij.gekozenTrainingNaam).toBe("Tweede");
  });

  it("ongeldig cijfer (buiten bereik, geen escapecijfer) -> geen keuze gemaakt, geen training vastgelegd", async () => {
    const kandidaten = [training({ id: "111" }), training({ id: "222" })];
    const oproepId = await herkendeOproep(kandidaten);
    mockHaalRecenteTrainingen.mockResolvedValue(kandidaten);
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "7" }) });
    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});
    expect(instructies[0]!.soort).toBe("zeg_en_ophangen");
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("mislukt");
    expect(rij.foutcode).toBe("geen_keuze_gemaakt");
  });

  it("spec §3: cijfer 9 zonder aangeboden ouder-laag (geen oudere trainingen bestaan) -> degradeert veilig naar 'geen kandidaten meer', geen crash/verkeerde keuze", async () => {
    const kandidaten = [training({ id: "111" }), training({ id: "222" })];
    const oproepId = await herkendeOproep(kandidaten);
    mockHaalRecenteTrainingen.mockResolvedValue(kandidaten); // geen enkele training buiten vandaag
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "9" }) });
    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});
    expect(instructies).toEqual([
      { soort: "zeg_en_ophangen", tekst: "Ik zie geen trainingen waarvoor nog een verslag kan worden ingesproken. Controleer je trainingen in de traineromgeving.", reden: "geen_training_gevonden" },
    ]);
  });

  it("geen enkele invoer (timeout) -> geen keuze gemaakt", async () => {
    const oproepId = await herkendeOproep([training()]);
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: null }) });
    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});
    expect(instructies[0]!.soort).toBe("zeg_en_ophangen");
  });

  it("VEILIGHEID (spec §6): de gekozen training wordt ALTIJD vers her-geresolveerd — als hij tussen aanbieden en kiezen wegvalt (bv. geannuleerd), wordt de eerder-gesnapshotte kandidaat NOOIT blind vertrouwd", async () => {
    const oproepId = await herkendeOproep([training()]);
    mockHaalRecenteTrainingen.mockResolvedValue([]); // op keuzemoment niet meer aanwezig
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) });

    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});

    expect(instructies[0]).toEqual({ soort: "zeg_en_ophangen", tekst: "Deze training is niet meer beschikbaar. Open de traineromgeving om je verslag daar te maken.", reden: "geen_training_gevonden" });
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("mislukt");
    expect(rij.foutcode).toBe("geen_training_gevonden");
  });

  it("scenario 7: elke oproep resolveert uitsluitend tegen ZIJN EIGEN, server-side opgeslagen trainer — trainer B's her-resolutie gebruikt nooit trainer A's identiteit, ook al lopen beide oproepen door dezelfde functie", async () => {
    const oproepIdA = await herkendeOproep([training({ id: "111" })]);

    // Los, tweede gesprek voor TRAINER_B — zelfde payload-instantie, andere oproeprij.
    mockHaalRecenteTrainingen.mockResolvedValue([training({ id: "999", schoolNaam: "School van Trainer B" })]);
    const providerB = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: "CA-B", vanNummerRuw: "+31699999999", nummerVerborgen: false }) });
    await verwerkInkomendeCall(payload, providerB, {});
    const oproepIdB = collection("trainer-telefonie-oproepen").find((d) => d.providerCallId === "CA-B")!.id as number;

    mockHaalRecenteTrainingen.mockClear();
    mockHaalRecenteTrainingen.mockResolvedValue([training({ id: "111" })]);
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepIdA, {});

    // De her-resolutie-aanroep vanuit oproepIdA moet TRAINER (id 101), nooit TRAINER_B, hebben gebruikt.
    const gebruikteTrainer = mockHaalRecenteTrainingen.mock.calls.at(-1)![0];
    expect(gebruikteTrainer.id).toBe(TRAINER.id);
    void oproepIdB;
  });
});

// ---------------------------------------------------------------------------
// verwerkOpnameAfgerond
// ---------------------------------------------------------------------------

describe("verwerkOpnameAfgerond", () => {
  it("TRAINER_TELEFONIE_ENABLED uit -> niet beschikbaar", async () => {
    vi.stubEnv("TRAINER_TELEFONIE_ENABLED", "false");
    expect(await verwerkOpnameAfgerond(payload, 1)).toEqual([{ soort: "zeg_en_ophangen", tekst: "Deze functie is nog niet beschikbaar.", reden: "niet_beschikbaar" }]);
  });

  it("spec §9: vaste, exacte afsluitende boodschap na '#' of een reguliere afronding — trainer hoeft niets te bevestigen", async () => {
    await verwerkInkomendeCall(payload, maakFakeProvider(), {});
    const oproepId = collection("trainer-telefonie-oproepen")[0]!.id as number;
    const instructies = await verwerkOpnameAfgerond(payload, oproepId);
    expect(instructies).toEqual([{ soort: "zeg_en_ophangen", tekst: "Bedankt. Je verslag wordt verwerkt en staat straks voor je klaar om te controleren.", reden: "opname_afgerond" }]);
  });

  it("productieregressie (2026-08-27): een TWEEDE aanroep voor dezelfde oproep (bv. de call.recording.saved-fallback ná een al via '#' gestarte afsluiting) krijgt de claim NIET meer — stil [], geen tweede speak-poging", async () => {
    await verwerkInkomendeCall(payload, maakFakeProvider(), {});
    const oproepId = collection("trainer-telefonie-oproepen")[0]!.id as number;

    const eersteKeer = await verwerkOpnameAfgerond(payload, oproepId);
    const tweedeKeer = await verwerkOpnameAfgerond(payload, oproepId);

    expect(eersteKeer).toEqual([{ soort: "zeg_en_ophangen", tekst: "Bedankt. Je verslag wordt verwerkt en staat straks voor je klaar om te controleren.", reden: "opname_afgerond" }]);
    expect(tweedeKeer).toEqual([]);
    expect(collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!.afsluitboodschapGestartOp).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// verwerkOpnameToets — '#'/'*' tijdens het opnemen (spec §9/§10/§11/§12/§18)
// ---------------------------------------------------------------------------

describe("verwerkOpnameToets", () => {
  async function oproepMetOpnameVerwacht() {
    mockHaalRecenteTrainingen.mockResolvedValue([training()]);
    const provider = maakFakeProvider();
    await verwerkInkomendeCall(payload, provider, {});
    const oproepId = collection("trainer-telefonie-oproepen")[0]!.id as number;
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepId, {});
    return oproepId;
  }

  it("TRAINER_TELEFONIE_ENABLED uit -> niet beschikbaar", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    vi.stubEnv("TRAINER_TELEFONIE_ENABLED", "false");
    const instructies = await verwerkOpnameToets(payload, maakFakeProvider(), oproepId, {});
    expect(instructies).toEqual([{ soort: "zeg_en_ophangen", tekst: "Deze functie is nog niet beschikbaar.", reden: "niet_beschikbaar" }]);
  });

  it("spec §9: '#' -> stopt de opname en verwerkt hem, met de vaste afsluitende boodschap", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "#" }) });

    const instructies = await verwerkOpnameToets(payload, provider, oproepId, {});

    expect(instructies).toEqual([
      { soort: "stop_opname", poging: 0 },
      { soort: "zeg_en_ophangen", tekst: "Bedankt. Je verslag wordt verwerkt en staat straks voor je klaar om te controleren.", reden: "opname_afgerond" },
    ]);
  });

  it("spec §10: '*' -> stopt de HUIDIGE opname, behoudt dezelfde gekozen training, start een NIEUWE opname met de exacte herstarttekst", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const trainingIdVoor = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!.gekozenMondayTrainingId;
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "*" }) });

    const instructies = await verwerkOpnameToets(payload, provider, oproepId, {});

    expect(instructies[0]).toEqual({ soort: "stop_opname", poging: 0 });
    const tweede = instructies[1]!;
    expect(tweede.soort).toBe("zeg_en_neem_op");
    if (tweede.soort !== "zeg_en_neem_op") return;
    expect(tweede.tekst).toBe("Geen probleem. We beginnen opnieuw. Spreek je verslag in na de piep en sluit af met een hekje.");
    expect(tweede.poging).toBe(1);

    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("opname_verwacht"); // blijft opname_verwacht — keert nooit terug naar trainingkeuze
    expect(rij.gekozenMondayTrainingId).toBe(trainingIdVoor); // zelfde training
    expect(rij.heropnamePogingen).toBe(1);
  });

  it("spec §11: meerdere '*'-herstarts na elkaar tellen op, tot de expliciete limiet", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "*" }) });

    await verwerkOpnameToets(payload, provider, oproepId, {});
    await verwerkOpnameToets(payload, provider, oproepId, {});
    const instructies = await verwerkOpnameToets(payload, provider, oproepId, {});

    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.heropnamePogingen).toBe(3);
    const laatste = instructies[1]!;
    if (laatste.soort !== "zeg_en_neem_op") throw new Error("verwacht zeg_en_neem_op");
    expect(laatste.poging).toBe(3);
  });

  it("spec §11 (productieblocker): de limiet is bereikt (MAX_HEROPNAME_POGINGEN) -> de HUIDIGE opname blijft geldig/lopend (NOOIT gestopt), trainer krijgt de exacte waarschuwing, heropnamePogingen ongewijzigd", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "*" }) });
    await verwerkOpnameToets(payload, provider, oproepId, {});
    await verwerkOpnameToets(payload, provider, oproepId, {});
    await verwerkOpnameToets(payload, provider, oproepId, {});
    const rijNaDrie = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rijNaDrie.heropnamePogingen).toBe(3);

    const instructies = await verwerkOpnameToets(payload, provider, oproepId, {});

    expect(instructies).toHaveLength(1);
    const instructie = instructies[0]!;
    expect(instructie.soort).toBe("zeg_en_hervat_opname");
    if (instructie.soort !== "zeg_en_hervat_opname") return;
    expect(instructie.tekst).toBe("Je kunt niet nog een keer opnieuw beginnen. Ga verder met je huidige opname en sluit af met een hekje.");
    expect(instructie.poging).toBe(3); // zelfde poging — GEEN nieuwe opname, de 3e blijft gewoon lopen
    expect(typeof instructie.nonce).toBe("number");

    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.heropnamePogingen).toBe(3); // ongewijzigd — geen 4e poging gestart
    expect(rij.status).toBe("opname_verwacht"); // de lopende (3e) opname loopt gewoon door
  });

  it("spec §11 (productieblocker): twee ACHTEREENVOLGENDE keren op de limiet krijgen elk hun EIGEN nonce (zodat de her-bewapening van de gather niet ten onrechte gededupliceerd wordt)", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "*" }) });
    await verwerkOpnameToets(payload, provider, oproepId, {});
    await verwerkOpnameToets(payload, provider, oproepId, {});
    await verwerkOpnameToets(payload, provider, oproepId, {});

    const eersteInstructie = (await verwerkOpnameToets(payload, provider, oproepId, {}))[0]!;
    const tweedeInstructie = (await verwerkOpnameToets(payload, provider, oproepId, {}))[0]!;

    const eersteNonce = eersteInstructie.soort === "zeg_en_hervat_opname" ? eersteInstructie.nonce : undefined;
    const tweedeNonce = tweedeInstructie.soort === "zeg_en_hervat_opname" ? tweedeInstructie.nonce : undefined;
    expect(eersteNonce).not.toBe(tweedeNonce);
  });

  it("een ongeldig/onverwacht digit -> geen actie, opname loopt door", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "5" }) });
    const instructies = await verwerkOpnameToets(payload, provider, oproepId, {});
    expect(instructies).toEqual([]);
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("opname_verwacht");
  });

  it("geen digit (timeout op de opname_toets-gather) -> geen actie", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: null }) });
    const instructies = await verwerkOpnameToets(payload, provider, oproepId, {});
    expect(instructies).toEqual([]);
  });

  it("een oproep die niet (meer) op een opname wacht (bv. al concept_klaar) -> stil genegeerd, geen fout, geen statuswijziging", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    rij.status = "concept_klaar";
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "#" }) });

    const instructies = await verwerkOpnameToets(payload, provider, oproepId, {});

    expect(instructies).toEqual([]);
    expect(collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!.status).toBe("concept_klaar");
  });
});

// ---------------------------------------------------------------------------
// verwerkSpreekAfgerond — call.speak.ended (productieblocker-ronde 2026-08-26,
// spec "instructie moet volledig zijn uitgesproken vóór opname start")
// ---------------------------------------------------------------------------

/** Zelfde encoding als telnyx-provider.ts se coderenClientState() — hier bewust apart nagebouwd om de provider-adapter niet in gesprek.test.ts te hoeven importeren. */
function clientStateVoor(actie: string, poging: number, nonce?: number): string {
  const ruw = nonce !== undefined ? `${actie}:${poging}:${nonce}` : `${actie}:${poging}`;
  return Buffer.from(ruw, "utf8").toString("base64");
}

describe("verwerkSpreekAfgerond", () => {
  async function oproepMetOpnameVerwacht() {
    mockHaalRecenteTrainingen.mockResolvedValue([training()]);
    const provider = maakFakeProvider();
    await verwerkInkomendeCall(payload, provider, {});
    const oproepId = collection("trainer-telefonie-oproepen")[0]!.id as number;
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepId, {});
    return oproepId;
  }

  it("TRAINER_TELEFONIE_ENABLED uit -> niet beschikbaar", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    vi.stubEnv("TRAINER_TELEFONIE_ENABLED", "false");
    const provider = maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: clientStateVoor("start_opname", 0) }) });
    expect(await verwerkSpreekAfgerond(payload, provider, oproepId, {})).toEqual([{ soort: "zeg_en_ophangen", tekst: "Deze functie is nog niet beschikbaar.", reden: "niet_beschikbaar" }]);
  });

  it("ontbrekend client_state (bv. het gewone afscheidsbericht) -> stil genegeerd", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const provider = maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: null }) });
    expect(await verwerkSpreekAfgerond(payload, provider, oproepId, {})).toEqual([]);
  });

  it("actie=start_opname, poging matcht heropnamePogingen -> levert de opname_starten-instructie", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const provider = maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: clientStateVoor("start_opname", 0) }) });

    const instructies = await verwerkSpreekAfgerond(payload, provider, oproepId, {});

    expect(instructies).toEqual([{ soort: "opname_starten", maxDuurSeconden: 900, stilteTimeoutSeconden: 5, stopToets: "#", herstartToets: "*", poging: 0 }]);
  });

  it("actie=start_opname met een NIET-matchende poging (defensief, structureel onmogelijk) -> genegeerd", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const provider = maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: clientStateVoor("start_opname", 5) }) });
    expect(await verwerkSpreekAfgerond(payload, provider, oproepId, {})).toEqual([]);
  });

  it("actie=hervat_opname -> levert de opname_hervatten-instructie, laat poging ongewijzigd, geeft het nonce door", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const provider = maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: clientStateVoor("hervat_opname", 3, 999) }) });

    const instructies = await verwerkSpreekAfgerond(payload, provider, oproepId, {});

    expect(instructies).toEqual([{ soort: "opname_hervatten", maxDuurSeconden: 900, stopToets: "#", herstartToets: "*", poging: 3, nonce: 999 }]);
  });

  it("de oproep wacht niet (meer) op een opname -> stil genegeerd", async () => {
    const oproepId = await oproepMetOpnameVerwacht();
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    rij.status = "concept_klaar";
    const provider = maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: clientStateVoor("start_opname", 0) }) });
    expect(await verwerkSpreekAfgerond(payload, provider, oproepId, {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// END-TO-END: het exacte, expliciet gevraagde productieblocker-scenario —
// drie herstarts, dan nogmaals '*' op de limiet, dan '#' — de call moet
// correct afronden en EXACT ÉÉN geldige opname verwerken.
// ---------------------------------------------------------------------------

describe("productieblocker-scenario: 3x '*' (herstart), dan '*' op de limiet, dan '#'", () => {
  it("de volledige keten rondt netjes af met precies één training-verslagen-rij, gebaseerd op de LAATSTE (na de 3 herstarts) ingesproken tekst", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([training()]);
    const inkomendeProvider = maakFakeProvider();
    await verwerkInkomendeCall(payload, inkomendeProvider, {});
    const oproepId = collection("trainer-telefonie-oproepen")[0]!.id as number;
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepId, {});

    // poging 0 spreken -> starten.
    let instructies = await verwerkSpreekAfgerond(payload, maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: clientStateVoor("start_opname", 0) }) }), oproepId, {});
    expect(instructies[0]).toMatchObject({ soort: "opname_starten", poging: 0 });

    // Drie '*'-herstarts: elke keer stop+zeg_en_neem_op, dan speak.ended -> opname_starten voor de volgende poging.
    for (let poging = 1; poging <= 3; poging += 1) {
      const toetsInstructies = await verwerkOpnameToets(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "*" }) }), oproepId, {});
      expect(toetsInstructies).toEqual([
        { soort: "stop_opname", poging: poging - 1 },
        {
          soort: "zeg_en_neem_op",
          tekst: "Geen probleem. We beginnen opnieuw. Spreek je verslag in na de piep en sluit af met een hekje.",
          actieUrl: expect.stringContaining("opname-afgerond"),
          statusCallbackUrl: expect.stringContaining("opname-status"),
          stopToets: "#",
          herstartToets: "*",
          poging,
        },
      ]);
      instructies = await verwerkSpreekAfgerond(payload, maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: clientStateVoor("start_opname", poging) }) }), oproepId, {});
      expect(instructies[0]).toMatchObject({ soort: "opname_starten", poging });
    }
    expect(collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!.heropnamePogingen).toBe(3);

    // Een 4e '*' (op de limiet): GEEN nieuwe opname, de exacte waarschuwing, poging blijft 3.
    const opLimietInstructies = await verwerkOpnameToets(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "*" }) }), oproepId, {});
    expect(opLimietInstructies).toHaveLength(1);
    const waarschuwing = opLimietInstructies[0]!;
    if (waarschuwing.soort !== "zeg_en_hervat_opname") throw new Error("verwacht zeg_en_hervat_opname");
    expect(waarschuwing.tekst).toBe("Je kunt niet nog een keer opnieuw beginnen. Ga verder met je huidige opname en sluit af met een hekje.");
    expect(waarschuwing.poging).toBe(3);
    expect(collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!.heropnamePogingen).toBe(3); // ongewijzigd

    // De waarschuwing is "uitgesproken" -> hervatten + gather herbewapenen.
    const hervatInstructies = await verwerkSpreekAfgerond(
      payload,
      maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: clientStateVoor("hervat_opname", waarschuwing.poging, waarschuwing.nonce) }) }),
      oproepId,
      {}
    );
    expect(hervatInstructies).toEqual([{ soort: "opname_hervatten", maxDuurSeconden: 900, stopToets: "#", herstartToets: "*", poging: 3, nonce: waarschuwing.nonce }]);

    // DE KERN VAN DIT SCENARIO: '#' moet nu nog altijd werken (de gather is herbewapend).
    const stopInstructies = await verwerkOpnameToets(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "#" }) }), oproepId, {});
    expect(stopInstructies).toEqual([
      { soort: "stop_opname", poging: 3 },
      { soort: "zeg_en_ophangen", tekst: "Bedankt. Je verslag wordt verwerkt en staat straks voor je klaar om te controleren.", reden: "opname_afgerond" },
    ]);

    // De uiteindelijke opname (poging 3, client_state="3") wordt normaal verwerkt -> precies één concept.
    mockTranscribeAudio.mockResolvedValue("De vierde/laatste, geldige opname.");
    const opnameProvider = maakFakeProvider({
      ontleedOpnameStatus: () => ({
        providerCallId: "CA1",
        providerRecordingId: "RE-FINAL",
        status: "voltooid",
        duurSeconden: 45,
        ophaalReferentie: "https://provider.example/RE-FINAL",
        clientState: Buffer.from("3", "utf8").toString("base64"),
      }),
    });
    await verwerkOpnameStatus(payload, opnameProvider, oproepId, {});

    expect(collection("training-verslagen")).toHaveLength(1);
    expect(collection("training-verslagen")[0]!.trainerInvoer).toBe("De vierde/laatste, geldige opname.");
    const finaleRij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(finaleRij.status).toBe("concept_klaar");
  });
});

// ---------------------------------------------------------------------------
// PRODUCTIEREGRESSIE (2026-08-27) — live bevestigd: een terminale
// zeg_en_ophangen (bv. "geen beschikbare trainingen") deed een fire-and-
// forget speak GEVOLGD DOOR een onmiddellijke hangup, die de tekst afsneed
// voordat er iets hoorbaar was (call.speak.ended met status="call_hangup",
// client_state=null). Fix: zelfde deterministische speak-dan-actie-sequencing
// als spreek->opname (Blocker 2, 2026-08-26), nu ook voor spreek->ophangen —
// zie provider.ts/telnyx-provider.ts se "hangup_uitvoeren". Dit blok bewijst
// zowel de fix zelf als dat alle bestaande flows (opname/herstart/afronding/
// kandidaatfiltering) ongewijzigd blijven werken.
// ---------------------------------------------------------------------------

function hangupClientStateVoor(reden: string): string {
  return Buffer.from(`hangup_na_spraak:${reden}`, "utf8").toString("base64");
}

describe("productieregressie: spreek-dan-ophangen sequencing (2026-08-27)", () => {
  async function herkendeOproep(kandidaten: TrainingMetSchool[] = [training()]) {
    mockHaalRecenteTrainingen.mockResolvedValue(kandidaten);
    await verwerkInkomendeCall(payload, maakFakeProvider(), {});
    return collection("trainer-telefonie-oproepen")[0]!.id as number;
  }

  it("1/2: geen kandidaten -> UITSLUITEND een speak-instructie (zeg_en_ophangen) — geen enkele hangup_uitvoeren zit in het resultaat, dus structureel kan er vóór call.speak.ended nog geen hangup verstuurd zijn", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([]);

    const instructies = await verwerkInkomendeCall(payload, maakFakeProvider(), {});

    expect(instructies).toEqual([
      { soort: "zeg_en_ophangen", tekst: "Hallo Wessel. Ik zie geen trainingen waarvoor nog een verslag kan worden ingesproken. Controleer je trainingen in de traineromgeving.", reden: "geen_training_gevonden" },
    ]);
    expect(instructies.some((i) => i.soort === "hangup_uitvoeren")).toBe(false);
  });

  it("3: call.speak.ended met het bijbehorende client_state -> EXACT ÉÉN hangup_uitvoeren-instructie", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([]);
    await verwerkInkomendeCall(payload, maakFakeProvider(), {});
    const oproepId = collection("trainer-telefonie-oproepen")[0]!.id as number;
    const provider = maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: hangupClientStateVoor("geen_training_gevonden") }) });

    const instructies = await verwerkSpreekAfgerond(payload, provider, oproepId, {});

    expect(instructies).toEqual([{ soort: "hangup_uitvoeren", reden: "geen_training_gevonden" }]);
  });

  it("4: dubbel afgeleverd call.speak.ended (bv. Telnyx' eigen webhook-redelivery) -> beide keren EXACT dezelfde, enkelvoudige hangup_uitvoeren — nooit een tweede/andere actie. De daadwerkelijke bescherming tegen een dubbele HANGUP-aanroep bij Telnyx zelf loopt via het deterministische command_id (zie telnyx-provider.test.ts, 'dubbel afgeleverde hangup_uitvoeren')", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([]);
    await verwerkInkomendeCall(payload, maakFakeProvider(), {});
    const oproepId = collection("trainer-telefonie-oproepen")[0]!.id as number;
    const provider = maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: hangupClientStateVoor("geen_training_gevonden") }) });

    const eersteKeer = await verwerkSpreekAfgerond(payload, provider, oproepId, {});
    const tweedeKeer = await verwerkSpreekAfgerond(payload, provider, oproepId, {});

    expect(eersteKeer).toEqual([{ soort: "hangup_uitvoeren", reden: "geen_training_gevonden" }]);
    expect(tweedeKeer).toEqual(eersteKeer);
  });

  it("5: onbekende trainer -> de boodschap wordt eerst volledig 'uitgesproken' (zeg_en_ophangen, geen voortijdige hangup), pas ná call.speak.ended volgt de hangup", async () => {
    const provider = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: "CA1", vanNummerRuw: "+31600000000", nummerVerborgen: false }) });

    const spreekInstructies = await verwerkInkomendeCall(payload, provider, {});
    expect(spreekInstructies).toEqual([
      {
        soort: "zeg_en_ophangen",
        tekst: "Dit telefoonnummer is niet gekoppeld aan een traineraccount. Log in op de traineromgeving om je telefoonnummer te controleren of neem contact op met MijnLeerlijn.",
        reden: "onbekend_nummer",
      },
    ]);

    const oproepId = collection("trainer-telefonie-oproepen")[0]!.id as number;
    const spreekAfgerondProvider = maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: hangupClientStateVoor("onbekend_nummer") }) });
    expect(await verwerkSpreekAfgerond(payload, spreekAfgerondProvider, oproepId, {})).toEqual([{ soort: "hangup_uitvoeren", reden: "onbekend_nummer" }]);
  });

  it("6: verslag bestaat al voor de gekozen training (geen alternatief) -> de boodschap wordt eerst volledig uitgesproken, pas ná call.speak.ended volgt de hangup", async () => {
    const oproepId = await herkendeOproep([training()]);
    collection("training-verslagen").push({ id: 777, trainer: TRAINER.id, mondayTrainingId: TRAINING_ID, status: "concept", bron: "telefoon", telefonieOproep: 999999 });

    const spreekInstructies = await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepId, {});
    expect(spreekInstructies).toEqual([
      {
        soort: "zeg_en_ophangen",
        tekst: "Voor deze training staat al een verslag klaar. Kies een andere training in de traineromgeving of bel opnieuw voor een andere training.",
        reden: "verslag_bestaat_al",
      },
    ]);

    const spreekAfgerondProvider = maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: hangupClientStateVoor("verslag_bestaat_al") }) });
    expect(await verwerkSpreekAfgerond(payload, spreekAfgerondProvider, oproepId, {})).toEqual([{ soort: "hangup_uitvoeren", reden: "verslag_bestaat_al" }]);
  });

  it("7: de normale spreek->opname-flow blijft ongewijzigd werken (start_opname via verwerkSpreekAfgerond, raakt het hangup-pad niet)", async () => {
    const oproepId = await herkendeOproep([training()]);
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepId, {});
    const provider = maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: clientStateVoor("start_opname", 0) }) });

    const instructies = await verwerkSpreekAfgerond(payload, provider, oproepId, {});

    expect(instructies).toEqual([{ soort: "opname_starten", maxDuurSeconden: 900, stilteTimeoutSeconden: 5, stopToets: "#", herstartToets: "*", poging: 0 }]);
  });

  it("8: de '*'-herstartflow blijft werken (heropnamePogingen hoogt op, nieuwe zeg_en_neem_op, geen hangup)", async () => {
    const oproepId = await herkendeOproep([training()]);
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepId, {});

    const instructies = await verwerkOpnameToets(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "*" }) }), oproepId, {});

    expect(instructies).toEqual([
      { soort: "stop_opname", poging: 0 },
      {
        soort: "zeg_en_neem_op",
        tekst: "Geen probleem. We beginnen opnieuw. Spreek je verslag in na de piep en sluit af met een hekje.",
        actieUrl: expect.stringContaining("opname-afgerond"),
        statusCallbackUrl: expect.stringContaining("opname-status"),
        stopToets: "#",
        herstartToets: "*",
        poging: 1,
      },
    ]);
    expect(collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!.heropnamePogingen).toBe(1);
  });

  it("9: de '#'-afrondflow blijft werken (stop_opname + het speak-only afscheidsbericht, GEEN voortijdige hangup_uitvoeren)", async () => {
    const oproepId = await herkendeOproep([training()]);
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepId, {});

    const instructies = await verwerkOpnameToets(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "#" }) }), oproepId, {});

    expect(instructies).toEqual([
      { soort: "stop_opname", poging: 0 },
      { soort: "zeg_en_ophangen", tekst: "Bedankt. Je verslag wordt verwerkt en staat straks voor je klaar om te controleren.", reden: "opname_afgerond" },
    ]);
    expect(instructies.some((i) => i.soort === "hangup_uitvoeren")).toBe(false);
  });

  it("10: kandidaatfiltering blijft werken — de enige training heeft al een verslag (van een eerder gesprek/de portal), dus wordt ze nooit aangeboden en volgt de nette afwijzing i.p.v. een stille lege lijst", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([training()]);
    collection("training-verslagen").push({ id: 555, trainer: TRAINER.id, mondayTrainingId: TRAINING_ID, status: "concept", bron: "portal", telefonieOproep: null });

    const instructies = await verwerkInkomendeCall(payload, maakFakeProvider(), {});

    expect(instructies).toEqual([
      { soort: "zeg_en_ophangen", tekst: "Hallo Wessel. Ik zie geen trainingen waarvoor nog een verslag kan worden ingesproken. Controleer je trainingen in de traineromgeving.", reden: "geen_training_gevonden" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// PRODUCTIEREGRESSIE-VERVOLGRONDE (2026-08-27) — "na # hoor ik géén
// afsluittekst meer": de vorige ronde loste "spreek → hangup" voor ALLE
// terminale flows op, maar het '#'-pad heeft een unieke eigenschap die geen
// van de andere terminale flows heeft: verwerkOpnameAfgerond() wordt zowel
// vanuit dit expliciete pad áls vanuit de onafhankelijke call.recording.saved-
// fallback in route.ts aangeroepen (record_stop leidt normaal ook tot een
// eigen call.recording.saved) — met hetzelfde deterministische command_id op
// het onderliggende speak-commando. Fix: verwerkOpnameAfgerond is nu
// claim-gated (claimAfsluitboodschap, oproep-state.ts) — uitsluitend de
// trigger die de atomaire claim wint, spreekt de boodschap daadwerkelijk uit.
// ---------------------------------------------------------------------------

describe("productieregressie-vervolgronde: afsluitboodschap na '#' (2026-08-27)", () => {
  async function herkendeOproep(kandidaten: TrainingMetSchool[] = [training()]) {
    mockHaalRecenteTrainingen.mockResolvedValue(kandidaten);
    await verwerkInkomendeCall(payload, maakFakeProvider(), {});
    return collection("trainer-telefonie-oproepen")[0]!.id as number;
  }

  it("opname actief -> # -> record_stop + afsluit-speak (GEEN hangup_uitvoeren erbij) -> pas ná call.speak.ended volgt exact één hangup_uitvoeren", async () => {
    const oproepId = await herkendeOproep([training()]);
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepId, {});

    const toetsInstructies = await verwerkOpnameToets(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "#" }) }), oproepId, {});

    expect(toetsInstructies).toEqual([
      { soort: "stop_opname", poging: 0 },
      { soort: "zeg_en_ophangen", tekst: "Bedankt. Je verslag wordt verwerkt en staat straks voor je klaar om te controleren.", reden: "opname_afgerond" },
    ]);
    expect(toetsInstructies.some((i) => i.soort === "hangup_uitvoeren")).toBe(false);

    const spreekProvider = maakFakeProvider({ ontleedSpreekAfgerond: () => ({ providerCallId: "CA1", clientState: hangupClientStateVoor("opname_afgerond") }) });
    const hangupInstructies = await verwerkSpreekAfgerond(payload, spreekProvider, oproepId, {});
    expect(hangupInstructies).toEqual([{ soort: "hangup_uitvoeren", reden: "opname_afgerond" }]);
  });

  it("de call.recording.saved-fallback ná een al via '#' gestarte afsluiting spreekt de boodschap NIET nogmaals uit — voorkomt exact de dubbele-speak-poging die de root cause van deze regressie was", async () => {
    const oproepId = await herkendeOproep([training()]);
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepId, {});
    await verwerkOpnameToets(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "#" }) }), oproepId, {});

    // Simuleert de onafhankelijke call.recording.saved-fallback die normaal
    // óók na een expliciete '#'-afronding volgt — route.ts roept hiervoor
    // verwerkOpnameAfgerond() rechtstreeks nogmaals aan.
    const tweedeTrigger = await verwerkOpnameAfgerond(payload, oproepId);

    expect(tweedeTrigger).toEqual([]);
  });

  it("het concept-/verwerkingspad blijft ongewijzigd: ná # wordt de opname alsnog correct getranscribeerd en als concept vastgelegd", async () => {
    const oproepId = await herkendeOproep([training()]);
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepId, {});
    await verwerkOpnameToets(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "#" }) }), oproepId, {});

    mockTranscribeAudio.mockResolvedValue("Verslag na hekje, ongewijzigd verwerkingspad.");
    const opnameProvider = maakFakeProvider({
      ontleedOpnameStatus: () => ({
        providerCallId: "CA1",
        providerRecordingId: "RE-HEKJE",
        status: "voltooid",
        duurSeconden: 30,
        ophaalReferentie: "https://provider.example/RE-HEKJE",
        clientState: Buffer.from("0", "utf8").toString("base64"),
      }),
    });
    await verwerkOpnameStatus(payload, opnameProvider, oproepId, {});

    expect(collection("training-verslagen")).toHaveLength(1);
    expect(collection("training-verslagen")[0]!.trainerInvoer).toBe("Verslag na hekje, ongewijzigd verwerkingspad.");
    expect(collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!.status).toBe("concept_klaar");
  });
});

// ---------------------------------------------------------------------------
// verwerkOpnameStatus — opname ophalen, transcriberen, concept aanmaken
// ---------------------------------------------------------------------------

describe("verwerkOpnameStatus", () => {
  async function oproepKlaarVoorOpname() {
    mockHaalRecenteTrainingen.mockResolvedValue([training()]);
    const provider = maakFakeProvider();
    await verwerkInkomendeCall(payload, provider, {});
    const oproepId = collection("trainer-telefonie-oproepen")[0]!.id as number;
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepId, {});
    return oproepId;
  }

  it("scenario 27: TRAINER_TELEFONIE_ENABLED uit -> geen enkele verwerking, geen state-wijziging", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    vi.stubEnv("TRAINER_TELEFONIE_ENABLED", "false");
    await verwerkOpnameStatus(payload, maakFakeProvider(), oproepId, {});
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("opname_verwacht");
  });

  it("scenario 10: mislukte/lege opname -> mislukt met foutcode opname_mislukt, geen transcriptiepoging", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const provider = maakFakeProvider({
      ontleedOpnameStatus: () => ({ providerCallId: "CA1", providerRecordingId: "RE1", status: "mislukt", duurSeconden: null, ophaalReferentie: null, clientState: null }),
    });
    await verwerkOpnameStatus(payload, provider, oproepId, {});
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("mislukt");
    expect(rij.foutcode).toBe("opname_mislukt");
  });

  it("scenario 9/13/15/19/22: volledig gelukkig pad — transcriptie + AI-structurering + concept met bron=telefoon, gekoppeld aan deze oproep", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    mockTranscribeAudio.mockResolvedValue("Vandaag rekenen gedaan, fijne sfeer.");
    const provider = maakFakeProvider();

    await verwerkOpnameStatus(payload, provider, oproepId, {});

    expect(mockTranscribeAudio).toHaveBeenCalledTimes(1);
    expect(mockGenerateStructuredOutput).toHaveBeenCalledTimes(1);

    const verslagRij = collection("training-verslagen")[0]!;
    expect(verslagRij.status).toBe("concept");
    expect(verslagRij.bron).toBe("telefoon");
    expect(verslagRij.telefonieOproep).toBe(oproepId);
    expect(verslagRij.trainerInvoer).toBe("Vandaag rekenen gedaan, fijne sfeer.");
    expect(verslagRij.aiGegenereerd).toBe(true);
    expect(verslagRij.definitieveTekst).toContain("Rekenen");

    const oproepRij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(oproepRij.status).toBe("concept_klaar");
    expect(oproepRij.verslag).toBe(verslagRij.id);
    expect(oproepRij.transcriptieLengte).toBe("Vandaag rekenen gedaan, fijne sfeer.".length);

    // Spec §9: opname bij de provider actief opgeruimd zodra transcriptie + concept veilig staan.
    expect(provider.verwijderOpname).toHaveBeenCalledWith("RE1");
  });

  it("scenario 14 (Gate 1): transcriptie mislukt bij eerste poging -> herstelbare status, retry gepland, audio blijft staan, geen concept aangemaakt", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const provider = maakFakeProvider();
    mockTranscribeAudio.mockRejectedValue(new Error("Whisper tijdelijk onbereikbaar"));
    await verwerkOpnameStatus(payload, provider, oproepId, {});

    expect(collection("training-verslagen")).toHaveLength(0);
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("transcriptie_mislukt_herstelbaar");
    expect(rij.foutcode).toBe("transcriptie_mislukt");
    expect(rij.transcriptiePogingen).toBe(1);
    expect(typeof rij.volgendeTranscriptiepoging).toBe("string");
    expect(new Date(rij.volgendeTranscriptiepoging as string).getTime()).toBeGreaterThan(Date.now());

    // Spec: bij een herstelbare mislukking blijft de opname bewust bij de
    // provider staan (nodig voor de retry) — pas bij definitieve mislukking
    // of na de bewaartermijn wordt hij opgeruimd.
    expect(provider.verwijderOpname).not.toHaveBeenCalled();
    expect(rij.opnameVerwijderdOp ?? null).toBeNull();
  });

  it("Gate 1: na MAX_TRANSCRIPTIE_POGINGEN mislukte pogingen -> definitief 'mislukt', audio alsnog opgeruimd", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const provider = maakFakeProvider();
    mockTranscribeAudio.mockRejectedValue(new Error("Whisper tijdelijk onbereikbaar"));

    // 1e poging via de webhook, daarna 4 herstelpogingen via de onderhoudsronde
    // (totaal 5 = MAX_TRANSCRIPTIE_POGINGEN).
    await verwerkOpnameStatus(payload, provider, oproepId, {});
    for (let i = 0; i < 4; i += 1) {
      const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
      rij.volgendeTranscriptiepoging = new Date(Date.now() - 1000).toISOString();
      await verwerkTelefonieOnderhoud(payload, provider);
    }

    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("mislukt");
    expect(rij.foutcode).toBe("transcriptie_mislukt");
    expect(rij.transcriptiePogingen).toBe(5);
    expect(collection("training-verslagen")).toHaveLength(0);

    // Definitieve mislukking -> audio wordt alsnog actief opgeruimd (spec: nooit
    // audio laten staan zonder dat er nog een retry gepland is).
    expect(provider.verwijderOpname).toHaveBeenCalledWith("RE1");
    expect(rij.opnameVerwijderdOp).not.toBeNull();
  });

  it("Gate 1: bewaartermijn verstreken vóórdat het pogingenbudget op is -> definitief 'mislukt' met foutcode bewaartermijn_verstreken, audio opgeruimd", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const provider = maakFakeProvider();
    mockTranscribeAudio.mockRejectedValue(new Error("Whisper tijdelijk onbereikbaar"));

    const rijVoorOntvangst = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    rijVoorOntvangst.ontvangenOp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // > 24u geleden

    await verwerkOpnameStatus(payload, provider, oproepId, {});

    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("mislukt");
    expect(rij.foutcode).toBe("bewaartermijn_verstreken");
    expect(rij.transcriptiePogingen).toBe(1);
    expect(collection("training-verslagen")).toHaveLength(0);
    expect(provider.verwijderOpname).toHaveBeenCalledWith("RE1");
    expect(rij.opnameVerwijderdOp).not.toBeNull();
  });

  it("Gate 1: een retry na een eerdere herstelbare mislukking maakt nooit een tweede concept (upsertConcept blijft find-or-create op [trainer, mondayTrainingId])", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const provider = maakFakeProvider();

    mockTranscribeAudio.mockRejectedValueOnce(new Error("Whisper tijdelijk onbereikbaar"));
    await verwerkOpnameStatus(payload, provider, oproepId, {});
    let rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("transcriptie_mislukt_herstelbaar");

    mockTranscribeAudio.mockResolvedValue("Vandaag rekenen gedaan, fijne sfeer.");
    rij.volgendeTranscriptiepoging = new Date(Date.now() - 1000).toISOString();
    await verwerkTelefonieOnderhoud(payload, provider);

    rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("concept_klaar");
    expect(collection("training-verslagen")).toHaveLength(1);
    expect(mockTranscribeAudio).toHaveBeenCalledTimes(2);
  });

  it("Gate 1: de onderhoudsronde herstelt een 'vastgelopen' rij (crash tussen claim en afronding) zonder een tweede concept te maken", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const provider = maakFakeProvider();

    // Simuleer een serverless-crash: de claim is doorgevoerd (status +
    // ophaalreferentie liggen al vast) maar de container stierf vóór de
    // transcriptie kon starten/eindigen. updatedAt ligt ver in het verleden.
    await claimOpnameVerwerking(payload, oproepId, "RE1", "https://provider.example/recordings/RE1");
    const vastgelopen = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    vastgelopen.updatedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // > STUCK_TIMEOUT_MS

    const resultaat = await verwerkTelefonieOnderhoud(payload, provider);

    expect(resultaat.geclaimd).toBe(1);
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("concept_klaar");
    expect(collection("training-verslagen")).toHaveLength(1);
  });

  it("Gate 1: de onderhoudsronde is idempotent — een gelijktijdige/dubbele aanroep verwerkt dezelfde herstelbare rij maar één keer", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const provider = maakFakeProvider();
    mockTranscribeAudio.mockRejectedValueOnce(new Error("Whisper tijdelijk onbereikbaar"));
    await verwerkOpnameStatus(payload, provider, oproepId, {});

    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    rij.volgendeTranscriptiepoging = new Date(Date.now() - 1000).toISOString();
    mockTranscribeAudio.mockResolvedValue("Vandaag rekenen gedaan, fijne sfeer.");

    // "Gelijktijdig" gesimuleerd als twee sequentiële aanroepen zonder tussentijdse
    // wijziging — de atomaire claim-UPDATE moet de tweede aanroep leeg laten uitkomen.
    const [eerste, tweede] = await Promise.all([verwerkTelefonieOnderhoud(payload, provider), verwerkTelefonieOnderhoud(payload, provider)]);

    expect(eerste.geclaimd + tweede.geclaimd).toBe(1);
    expect(collection("training-verslagen")).toHaveLength(1);
    expect(mockTranscribeAudio).toHaveBeenCalledTimes(2); // 1e mislukte poging + 1 geslaagde retry
  });

  it("scenario 16: AI-structurering mislukt -> concept blijft toch bewaard (trainerInvoer=transcript), oproep alsnog concept_klaar — trainer kan later zelf 'Maak verslag' klikken in de portal", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    mockGenerateStructuredOutput.mockRejectedValue(new Error("AI-provider onbereikbaar"));
    await verwerkOpnameStatus(payload, maakFakeProvider(), oproepId, {});

    const verslagRij = collection("training-verslagen")[0]!;
    expect(verslagRij.trainerInvoer).toBe("Vandaag rekenen gedaan, het ging goed.");
    expect(verslagRij.definitieveTekst ?? null).toBeNull();

    const oproepRij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(oproepRij.status).toBe("concept_klaar");
  });

  it("scenario 11/24: een dubbele/herhaalde opnamestatuscallback voor dezelfde recordingProviderId verwerkt de opname maar ÉÉN keer, geen tweede concept", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const provider = maakFakeProvider();

    await verwerkOpnameStatus(payload, provider, oproepId, {});
    await verwerkOpnameStatus(payload, provider, oproepId, {});

    expect(mockTranscribeAudio).toHaveBeenCalledTimes(1);
    expect(collection("training-verslagen")).toHaveLength(1);
  });

  it("scenario 11/24 vervolg: een reeds elders geclaimde opname (bv. race met een net iets snellere gelijktijdige callback) wordt door DEZE aanroep stil overgeslagen", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const gewonnen = await claimOpnameVerwerking(payload, oproepId, "RE1", "https://provider.example/recordings/RE1");
    expect(gewonnen).toBe(true);

    await verwerkOpnameStatus(payload, maakFakeProvider(), oproepId, {});

    expect(mockTranscribeAudio).not.toHaveBeenCalled();
    expect(collection("training-verslagen")).toHaveLength(0);
  });

  it("scenario 17/18: het aangemaakte concept is uitsluitend zichtbaar voor de trainer van dit gesprek, nooit voor een andere trainer", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    await verwerkOpnameStatus(payload, maakFakeProvider(), oproepId, {});

    expect(await haalVerslagVoorTraining(payload, TRAINER, TRAINING_ID)).not.toBeNull();
    expect(await haalVerslagVoorTraining(payload, TRAINER_B, TRAINING_ID)).toBeNull();
  });

  it("KRITIEKE ARCHITECTUURTEST (spec §23/§29): het volledige, echte inbound -> kies-training -> opname-status-pad roept op geen enkel moment een Monday-mutatiefunctie aan", async () => {
    verwachtGeenEnkeleMondayMutatie(); // sanity: nog niets aangeroepen
    const oproepId = await oproepKlaarVoorOpname();
    verwachtGeenEnkeleMondayMutatie();
    await verwerkOpnameStatus(payload, maakFakeProvider(), oproepId, {});
    verwachtGeenEnkeleMondayMutatie();

    // Ter vergelijking: het concept bestaat wél degelijk lokaal — dit is dus
    // geen "er gebeurde niets"-vals-positief, uitsluitend "geen Monday-write".
    expect(collection("training-verslagen")).toHaveLength(1);
    expect(collection("training-verslagen")[0]!.status).toBe("concept");
  });

  it("een onverwachte fout (bv. database tijdelijk onbereikbaar) tijdens de call-state-opbouw wordt NIET intern opgevangen — propageert naar de aanroepende route, die 'm afhandelt (spec §19)", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const kapotPayload = {
      ...payload,
      db: {
        drizzle: {
          execute: async () => {
            throw new Error("database tijdelijk onbereikbaar");
          },
        },
      },
    } as unknown as typeof payload;

    await expect(verwerkOpnameStatus(kapotPayload, maakFakeProvider(), oproepId, {})).rejects.toThrow("database tijdelijk onbereikbaar");
  });
});

// ---------------------------------------------------------------------------
// verwerkTelefonieHandmatigeRetry — admin-getriggerde "probeer nu opnieuw"
// (2026-08-25, admin-detailscherm, RetryTelefonieButton.tsx). Hergebruikt
// dezelfde claimEnVerwerkOnderhoudsKandidaat als verwerkTelefonieOnderhoud
// hierboven — deze tests bewijzen vooral de BEPERKING (alleen
// transcriptie_mislukt_herstelbaar, nooit de vastgelopen-categorie) en de
// zelfstandige idempotentie/statuscontrole, niet nogmaals de onderliggende
// claim-atomiciteit (die heeft oproep-state.test.ts/oproep-state.real-postgres.test.ts
// al).
// ---------------------------------------------------------------------------

describe("verwerkTelefonieHandmatigeRetry", () => {
  async function oproepKlaarVoorOpname() {
    mockHaalRecenteTrainingen.mockResolvedValue([training()]);
    const provider = maakFakeProvider();
    await verwerkInkomendeCall(payload, provider, {});
    const oproepId = collection("trainer-telefonie-oproepen")[0]!.id as number;
    await verwerkTrainingKeuze(payload, maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) }), oproepId, {});
    return oproepId;
  }

  async function oproepHerstelbaarMislukt(volgendePogingOffsetMs: number) {
    const oproepId = await oproepKlaarVoorOpname();
    mockTranscribeAudio.mockRejectedValueOnce(new Error("Whisper tijdelijk onbereikbaar"));
    await verwerkOpnameStatus(payload, maakFakeProvider(), oproepId, {});
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("transcriptie_mislukt_herstelbaar"); // sanity check op de test-fixture zelf
    rij.volgendeTranscriptiepoging = new Date(Date.now() + volgendePogingOffsetMs).toISOString();
    return oproepId;
  }

  it("herstelbare rij met verstreken volgende-poging-tijdstip -> 'geclaimd', doorloopt exact hetzelfde verwerkingspad als de cron (concept_klaar + training-verslagen-rij)", async () => {
    const oproepId = await oproepHerstelbaarMislukt(-1000);
    mockTranscribeAudio.mockResolvedValue("Vandaag rekenen gedaan, fijne sfeer.");

    const uitkomst = await verwerkTelefonieHandmatigeRetry(payload, maakFakeProvider(), oproepId);

    expect(uitkomst).toBe("geclaimd");
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("concept_klaar");
    expect(collection("training-verslagen")).toHaveLength(1);
  });

  it("herstelbare rij met een nog toekomstig geplande volgende-poging -> 'nog_niet_zover', geen enkele wijziging (geen bypass van de geplande wachttijd)", async () => {
    const oproepId = await oproepHerstelbaarMislukt(10 * 60 * 1000);

    const uitkomst = await verwerkTelefonieHandmatigeRetry(payload, maakFakeProvider(), oproepId);

    expect(uitkomst).toBe("nog_niet_zover");
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("transcriptie_mislukt_herstelbaar"); // ongewijzigd
    expect(mockTranscribeAudio).toHaveBeenCalledTimes(1); // alleen de oorspronkelijke, mislukte poging — geen nieuwe
  });

  it("een oproep die nog niet gefaald is (bv. 'opname_verwacht') -> 'niet_van_toepassing', geen wijziging", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const rijVoor = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rijVoor.status).toBe("opname_verwacht");

    const uitkomst = await verwerkTelefonieHandmatigeRetry(payload, maakFakeProvider(), oproepId);

    expect(uitkomst).toBe("niet_van_toepassing");
    expect(collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!.status).toBe("opname_verwacht");
  });

  it("een terminaal 'mislukte' oproep -> 'niet_van_toepassing' — bewust geen retrypad voor de terminale status (zie het opleverrapport)", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    rij.status = "mislukt";
    rij.foutcode = "transcriptie_mislukt";
    rij.opnameVerwijderdOp = new Date().toISOString();

    const uitkomst = await verwerkTelefonieHandmatigeRetry(payload, maakFakeProvider(), oproepId);

    expect(uitkomst).toBe("niet_van_toepassing");
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
  });

  // De vastgelopen/crashherstel-categorie (status IN opname_ontvangen/
  // transcriptie_bezig + oud updatedAt) is BEWUST uitgesloten van het
  // handmatige pad — zie verwerkTelefonieHandmatigeRetry se doc-comment.
  // Deze test bewijst dat expliciet: een rij die de cron wél zou claimen,
  // claimt de beheerderknop NIET.
  it("een 'vastgelopen' rij (status='opname_ontvangen', oud updatedAt) -> 'niet_van_toepassing' via het handmatige pad, ook al zou de cron 'm wel claimen", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    const gewonnen = await claimOpnameVerwerking(payload, oproepId, "RE1", "https://provider.example/recordings/RE1");
    expect(gewonnen).toBe(true);
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("opname_ontvangen");
    rij.updatedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // > STUCK_TIMEOUT_MS

    const handmatig = await verwerkTelefonieHandmatigeRetry(payload, maakFakeProvider(), oproepId);
    expect(handmatig).toBe("niet_van_toepassing");
    expect(collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!.status).toBe("opname_ontvangen"); // ongewijzigd

    // Ter vergelijking, in dezelfde testcontext: de cron ZOU deze rij wel claimen.
    const cronResultaat = await verwerkTelefonieOnderhoud(payload, maakFakeProvider());
    expect(cronResultaat.geclaimd).toBe(1);
  });

  it("idempotent: een tweede aanroep op dezelfde, inmiddels al geclaimde rij -> 'niet_van_toepassing', geen dubbele verwerking/tweede concept", async () => {
    const oproepId = await oproepHerstelbaarMislukt(-1000);
    mockTranscribeAudio.mockResolvedValue("Vandaag rekenen gedaan, fijne sfeer.");

    expect(await verwerkTelefonieHandmatigeRetry(payload, maakFakeProvider(), oproepId)).toBe("geclaimd");
    expect(await verwerkTelefonieHandmatigeRetry(payload, maakFakeProvider(), oproepId)).toBe("niet_van_toepassing");

    expect(collection("training-verslagen")).toHaveLength(1);
    expect(mockTranscribeAudio).toHaveBeenCalledTimes(2); // 1e mislukte poging + 1 geslaagde handmatige retry, nooit een derde
  });

  it("TRAINER_TELEFONIE_ENABLED uit -> 'niet_van_toepassing', geen verwerking", async () => {
    const oproepId = await oproepHerstelbaarMislukt(-1000);
    vi.stubEnv("TRAINER_TELEFONIE_ENABLED", "false");

    const uitkomst = await verwerkTelefonieHandmatigeRetry(payload, maakFakeProvider(), oproepId);

    expect(uitkomst).toBe("niet_van_toepassing");
  });

  it("een niet-bestaand oproep-ID -> 'niet_van_toepassing', geen fout", async () => {
    const uitkomst = await verwerkTelefonieHandmatigeRetry(payload, maakFakeProvider(), 999999);
    expect(uitkomst).toBe("niet_van_toepassing");
  });
});
