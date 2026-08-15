import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { verwerkUpdate, verwerkSchoolItem, herevalueerScholenMetNieuweActiviteit, synchroniseerUpdates, type SyncResultaat } from "./sync";
import { MIGRATIE_MARKER, probeerGemigreerdeDatumTeExtraheren, SCHOLEN_KOLOM } from "./monday-columns";
import type { MondayUpdate, MondaySchoolItem } from "./monday-client";
import { haalRecenteUpdates } from "./monday-client";
import type { VariantVoorTypeSchoolMapping } from "./education-type-sync";
import { beoordeelSchool } from "./backfill";
import { genereerEnCacheSchoolSamenvatting } from "./school-summary";
import { schrijfDatumLaatsteContactTerug } from "./writeback";

vi.mock("./backfill", () => ({ beoordeelSchool: vi.fn() }));
vi.mock("./school-summary", () => ({ genereerEnCacheSchoolSamenvatting: vi.fn() }));
vi.mock("./monday-client", () => ({ haalScholenPagina: vi.fn(), haalRecenteUpdates: vi.fn() }));
vi.mock("./writeback", () => ({ schrijfDatumLaatsteContactTerug: vi.fn() }));
const mockBeoordeelSchool = vi.mocked(beoordeelSchool);
const mockGenereerSamenvatting = vi.mocked(genereerEnCacheSchoolSamenvatting);
const mockHaalRecenteUpdates = vi.mocked(haalRecenteUpdates);
const mockSchrijfLaatsteContact = vi.mocked(schrijfDatumLaatsteContactTerug);

const mockFind = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

function maakPayload() {
  return { find: mockFind, create: mockCreate, update: mockUpdate } as unknown as Payload;
}

function leegResultaat(): SyncResultaat {
  return {
    scholenVerwerkt: 0,
    scholenNieuw: 0,
    scholenBijgewerkt: 0,
    updatesNieuw: 0,
    updatesOvergeslagen: 0,
    nieuweVoorstellenViaSync: 0,
    samenvattingenVernieuwd: 0,
    onderwijstypeOnbekend: [],
    fouten: [],
  };
}

function maakUpdate(overrides: Partial<MondayUpdate> = {}): MondayUpdate {
  return {
    id: "u1",
    item_id: "12770146980",
    text_body: "Beste Bianca, leuk dat je contact opnam.",
    created_at: "2026-08-11T06:43:57.000Z",
    updated_at: "2026-08-11T06:43:57.000Z",
    creator: { id: "2496953", name: "Michel de Hond" },
    ...overrides,
  };
}

