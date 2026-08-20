import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verwerkInkomendeCall, verwerkTrainingKeuze, verwerkOpnameAfgerond, verwerkOpnameStatus } from "./gesprek";
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
// object doorgegeven — geen Twilio-specifieke mock nodig (die staat apart in
// twilio-provider.test.ts).
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
        }) as OpnameStatusGegevens
    ),
    bouwVoiceResponse: () => "<Response/>",
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
    expect(instructies).toEqual([{ soort: "zeg_en_ophangen", tekst: "Deze functie is nog niet beschikbaar." }]);
    expect(collection("trainer-telefonie-oproepen")).toHaveLength(0);
    expect(provider.ontleedInkomendeCall).not.toHaveBeenCalled();
  });

  it("ontbrekend CallSid (structureel onmogelijk via de echte provider) -> niet beschikbaar", async () => {
    const provider = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: "", vanNummerRuw: "+31612345678", nummerVerborgen: false }) });
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    expect(instructies[0]).toEqual({ soort: "zeg_en_ophangen", tekst: "Deze functie is nog niet beschikbaar." });
  });

  it("scenario 3: verborgen/anoniem nummer -> geen enkele trainerherkenning geprobeerd, vaste afwijzingsboodschap", async () => {
    const provider = maakFakeProvider({ ontleedInkomendeCall: () => ({ providerCallId: "CA1", vanNummerRuw: null, nummerVerborgen: true }) });
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    expect(instructies).toEqual([{ soort: "zeg_en_ophangen", tekst: "Ik kan je telefoonnummer niet zien. Bel met een zichtbaar nummer, of log in op de traineromgeving." }]);
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
    expect(instructies).toEqual([{ soort: "zeg_en_ophangen", tekst: "Er is een probleem met het herkennen van je account. Neem contact op met MijnLeerlijn." }]);
    expect(instructies[0]).not.toMatchObject({ tekst: expect.stringContaining("Wessel") });
    expect(mockHaalRecenteTrainingen).not.toHaveBeenCalled();
  });

  it("scenario 28: trainer herkend maar telefonieActief:false -> gepersonaliseerde 'nog niet beschikbaar'-boodschap, geen trainingzoektocht", async () => {
    const { payload: pilotUitPayload } = maakFakePayload({ "trainer-accounts": [trainerRij(TRAINER, { telefonieActief: false })] });
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(pilotUitPayload, provider, {});
    expect(instructies).toEqual([{ soort: "zeg_en_ophangen", tekst: "Hallo Wessel. Telefonische verslaglegging is nog niet beschikbaar voor jouw account." }]);
    expect(mockHaalRecenteTrainingen).not.toHaveBeenCalled();
  });

  it("scenario 8/20: geen recente training gevonden -> boodschap met voornaam, verwijzing naar de traineromgeving", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([]);
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    expect(instructies).toEqual([
      { soort: "zeg_en_ophangen", tekst: "Hallo Wessel. Ik kan geen recente training vinden die bij dit telefoonnummer hoort. Open de traineromgeving om je trainingen te controleren." },
    ]);
    const rij = collection("trainer-telefonie-oproepen")[0]!;
    expect(rij.status).toBe("mislukt");
    expect(rij.foutcode).toBe("geen_training_gevonden");
  });

  it("scenario 5: precies één training -> ja/nee-bevestiging via DTMF, oproeprij op trainer_herkend met de kandidaat opgeslagen", async () => {
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
    expect(instructie.maxCijfers).toBe(1);
    expect(instructie.actieUrl).toContain("kies-training?oproepId=");

    const rij = collection("trainer-telefonie-oproepen")[0]!;
    expect(rij.status).toBe("trainer_herkend");
    expect(rij.trainer).toBe(TRAINER.id);
    expect(rij.kandidaatTrainingen).toHaveLength(1);
  });

  it("scenario 6: meerdere trainingen -> genummerde keuzelijst, elke optie herkenbaar via schoolnaam", async () => {
    mockHaalRecenteTrainingen.mockResolvedValue([
      training({ id: "111", schoolNaam: "Montessorischool Merlijn", datum: vandaagIsoAmsterdam() }),
      training({ id: "222", schoolNaam: "CBS de Wereld", datum: vandaagIsoAmsterdam() }),
    ]);
    const provider = maakFakeProvider();
    const instructies = await verwerkInkomendeCall(payload, provider, {});
    const instructie = instructies[0]!;
    expect(instructie.soort).toBe("zeg_en_kies_cijfers");
    if (instructie.soort !== "zeg_en_kies_cijfers") return;
    expect(instructie.tekst).toContain("Zeg 1 voor Montessorischool Merlijn");
    expect(instructie.tekst).toContain("Zeg 2 voor CBS de Wereld");
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
    expect(instructies[0]).toEqual({ soort: "zeg_en_ophangen", tekst: "Deze functie is nog niet beschikbaar." });
  });

  it("scenario 5 vervolg: cijfer 1 (ja) bij één kandidaat -> bevestigd, status opname_verwacht, Record-instructie met de juiste callback-URL's", async () => {
    const oproepId = await herkendeOproep([training()]);
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "1" }) });

    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});

    expect(instructies).toHaveLength(1);
    const instructie = instructies[0]!;
    expect(instructie.soort).toBe("zeg_en_neem_op");
    if (instructie.soort !== "zeg_en_neem_op") return;
    expect(instructie.actieUrl).toContain(`opname-afgerond?oproepId=${oproepId}`);
    expect(instructie.statusCallbackUrl).toContain(`opname-status?oproepId=${oproepId}`);
    expect(instructie.maxDuurSeconden).toBe(900);
    expect(instructie.stopToets).toBe("#");

    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("opname_verwacht");
    expect(rij.gekozenMondayTrainingId).toBe(TRAINING_ID);
    expect(rij.gekozenMondaySchoolId).toBe(SCHOOL_ID);
    expect(rij.gekozenMondayTrainerboardItemId).toBe(TRAINERBOARD_ITEM_ID);
  });

  it("cijfer 2 (nee) bij één kandidaat -> afgewezen, geen training gekozen", async () => {
    const oproepId = await herkendeOproep([training()]);
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "2" }) });
    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});
    expect(instructies[0]!.soort).toBe("zeg_en_ophangen");
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("mislukt");
    expect(rij.foutcode).toBe("geen_keuze_gemaakt");
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

  it("ongeldig cijfer (buiten bereik) -> geen keuze gemaakt, geen training vastgelegd", async () => {
    const kandidaten = [training({ id: "111" }), training({ id: "222" })];
    const oproepId = await herkendeOproep(kandidaten);
    mockHaalRecenteTrainingen.mockResolvedValue(kandidaten);
    const provider = maakFakeProvider({ ontleedGatherResultaat: () => ({ cijfers: "9" }) });
    const instructies = await verwerkTrainingKeuze(payload, provider, oproepId, {});
    expect(instructies[0]!.soort).toBe("zeg_en_ophangen");
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("mislukt");
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

    expect(instructies[0]).toEqual({ soort: "zeg_en_ophangen", tekst: "Deze training is niet meer beschikbaar. Open de traineromgeving om je verslag daar te maken." });
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
  it("TRAINER_TELEFONIE_ENABLED uit -> niet beschikbaar", () => {
    vi.stubEnv("TRAINER_TELEFONIE_ENABLED", "false");
    expect(verwerkOpnameAfgerond()).toEqual([{ soort: "zeg_en_ophangen", tekst: "Deze functie is nog niet beschikbaar." }]);
  });

  it("vaste afsluitende boodschap — benadrukt expliciet dat er nog niets definitief in Monday staat (spec §1/§7)", () => {
    const instructies = verwerkOpnameAfgerond();
    expect(instructies).toHaveLength(1);
    expect(instructies[0]!.tekst).toContain("Er is nog niets definitief opgeslagen in Monday.");
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
      ontleedOpnameStatus: () => ({ providerCallId: "CA1", providerRecordingId: "RE1", status: "mislukt", duurSeconden: null, ophaalReferentie: null }),
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

  it("scenario 14: transcriptie mislukt -> mislukt met foutcode transcriptie_mislukt, geen concept aangemaakt", async () => {
    const oproepId = await oproepKlaarVoorOpname();
    mockTranscribeAudio.mockRejectedValue(new Error("Whisper tijdelijk onbereikbaar"));
    await verwerkOpnameStatus(payload, maakFakeProvider(), oproepId, {});

    expect(collection("training-verslagen")).toHaveLength(0);
    const rij = collection("trainer-telefonie-oproepen").find((d) => d.id === oproepId)!;
    expect(rij.status).toBe("mislukt");
    expect(rij.foutcode).toBe("transcriptie_mislukt");
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
    const gewonnen = await claimOpnameVerwerking(payload, oproepId, "RE1");
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
