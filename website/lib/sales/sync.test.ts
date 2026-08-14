import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { verwerkUpdate, herevalueerScholenMetNieuweActiviteit, type SyncResultaat } from "./sync";
import { MIGRATIE_MARKER, probeerGemigreerdeDatumTeExtraheren } from "./monday-columns";
import type { MondayUpdate } from "./monday-client";
import { beoordeelSchool } from "./backfill";
import { genereerEnCacheSchoolSamenvatting } from "./school-summary";

vi.mock("./backfill", () => ({ beoordeelSchool: vi.fn() }));
vi.mock("./school-summary", () => ({ genereerEnCacheSchoolSamenvatting: vi.fn() }));
const mockBeoordeelSchool = vi.mocked(beoordeelSchool);
const mockGenereerSamenvatting = vi.mocked(genereerEnCacheSchoolSamenvatting);

const mockFind = vi.fn();
const mockCreate = vi.fn();

function maakPayload() {
  return { find: mockFind, create: mockCreate } as unknown as Payload;
}

function leegResultaat(): SyncResultaat {
  return { scholenVerwerkt: 0, scholenNieuw: 0, scholenBijgewerkt: 0, updatesNieuw: 0, updatesOvergeslagen: 0, nieuweVoorstellenViaSync: 0, samenvattingenVernieuwd: 0, fouten: [] };
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
    expect(call.data.payload).toEqual({ gemigreerd: false, datumOnzeker: false, tekstlengte: expect.any(Number) });
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