describe("verwerkUpdate — idempotentie en migratiedetectie", () => {
  beforeEach(() => {
    mockFind.mockReset();
    mockCreate.mockReset();
  });

  it("slaat een Update over die al als sourceExternalId bestaat — voorkomt duplicaten bij overlappende sync-vensters", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 1 }] });
    const resultaat = leegResultaat();
    const schoolMap = new Map([["12770146980", 42]]);

    const uitkomst = await verwerkUpdate(maakPayload(), maakUpdate(), schoolMap, resultaat);

    expect(uitkomst).toBeNull();
    expect(resultaat.updatesOvergeslagen).toBe(1);
    expect(resultaat.updatesNieuw).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("negeert een Update op een item dat niet als sales-school gesynchroniseerd is (geen matching schoolId)", async () => {
    const resultaat = leegResultaat();
    const schoolMap = new Map<string, number>(); // leeg — geen enkel item bekend

    const uitkomst = await verwerkUpdate(maakPayload(), maakUpdate(), schoolMap, resultaat);

    expect(uitkomst).toBeNull();
    expect(mockFind).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("maakt een nieuwe, geminimaliseerde sales-log-events-regel aan voor een echt nieuwe Update — geen volledige ruwe tekst in payload", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({ id: 5 });
    const resultaat = leegResultaat();
    const schoolMap = new Map([["12770146980", 42]]);

    const uitkomst = await verwerkUpdate(maakPayload(), maakUpdate({ text_body: "Beste Bianca,\nLeuk dat je contact opnam met MijnLeerlijn." }), schoolMap, resultaat);

    expect(uitkomst).toEqual({ occurredAt: "2026-08-11T06:43:57.000Z", gemigreerd: false, schoolId: 42 });
    expect(resultaat.updatesNieuw).toBe(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0]![0];
    expect(call.collection).toBe("sales-log-events");
    expect(call.data.school).toBe(42);
    expect(call.data.sourceExternalId).toBe("u1");
    expect(call.data.summary).not.toContain("MijnLeerlijn.\nLeuk"); // geen letterlijke meerregelige ruwe tekst
    expect(call.data.summary.length).toBeLessThanOrEqual(161); // 160 + ellipsis
    expect(call.data.payload).toEqual({ gemigreerd: false, datumOnzeker: false, tekstlengte: expect.any(Number), auteur: "Michel de Hond" });
    expect(call.data.payload.tekstlengte).toBeGreaterThan(0);
  });

  it("herkent een gemigreerde Update en markeert die als zodanig — telt niet als actueel contactmoment", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({ id: 6 });
    const resultaat = leegResultaat();
    const schoolMap = new Map([["12752866980", 7]]);

    const uitkomst = await verwerkUpdate(
      maakPayload(),
      maakUpdate({
        id: "u2",
        item_id: "12752866980",
        text_body: `${MIGRATIE_MARKER} (oud Sales-board)\nOude salesgroep: Beslissen\nLaatste contact: 2026-07-15`,
        created_at: "2026-08-08T13:20:30.000Z",
      }),
      schoolMap,
      resultaat
    );

    expect(uitkomst?.gemigreerd).toBe(true);
    const call = mockCreate.mock.calls[0]![0];
    expect(call.data.payload.gemigreerd).toBe(true);
  });

  it("schoont een e-mailadres/telefoonnummer in de samenvatting — geen volledige contactgegevens lokaal bewaard", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({ id: 7 });
    const resultaat = leegResultaat();
    const schoolMap = new Map([["12770146980", 42]]);

    await verwerkUpdate(maakPayload(), maakUpdate({ text_body: "Bel me op 06-12345678 of mail naar test@school.nl" }), schoolMap, resultaat);

    const call = mockCreate.mock.calls[0]![0];
    expect(call.data.summary).not.toContain("test@school.nl");
    expect(call.data.summary).not.toContain("06-12345678");
  });

  it("corrigeert occurredAt naar de echte datum wanneer die betrouwbaar herkend wordt in een gemigreerde Update", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({ id: 8 });
    const resultaat = leegResultaat();
    const schoolMap = new Map([["12752866980", 7]]);
    const tekst = `${MIGRATIE_MARKER} (oud Sales-board)\n13/March/2026: laatste contact.`;

    const uitkomst = await verwerkUpdate(maakPayload(), maakUpdate({ item_id: "12752866980", text_body: tekst, created_at: "2026-08-08T13:20:30.000Z" }), schoolMap, resultaat);

    const verwachteDatum = probeerGemigreerdeDatumTeExtraheren(tekst);
    expect(verwachteDatum).not.toBeNull();
    expect(uitkomst?.occurredAt).toBe(verwachteDatum);
    expect(uitkomst?.occurredAt).not.toBe("2026-08-08T13:20:30.000Z"); // niet meer de migratiedatum
    const call = mockCreate.mock.calls[0]![0];
    expect(call.data.occurredAt).toBe(verwachteDatum);
    expect(call.data.payload.datumOnzeker).toBe(false);
  });

  it("valt terug op de migratiedatum (bestaand gedrag) én markeert datumOnzeker wanneer geen betrouwbaar patroon herkend wordt", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({ id: 9 });
    const resultaat = leegResultaat();
    const schoolMap = new Map([["12752866980", 7]]);

    const uitkomst = await verwerkUpdate(
      maakPayload(),
      maakUpdate({ item_id: "12752866980", text_body: `${MIGRATIE_MARKER} (oud Sales-board)\nOude salesgroep: Beslissen`, created_at: "2026-08-08T13:20:30.000Z" }),
      schoolMap,
      resultaat
    );

    expect(uitkomst?.occurredAt).toBe("2026-08-08T13:20:30.000Z");
    expect(mockCreate.mock.calls[0]![0].data.payload.datumOnzeker).toBe(true);
  });

  it("verandert de datum van een NIET-gemigreerde Update nooit — occurredAt blijft update.created_at", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    mockCreate.mockResolvedValue({ id: 10 });
    const resultaat = leegResultaat();
    const schoolMap = new Map([["12770146980", 42]]);

    const uitkomst = await verwerkUpdate(maakPayload(), maakUpdate({ text_body: "13/March/2026 komt hier toevallig ook in voor, maar dit is geen gemigreerd bericht." }), schoolMap, resultaat);

    expect(uitkomst?.occurredAt).toBe("2026-08-11T06:43:57.000Z"); // = maakUpdate()'s default created_at, ongewijzigd
  });
});

// Sales UX-ronde 3 (2026-08-14) — regressietests voor de bevestigde root
// cause "Type school ingevuld in Monday + Sync nu, maar Onderwijstype blijft
// leeg": verwerkSchoolItem las dropdown_mm4v9rvg nooit uit. De 5 scenario's
// hieronder zijn letterlijk de opdrachtseis.
describe("verwerkSchoolItem — onderwijstype-sync", () => {
  const MONTESSORI: VariantVoorTypeSchoolMapping = { id: 1, educationType: "montessori" };
  const ALGEMEEN: VariantVoorTypeSchoolMapping = { id: 2, educationType: "algemeen" };

  function maakSchoolItem(typeSchoolTekst: string | null): MondaySchoolItem {
    return {
      id: "999",
      name: "Testschool",
      updated_at: "2026-08-14T00:00:00.000Z",
      column_values: [
        { id: SCHOLEN_KOLOM.relatiestatus, text: "Prospect", value: null },
        { id: SCHOLEN_KOLOM.typeSchool, text: typeSchoolTekst, value: null },
      ],
    };
  }

  beforeEach(() => {
    mockFind.mockReset();
    mockCreate.mockReset().mockResolvedValue({ id: 1 });
    mockUpdate.mockReset().mockResolvedValue({ id: 1 });
  });

  it("nieuw schoolitem met Type school: onderwijstype wordt direct gezet bij het aanmaken", async () => {
    mockFind.mockResolvedValue({ docs: [] }); // nog geen bestaande sales-school
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakSchoolItem("Montessori"), resultaat, [MONTESSORI]);

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ onderwijstype: 1 }) }));
    expect(resultaat.onderwijstypeOnbekend).toEqual([]);
  });

  it("bestaand schoolitem krijgt later Type school: wordt bijgewerkt bij een volgende sync", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 55 }] }); // bestaande school, nog geen onderwijstype
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakSchoolItem("Montessori"), resultaat, [MONTESSORI]);

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 55, data: expect.objectContaining({ onderwijstype: 1 }) }));
  });

  it("Type school verandert: een volgende sync werkt de al gezette waarde bij naar de nieuwe variant", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 55 }] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakSchoolItem("Algemeen"), resultaat, [MONTESSORI, ALGEMEEN]);

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 55, data: expect.objectContaining({ onderwijstype: 2 }) }));
  });

  it("onbekende/niet-mapbare waarde: schrijft NIETS weg (verzint geen variant) en markeert het expliciet als onbekend", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 55 }] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakSchoolItem("Domein onderwijs"), resultaat, [MONTESSORI]);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0]![0].data).not.toHaveProperty("onderwijstype");
    expect(resultaat.onderwijstypeOnbekend).toEqual(["Testschool (Domein onderwijs)"]);
  });

  it("lege waarde in Monday: schrijft onderwijstype niet weg — een bestaande waarde wordt nooit stil overschreven door een lege cel", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 55 }] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakSchoolItem(null), resultaat, [MONTESSORI]);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0]![0].data).not.toHaveProperty("onderwijstype");
    expect(resultaat.onderwijstypeOnbekend).toEqual([]);
  });

  it("blijft variant-geïsoleerd: matcht uitsluitend op de exacte educationType-waarde, nooit op een andere variant", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakSchoolItem("Algemeen"), resultaat, [MONTESSORI]);

    expect(mockCreate.mock.calls[0]![0].data).not.toHaveProperty("onderwijstype");
    expect(resultaat.onderwijstypeOnbekend).toEqual(["Testschool (Algemeen)"]);
  });
});

// Sales UX V2 (2026-08-14) — proactieve AI-herevaluatie na nieuwe, echte
// Monday-activiteit. Expliciete bouweis: nooit voor Klant/Gestopt/Inactief,
// nooit voor scholen zonder nieuwe activiteit deze sync-run, fouten per
// school geïsoleerd (blokkeren de rest van de sync niet).
describe("herevalueerScholenMetNieuweActiviteit", () => {
  const SCHOOL_ACTIEF = { id: 1, schoolName: "Actieve school", mondayItemId: "111", actief: true };
  const SCHOOL_KLANT = { id: 2, schoolName: "Klantschool", mondayItemId: "222", actief: false };

  beforeEach(() => {
    mockBeoordeelSchool.mockReset().mockResolvedValue({ schoolId: 1, schoolName: "x", uitkomst: "ai_voorstel_klaar", proposalId: 500 });
    mockGenereerSamenvatting.mockReset().mockResolvedValue("Samenvatting.");
  });

  it("beoordeelt en vernieuwt de samenvatting uitsluitend voor scholen met nieuwe activiteit deze run", async () => {
    const resultaat = leegResultaat();
    const laatsteEchteActiviteit = new Map([[1, "2026-08-14T00:00:00.000Z"]]);

    await herevalueerScholenMetNieuweActiviteit(maakPayload(), [SCHOOL_ACTIEF, SCHOOL_KLANT], laatsteEchteActiviteit, resultaat);

    expect(mockBeoordeelSchool).toHaveBeenCalledTimes(1);
    expect(mockBeoordeelSchool).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 1 }));
    expect(mockGenereerSamenvatting).toHaveBeenCalledTimes(1);
    expect(mockGenereerSamenvatting).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it("slaat een niet-actieve school (Klant/Gestopt/Inactief) altijd over, ook met nieuwe activiteit", async () => {
    const resultaat = leegResultaat();
    const laatsteEchteActiviteit = new Map([[2, "2026-08-14T00:00:00.000Z"]]);

    await herevalueerScholenMetNieuweActiviteit(maakPayload(), [SCHOOL_ACTIEF, SCHOOL_KLANT], laatsteEchteActiviteit, resultaat);

    expect(mockBeoordeelSchool).not.toHaveBeenCalled();
    expect(mockGenereerSamenvatting).not.toHaveBeenCalled();
  });

  it("telt nieuweVoorstellenViaSync op wanneer beoordeelSchool een voorstel klaar meldt", async () => {
    const resultaat = leegResultaat();
    mockBeoordeelSchool.mockResolvedValue({ schoolId: 1, schoolName: "x", uitkomst: "ai_voorstel_klaar", proposalId: 500 });

    await herevalueerScholenMetNieuweActiviteit(maakPayload(), [SCHOOL_ACTIEF], new Map([[1, "2026-08-14T00:00:00.000Z"]]), resultaat);

    expect(resultaat.nieuweVoorstellenViaSync).toBe(1);
  });

  it("telt niet op wanneer de uitkomst 'onvoldoende_context' of 'vervolgactie_bestaat' is", async () => {
    const resultaat = leegResultaat();
    mockBeoordeelSchool.mockResolvedValue({ schoolId: 1, schoolName: "x", uitkomst: "onvoldoende_context" });

    await herevalueerScholenMetNieuweActiviteit(maakPayload(), [SCHOOL_ACTIEF], new Map([[1, "2026-08-14T00:00:00.000Z"]]), resultaat);

    expect(resultaat.nieuweVoorstellenViaSync).toBe(0);
  });

  it("isoleert een fout bij één school — blokkeert de rest van de herevaluatie niet", async () => {
    const resultaat = leegResultaat();
    mockBeoordeelSchool.mockRejectedValueOnce(new Error("AI-service tijdelijk niet bereikbaar"));

    await herevalueerScholenMetNieuweActiviteit(maakPayload(), [SCHOOL_ACTIEF], new Map([[1, "2026-08-14T00:00:00.000Z"]]), resultaat);

    expect(resultaat.fouten.length).toBe(1);
    expect(resultaat.fouten[0]).toContain("AI-service tijdelijk niet bereikbaar");
    // De samenvatting wordt nog steeds geprobeerd, ook al faalde de AI-beoordeling.
    expect(mockGenereerSamenvatting).toHaveBeenCalledTimes(1);
  });

  it("een fout bij het vernieuwen van de samenvatting blokkeert de AI-beoordeling van diezelfde school niet (was al gelukt)", async () => {
    const resultaat = leegResultaat();
    mockGenereerSamenvatting.mockRejectedValueOnce(new Error("PII-scrub mislukt"));

    await herevalueerScholenMetNieuweActiviteit(maakPayload(), [SCHOOL_ACTIEF], new Map([[1, "2026-08-14T00:00:00.000Z"]]), resultaat);

    expect(resultaat.nieuweVoorstellenViaSync).toBe(1);
    expect(resultaat.fouten.length).toBe(1);
  });
});

// Relatie-analyse V1 (2026-08-15) — "Datum laatste contact mag automatisch
// worden bijgewerkt als het laatste echte contact betrouwbaar is
// vastgesteld" (opdrachtseis). schrijfDatumLaatsteContactTerug bestond al
// (writeback.ts, eigen tests) maar werd nergens aangeroepen — dit sluit die
// hiaat.
describe("synchroniseerUpdates — automatische write-back van 'Datum laatste contact'", () => {
  const SCHOOL = { id: 1, mondayItemId: "111", lastMondayActivityAt: null };

  beforeEach(() => {
    mockFind.mockReset();
    mockCreate.mockReset().mockResolvedValue({ id: 999 });
    mockUpdate.mockReset().mockResolvedValue({ id: 1 });
    mockHaalRecenteUpdates.mockReset();
    mockSchrijfLaatsteContact.mockReset().mockResolvedValue({ status: "geschreven", boodschap: "ok" });
    mockBeoordeelSchool.mockReset();
    mockGenereerSamenvatting.mockReset();

    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [SCHOOL] });
      if (collection === "sales-log-events") return Promise.resolve({ docs: [] }); // nooit al bestaand -> verwerkUpdate slaat niet over
      return Promise.resolve({ docs: [] });
    });
  });

  it("schrijft de nieuwste, betrouwbare (niet-gemigreerde) contactdatum automatisch terug naar Monday", async () => {
    mockHaalRecenteUpdates.mockResolvedValue([
      { id: "u1", item_id: "111", text_body: "Kort telefoongesprek.", created_at: "2026-08-14T00:00:00.000Z", updated_at: "x", creator: null },
    ]);
    const resultaat = leegResultaat();

    await synchroniseerUpdates(maakPayload(), resultaat, new Date("2026-01-01"));

    expect(mockSchrijfLaatsteContact).toHaveBeenCalledWith(expect.anything(), 1, "111", "2026-08-14T00:00:00.000Z");
  });

  it("schrijft NIET terug wanneer de enige nieuwe activiteit gemigreerde geschiedenis is — die telt nooit als betrouwbaar laatste contact", async () => {
    mockHaalRecenteUpdates.mockResolvedValue([
      { id: "u1", item_id: "111", text_body: `${MIGRATIE_MARKER} (oud Sales-board)\nOude notitie.`, created_at: "2026-08-14T00:00:00.000Z", updated_at: "x", creator: null },
    ]);
    const resultaat = leegResultaat();

    await synchroniseerUpdates(maakPayload(), resultaat, new Date("2026-01-01"));

    expect(mockSchrijfLaatsteContact).not.toHaveBeenCalled();
  });

  it("isoleert een write-back-fout — blokkeert de rest van de sync niet, logt de fout in resultaat.fouten", async () => {
    mockHaalRecenteUpdates.mockResolvedValue([
      { id: "u1", item_id: "111", text_body: "Contact.", created_at: "2026-08-14T00:00:00.000Z", updated_at: "x", creator: null },
    ]);
    mockSchrijfLaatsteContact.mockRejectedValue(new Error("Monday API-aanroep mislukt (HTTP 500)."));
    const resultaat = leegResultaat();

    await synchroniseerUpdates(maakPayload(), resultaat, new Date("2026-01-01"));

    expect(resultaat.fouten.some((f) => f.includes("Monday API-aanroep mislukt"))).toBe(true);
    expect(resultaat.updatesNieuw).toBe(1); // het logboek-record zelf is wel gewoon aangemaakt, ondanks de write-back-fout
  });

  it("gebruikt de MEEST RECENTE betrouwbare datum en schrijft per school maar één keer terug, ook bij meerdere nieuwe Updates", async () => {
    mockHaalRecenteUpdates.mockResolvedValue([
      { id: "u1", item_id: "111", text_body: "Ouder contact.", created_at: "2026-08-01T00:00:00.000Z", updated_at: "x", creator: null },
      { id: "u2", item_id: "111", text_body: "Recenter contact.", created_at: "2026-08-14T00:00:00.000Z", updated_at: "x", creator: null },
    ]);
    const resultaat = leegResultaat();

    await synchroniseerUpdates(maakPayload(), resultaat, new Date("2026-01-01"));

    expect(mockSchrijfLaatsteContact).toHaveBeenCalledTimes(1);
    expect(mockSchrijfLaatsteContact).toHaveBeenCalledWith(expect.anything(), 1, "111", "2026-08-14T00:00:00.000Z");
  });
});
