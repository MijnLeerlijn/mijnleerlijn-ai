import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import {
  verwerkUpdate,
  verwerkSchoolItem,
  herevalueerScholenMetNieuweActiviteit,
  synchroniseerUpdates,
  synchroniseerScholen,
  reconcilieerVerwijderdeScholen,
  synchroniseerScholenBoard,
  bewaarSyncStatus,
  haalLaatsteSyncStatus,
  type SyncResultaat,
} from "./sync";
import { MIGRATIE_MARKER, probeerGemigreerdeDatumTeExtraheren, SCHOLEN_KOLOM, SCHOLEN_BOARD_ID } from "./monday-columns";
import type { MondayUpdate, MondaySchoolItem } from "./monday-client";
import { haalRecenteUpdates, haalScholenPagina } from "./monday-client";
import type { VariantVoorTypeSchoolMapping } from "./education-type-sync";
import { beoordeelSchool } from "./backfill";
import { genereerEnCacheSchoolSamenvatting } from "./school-summary";
import { schrijfDatumLaatsteContactTerug } from "./writeback";
import { bepaalGeplandeActie } from "./actie-extractie";

vi.mock("./backfill", () => ({ beoordeelSchool: vi.fn() }));
vi.mock("./school-summary", () => ({ genereerEnCacheSchoolSamenvatting: vi.fn() }));
vi.mock("./monday-client", () => ({ haalScholenPagina: vi.fn(), haalRecenteUpdates: vi.fn() }));
vi.mock("./writeback", () => ({ schrijfDatumLaatsteContactTerug: vi.fn() }));
vi.mock("./actie-extractie", () => ({ bepaalGeplandeActie: vi.fn() }));
const mockBeoordeelSchool = vi.mocked(beoordeelSchool);
const mockGenereerSamenvatting = vi.mocked(genereerEnCacheSchoolSamenvatting);
const mockHaalRecenteUpdates = vi.mocked(haalRecenteUpdates);
const mockHaalScholenPagina = vi.mocked(haalScholenPagina);
const mockSchrijfLaatsteContact = vi.mocked(schrijfDatumLaatsteContactTerug);
const mockBepaalGeplandeActie = vi.mocked(bepaalGeplandeActie);

const mockFind = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateGlobal = vi.fn();
const mockFindGlobal = vi.fn();

function maakPayload() {
  return { find: mockFind, create: mockCreate, update: mockUpdate, updateGlobal: mockUpdateGlobal, findGlobal: mockFindGlobal } as unknown as Payload;
}

function leegResultaat(): SyncResultaat {
  return {
    scholenVerwerkt: 0,
    scholenNieuw: 0,
    scholenBijgewerkt: 0,
    scholenGewijzigd: 0,
    updatesNieuw: 0,
    updatesOvergeslagen: 0,
    nieuweVoorstellenViaSync: 0,
    samenvattingenVernieuwd: 0,
    onderwijstypeOnbekend: [],
    fouten: [],
    scholenVanBoardGehaald: 0,
    verouderdeVoorstellenGesloten: 0,
    bestaandePlanningenHerkend: 0,
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

describe("verwerkSchoolItem — scholenGewijzigd-teller (productiecorrectie 2026-08-16, punt 1/3)", () => {
  function maakVolledigItem(overrides: { relatiestatus?: string | null; salesfase?: string | null; datumVolgendeActie?: string | null; typeSchool?: string | null } = {}): MondaySchoolItem {
    return {
      id: "999",
      name: "Testschool",
      updated_at: "2026-08-16T00:00:00.000Z",
      column_values: [
        { id: SCHOLEN_KOLOM.relatiestatus, text: overrides.relatiestatus ?? "Prospect", value: null },
        { id: SCHOLEN_KOLOM.salesfase, text: overrides.salesfase ?? "Eerste contact", value: null },
        { id: SCHOLEN_KOLOM.datumVolgendeActie, text: overrides.datumVolgendeActie ?? null, value: null },
        { id: SCHOLEN_KOLOM.typeSchool, text: overrides.typeSchool ?? null, value: null },
      ],
    };
  }
  const MONTESSORI: VariantVoorTypeSchoolMapping = { id: 1, educationType: "montessori" };

  beforeEach(() => {
    mockFind.mockReset();
    mockCreate.mockReset().mockResolvedValue({ id: 1 });
    mockUpdate.mockReset().mockResolvedValue({ id: 1 });
  });

  it("telt een school NIET mee bij het aanmaken (create-pad) — er is nog geen 'oud' om mee te vergelijken", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakVolledigItem(), resultaat, []);

    expect(resultaat.scholenGewijzigd).toBe(0);
  });

  it("telt niet mee wanneer geen van de 4 kernvelden verschilt", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 55, relatiestatus: "Prospect", salesfase: "Eerste contact", mondayVolgendeActieDatum: null, onderwijstype: null }] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakVolledigItem(), resultaat, []);

    expect(resultaat.scholenGewijzigd).toBe(0);
  });

  it("telt mee wanneer Relatiestatus verandert", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 55, relatiestatus: "Lead", salesfase: "Eerste contact", mondayVolgendeActieDatum: null, onderwijstype: null }] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakVolledigItem({ relatiestatus: "Prospect" }), resultaat, []);

    expect(resultaat.scholenGewijzigd).toBe(1);
  });

  it("regressietest punt 4 — bestaand schoolrecord Prospect wordt Lead in Monday: na sync is de lokale Relatiestatus exact Lead", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 90, relatiestatus: "Prospect", salesfase: "Eerste contact", mondayVolgendeActieDatum: null, onderwijstype: null }] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakVolledigItem({ relatiestatus: "Lead" }), resultaat, []);

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 90, data: expect.objectContaining({ relatiestatus: "Lead" }) }));
    expect(resultaat.scholenGewijzigd).toBe(1);
    // De UI-badge zelf (RelatiestatusBadge) leest dit veld rechtstreeks over —
    // zie lib/sales/relatiestatus-badge.test.ts voor de badge-mapping, en de
    // Playwright-verificatie in het opleverrapport voor de daadwerkelijke
    // schermweergave (dit bestand test uitsluitend lib-logica, geen UI).
  });

  it("telt mee wanneer Salesfase verandert", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 55, relatiestatus: "Prospect", salesfase: "Afspraak plannen", mondayVolgendeActieDatum: null, onderwijstype: null }] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakVolledigItem({ salesfase: "Eerste contact" }), resultaat, []);

    expect(resultaat.scholenGewijzigd).toBe(1);
  });

  it("telt mee wanneer Datum volgende actie verandert", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 55, relatiestatus: "Prospect", salesfase: "Eerste contact", mondayVolgendeActieDatum: "2026-08-01", onderwijstype: null }] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakVolledigItem({ datumVolgendeActie: "2026-11-03" }), resultaat, []);

    expect(resultaat.scholenGewijzigd).toBe(1);
  });

  it("telt mee wanneer Type school (onderwijstype) verandert", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 55, relatiestatus: "Prospect", salesfase: "Eerste contact", mondayVolgendeActieDatum: null, onderwijstype: null }] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakVolledigItem({ typeSchool: "Montessori" }), resultaat, [MONTESSORI]);

    expect(resultaat.scholenGewijzigd).toBe(1);
  });

  it("telt niet mee wanneer Monday's Type-school-cel leeg is — geen vergelijking, een bestaande waarde blijft met rust", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 55, relatiestatus: "Prospect", salesfase: "Eerste contact", mondayVolgendeActieDatum: null, onderwijstype: 1 }] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakVolledigItem({ typeSchool: null }), resultaat, [MONTESSORI]);

    expect(resultaat.scholenGewijzigd).toBe(0);
  });
});

// Productiecorrectie 2026-08-16 (punt 14) — expliciet genoemd testscenario:
// fixture-school "2de Montessorischool Winterkoninkje", Relatiestatus=Lead,
// Salesfase=Afspraak plannen, Datum volgende actie=3 november 2026. Dit
// bestand dekt het sync-deel (de upsert schrijft de 3 velden correct weg,
// ook op een bestaand record). De rest van het scenario — "school
// verschijnt niet als 'geen vervolgactie'" en "AI respecteert 3 november
// zonder een concurrerende datum voor te stellen" — staat met dezelfde
// schoolnaam in aandacht-nodig.test.ts resp. relationship-analysis.test.ts,
// zodat de drie lagen samen traceerbaar zijn naar dezelfde opdrachtseis.
describe("verwerkSchoolItem — '2de Montessorischool Winterkoninkje'-scenario (punt 14)", () => {
  function maakWinterkoninkjeItem(): MondaySchoolItem {
    return {
      id: "winterkoninkje-1",
      name: "2de Montessorischool Winterkoninkje",
      updated_at: "2026-08-16T00:00:00.000Z",
      column_values: [
        { id: SCHOLEN_KOLOM.relatiestatus, text: "Lead", value: null },
        { id: SCHOLEN_KOLOM.salesfase, text: "Afspraak plannen", value: null },
        { id: SCHOLEN_KOLOM.datumVolgendeActie, text: "2026-11-03", value: null },
      ],
    };
  }

  beforeEach(() => {
    mockFind.mockReset();
    mockCreate.mockReset().mockResolvedValue({ id: 1 });
    mockUpdate.mockReset().mockResolvedValue({ id: 1 });
  });

  it("schrijft Relatiestatus=Lead, Salesfase=Afspraak plannen, Datum volgende actie=2026-11-03 correct weg bij het aanmaken", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakWinterkoninkjeItem(), resultaat, []);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ relatiestatus: "Lead", salesfase: "Afspraak plannen", mondayVolgendeActieDatum: "2026-11-03" }),
      })
    );
  });

  it("werkt een al bestaand lokaal record bij naar dezelfde 3 waarden — een oude lokale waarde wint nooit", async () => {
    mockFind.mockResolvedValue({
      docs: [{ id: 77, relatiestatus: "Prospect", salesfase: "Eerste contact", mondayVolgendeActieDatum: null, onderwijstype: null }],
    });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakWinterkoninkjeItem(), resultaat, []);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 77,
        data: expect.objectContaining({ relatiestatus: "Lead", salesfase: "Afspraak plannen", mondayVolgendeActieDatum: "2026-11-03" }),
      })
    );
    expect(resultaat.scholenGewijzigd).toBe(1); // alle 3 kernvelden veranderden tegelijk
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

// Sales-logica productiecorrectie 2026-08-16 (punt 1) — "Laatste sync"
// zichtbaar op zowel het dashboard als Sales Overzicht, ongeacht wie/wat de
// sync triggerde (cron of een handmatige knop). Bewaard op het bestaande
// sales-instellingen-global, niet in client-only React-state.
describe("bewaarSyncStatus / haalLaatsteSyncStatus — sync-statusweergave", () => {
  beforeEach(() => {
    mockUpdateGlobal.mockReset().mockResolvedValue({});
    mockFindGlobal.mockReset();
  });

  it("schrijft de sync-uitkomst weg op het sales-instellingen-global", async () => {
    const resultaat = leegResultaat();
    resultaat.scholenVerwerkt = 159;
    resultaat.scholenGewijzigd = 6;
    resultaat.fouten = ["iets ging mis"];

    await bewaarSyncStatus(maakPayload(), resultaat);

    expect(mockUpdateGlobal).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "sales-instellingen",
        data: expect.objectContaining({ laatsteSyncScholenVerwerkt: 159, laatsteSyncWijzigingen: 6, laatsteSyncFouten: 1 }),
      })
    );
  });

  it("een mislukte opslag breekt de sync-run niet — logt zichzelf als fout in resultaat.fouten", async () => {
    mockUpdateGlobal.mockRejectedValue(new Error("Database niet bereikbaar."));
    const resultaat = leegResultaat();

    await expect(bewaarSyncStatus(maakPayload(), resultaat)).resolves.toBeUndefined();

    expect(resultaat.fouten.some((f) => f.includes("Database niet bereikbaar"))).toBe(true);
  });

  it("haalLaatsteSyncStatus geeft de bewaarde velden terug", async () => {
    mockFindGlobal.mockResolvedValue({
      laatsteSyncOp: "2026-08-16T11:58:00.000Z",
      laatsteSyncScholenVerwerkt: 159,
      laatsteSyncWijzigingen: 6,
      laatsteSyncFouten: 0,
      laatsteSyncBestaandePlanningenHerkend: 12,
      laatsteSyncScholenVanBoardGehaald: 1,
      laatsteSyncVerouderdeVoorstellenGesloten: 2,
    });

    const status = await haalLaatsteSyncStatus(maakPayload());

    expect(status).toEqual({
      laatsteSyncOp: "2026-08-16T11:58:00.000Z",
      scholenVerwerkt: 159,
      scholenGewijzigd: 6,
      fouten: 0,
      bestaandePlanningenHerkend: 12,
      scholenVanBoardGehaald: 1,
      verouderdeVoorstellenGesloten: 2,
    });
  });

  it("haalLaatsteSyncStatus geeft null-waarden terug wanneer er nog nooit gesynchroniseerd is", async () => {
    mockFindGlobal.mockResolvedValue({});

    const status = await haalLaatsteSyncStatus(maakPayload());

    expect(status).toEqual({
      laatsteSyncOp: null,
      scholenVerwerkt: null,
      scholenGewijzigd: null,
      fouten: null,
      bestaandePlanningenHerkend: null,
      scholenVanBoardGehaald: null,
      verouderdeVoorstellenGesloten: null,
    });
  });

  it("schrijft de 3 nieuwe reconciliation-/planningstellers mee weg (punt 11)", async () => {
    const resultaat = leegResultaat();
    resultaat.bestaandePlanningenHerkend = 12;
    resultaat.scholenVanBoardGehaald = 1;
    resultaat.verouderdeVoorstellenGesloten = 2;

    await bewaarSyncStatus(maakPayload(), resultaat);

    expect(mockUpdateGlobal).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          laatsteSyncBestaandePlanningenHerkend: 12,
          laatsteSyncScholenVanBoardGehaald: 1,
          laatsteSyncVerouderdeVoorstellenGesloten: 2,
        }),
      })
    );
  });
});

function maakSimpelItem(id: string): MondaySchoolItem {
  return { id, name: `School ${id}`, updated_at: "2026-08-16T00:00:00.000Z", column_values: [{ id: SCHOLEN_KOLOM.relatiestatus, text: "Lead", value: null }] };
}

// Sales-logica productiecorrectie 2026-08-16 (punt 1/12) — veiligheidsregel
// EXPLICIET toegevoegd door Michel: reconciliation mag uitsluitend draaien op
// een complete, foutloze snapshot van board 18420120365. De 3 tests
// hieronder dekken precies de door hem genoemde randgevallen.
describe("synchroniseerScholen — paginering + veiligheidsgate (punt 1/12)", () => {
  beforeEach(() => {
    mockFind.mockReset().mockResolvedValue({ docs: [] }); // upsert-lookup: elk item telt in deze tests als "nieuw"
    mockCreate.mockReset().mockResolvedValue({ id: 1 });
    mockUpdate.mockReset().mockResolvedValue({ id: 1 });
    mockHaalScholenPagina.mockReset();
    mockBepaalGeplandeActie.mockReset();
  });

  it("verzamelt alle item-ID's over meerdere pagina's en geeft succesvolVolledig true terug bij een geslaagde, volledige paginering", async () => {
    mockHaalScholenPagina
      .mockResolvedValueOnce({ items: [maakSimpelItem("1"), maakSimpelItem("2")], cursor: "cursor-2" })
      .mockResolvedValueOnce({ items: [maakSimpelItem("3")], cursor: null });
    const resultaat = leegResultaat();

    const { huidigeItemIds, succesvolVolledig } = await synchroniseerScholen(maakPayload(), resultaat);

    expect(succesvolVolledig).toBe(true);
    expect(huidigeItemIds).toEqual(new Set(["1", "2", "3"]));
  });

  it("API faalt halverwege: stopt de paginering direct, geeft succesvolVolledig false + een ONVOLLEDIGE item-ID-set terug", async () => {
    mockHaalScholenPagina
      .mockResolvedValueOnce({ items: [maakSimpelItem("1")], cursor: "cursor-2" })
      .mockRejectedValueOnce(new Error("Monday API-aanroep mislukt (HTTP 500)."));
    const resultaat = leegResultaat();

    const { huidigeItemIds, succesvolVolledig } = await synchroniseerScholen(maakPayload(), resultaat);

    expect(succesvolVolledig).toBe(false);
    expect(huidigeItemIds).toEqual(new Set(["1"])); // alleen de wél gelukte eerste pagina — nooit als compleet behandelen
    expect(resultaat.fouten.some((f) => f.includes("Scholen-pagina ophalen mislukt"))).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1); // uitsluitend het item van de gelukte pagina, niets ná de fout
  });

  it("0 items ondanks een technisch geslaagde paginering: succesvolVolledig blijft true, maar de set is leeg — de aanroeper beslist hoe dit te interpreteren", async () => {
    mockHaalScholenPagina.mockResolvedValueOnce({ items: [], cursor: null });
    const resultaat = leegResultaat();

    const { huidigeItemIds, succesvolVolledig } = await synchroniseerScholen(maakPayload(), resultaat);

    expect(succesvolVolledig).toBe(true);
    expect(huidigeItemIds.size).toBe(0);
  });
});

// "schoolbestuur Tjongerwerven" (productievoorbeeld, punt 1) — verplaatst
// naar het Besturen-board, dus niet meer op '1: Scholen (Master Data)'.
describe("reconcilieerVerwijderdeScholen — 'schoolbestuur Tjongerwerven'-scenario (punt 1)", () => {
  beforeEach(() => {
    mockFind.mockReset();
    mockCreate.mockReset().mockResolvedValue({ id: 1 });
    mockUpdate.mockReset().mockResolvedValue({ id: 1 });
  });

  it("bevraagt sales-schools uitsluitend op dit board én nog-als-aanwezig-gemarkeerd", async () => {
    mockFind.mockImplementation(({ where }: { where?: Record<string, unknown> }) => {
      expect(where).toEqual({ mondayBoardId: { equals: SCHOLEN_BOARD_ID }, nogOpMondayBoard: { equals: true } });
      return Promise.resolve({ docs: [] });
    });

    await reconcilieerVerwijderdeScholen(maakPayload(), new Set(), leegResultaat());
  });

  it("deactiveert een lokale school die niet meer in de item-ID-set voorkomt: nogOpMondayBoard false, verwijderdVanBoardOp gezet, actief false", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 42, schoolName: "schoolbestuur Tjongerwerven", mondayItemId: "12752900049" }] });
    const resultaat = leegResultaat();
    const huidigeItemIds = new Set(["11111", "22222"]); // Tjongerwerven staat er niet meer bij

    await reconcilieerVerwijderdeScholen(maakPayload(), huidigeItemIds, resultaat);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "sales-schools",
        id: 42,
        data: expect.objectContaining({ nogOpMondayBoard: false, actief: false, verwijderdVanBoardOp: expect.any(String) }),
      })
    );
    expect(resultaat.scholenVanBoardGehaald).toBe(1);
  });

  it("logt een audit-regel i.p.v. de school hard te verwijderen — historie blijft auditeerbaar", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 42, schoolName: "schoolbestuur Tjongerwerven", mondayItemId: "12752900049" }] });
    const resultaat = leegResultaat();

    await reconcilieerVerwijderdeScholen(maakPayload(), new Set(), resultaat);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "sales-log-events", data: expect.objectContaining({ school: 42, type: "systeem", source: "systeem" }) })
    );
  });

  it("raakt een school die WEL nog op het board staat niet aan (bv. 'Springplank')", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 7, schoolName: "Springplank", mondayItemId: "12752900010" }] });
    const resultaat = leegResultaat();

    await reconcilieerVerwijderdeScholen(maakPayload(), new Set(["12752900010"]), resultaat);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(resultaat.scholenVanBoardGehaald).toBe(0);
  });
});

describe("verwerkSchoolItem — reactivatie na terugkeer op het board (punt 1)", () => {
  beforeEach(() => {
    mockFind.mockReset();
    mockCreate.mockReset().mockResolvedValue({ id: 1 });
    mockUpdate.mockReset().mockResolvedValue({ id: 1 });
    mockBepaalGeplandeActie.mockReset();
  });

  it("een eerder van het board gehaalde school die weer in een sync-pagina verschijnt, wordt onvoorwaardelijk weer 'op het board' + actief", async () => {
    mockFind.mockResolvedValue({
      docs: [
        {
          id: 42,
          relatiestatus: "Lead",
          salesfase: null,
          mondayVolgendeActieDatum: null,
          onderwijstype: null,
          nogOpMondayBoard: false,
          verwijderdVanBoardOp: "2026-08-10T00:00:00.000Z",
        },
      ],
    });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakSimpelItem("12752900049"), resultaat, []);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42, data: expect.objectContaining({ nogOpMondayBoard: true, verwijderdVanBoardOp: null, actief: true }) })
    );
  });
});

// Productiecorrectie 2026-08-16 (punt 3/4/5/9) — "Springplank": Relatiestatus
// Lead, Salesfase Afspraak plannen, Datum volgende actie = 24 augustus. Dekt
// hier het sync-deel (supersede + actie-extractie-cache); het AI-deel
// (geen nieuw voorstel wanneer Monday's datum gerespecteerd wordt) staat met
// dezelfde schoolnaam/datum in backfill.test.ts.
describe("verwerkSchoolItem — geldige Monday-planning: supersede + actie-extractie-cache (punt 3/4/5/9)", () => {
  function maakSpringplankItem(datum: string): MondaySchoolItem {
    return {
      id: "12752900010",
      name: "Springplank",
      updated_at: "2026-08-16T00:00:00.000Z",
      column_values: [
        { id: SCHOLEN_KOLOM.relatiestatus, text: "Lead", value: null },
        { id: SCHOLEN_KOLOM.salesfase, text: "Afspraak plannen", value: null },
        { id: SCHOLEN_KOLOM.datumVolgendeActie, text: datum, value: null },
      ],
    };
  }

  function toekomstigeDatum(dagen: number): string {
    const d = new Date();
    d.setDate(d.getDate() + dagen);
    return d.toISOString().slice(0, 10);
  }

  beforeEach(() => {
    mockFind.mockReset();
    mockCreate.mockReset().mockResolvedValue({ id: 1 });
    mockUpdate.mockReset().mockResolvedValue({ id: 1 });
    mockBepaalGeplandeActie.mockReset().mockResolvedValue({
      geplandeActieTekst: "Mail sturen voor afspraak",
      gekoppeldAanDatum: "2026-08-24",
      sourceUpdateIds: ["u1"],
      confidence: "hoog",
    });
  });

  it("sluit een bestaand pending volgende_actie-voorstel als superseded zodra Monday al een geldige vervolgdatum heeft (vangt ook bestaande achterstand van vóór deze fix, punt 9)", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools")
        return Promise.resolve({ docs: [{ id: 7, relatiestatus: "Lead", salesfase: "Afspraak plannen", mondayVolgendeActieDatum: null, onderwijstype: null, cachedGeplandeActieDatum: null }] });
      if (collection === "sales-proposals") return Promise.resolve({ docs: [{ id: 900 }] }); // oud, nog pending voorstel
      return Promise.resolve({ docs: [] });
    });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakSpringplankItem(toekomstigeDatum(10)), resultaat, []);

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ collection: "sales-proposals", id: 900, data: { status: "superseded" } }));
    expect(resultaat.verouderdeVoorstellenGesloten).toBe(1);
  });

  it("geen pending voorstel aanwezig: geen supersede-aanroep, teller blijft 0", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools")
        return Promise.resolve({ docs: [{ id: 7, relatiestatus: "Lead", salesfase: "Afspraak plannen", mondayVolgendeActieDatum: null, onderwijstype: null, cachedGeplandeActieDatum: null }] });
      return Promise.resolve({ docs: [] }); // sales-proposals: leeg
    });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakSpringplankItem(toekomstigeDatum(10)), resultaat, []);

    expect(mockUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ collection: "sales-proposals" }));
    expect(resultaat.verouderdeVoorstellenGesloten).toBe(0);
  });

  it("ververst de gecachte actie-extractie voor een NIEUWE/gewijzigde Monday-datum — 'Mail sturen voor afspraak' gecached op 2026-08-24", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools")
        return Promise.resolve({ docs: [{ id: 7, relatiestatus: "Lead", salesfase: "Afspraak plannen", mondayVolgendeActieDatum: null, onderwijstype: null, cachedGeplandeActieDatum: null }] });
      return Promise.resolve({ docs: [] });
    });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakSpringplankItem("2026-08-24"), resultaat, []);

    expect(mockBepaalGeplandeActie).toHaveBeenCalledWith(
      expect.objectContaining({ schoolName: "Springplank", mondayItemId: "12752900010", salesfase: "Afspraak plannen", mondayVolgendeActieDatum: "2026-08-24" })
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "sales-schools",
        id: 7,
        data: expect.objectContaining({
          cachedGeplandeActieTekst: "Mail sturen voor afspraak",
          cachedGeplandeActieDatum: "2026-08-24",
          cachedGeplandeActieConfidence: "hoog",
          cachedGeplandeActieBronUpdateIds: [{ updateId: "u1" }],
        }),
      })
    );
    expect(resultaat.bestaandePlanningenHerkend).toBe(1);
  });

  it("doet GEEN nieuwe AI-call wanneer de cache al bestaat voor exact dezelfde datum — kostenbewust (punt 4)", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools")
        return Promise.resolve({
          docs: [{ id: 7, relatiestatus: "Lead", salesfase: "Afspraak plannen", mondayVolgendeActieDatum: "2026-08-24", onderwijstype: null, cachedGeplandeActieDatum: "2026-08-24" }],
        });
      return Promise.resolve({ docs: [] });
    });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakSpringplankItem("2026-08-24"), resultaat, []);

    expect(mockBepaalGeplandeActie).not.toHaveBeenCalled();
  });

  it("een school zonder geldige Monday-datum (leeg) triggert geen supersede-/cache-logica", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    const resultaat = leegResultaat();

    await verwerkSchoolItem(maakPayload(), maakSimpelItem("1"), resultaat, []);

    expect(mockBepaalGeplandeActie).not.toHaveBeenCalled();
    expect(resultaat.bestaandePlanningenHerkend).toBe(0);
  });

  it("een VERLOPEN Monday-datum triggert geen supersede-/cache-logica — alleen een niet-verlopen datum telt als 'al gepland'", async () => {
    mockFind.mockResolvedValue({ docs: [] });
    const resultaat = leegResultaat();
    const verlopenDatum = toekomstigeDatum(-30);

    await verwerkSchoolItem(maakPayload(), maakSpringplankItem(verlopenDatum), resultaat, []);

    expect(mockBepaalGeplandeActie).not.toHaveBeenCalled();
    expect(resultaat.bestaandePlanningenHerkend).toBe(0);
  });
});

// End-to-end door de volledige synchroniseerScholenBoard-pijplijn — bevestigt
// dat de veiligheidsgate ZELF (de if-check in synchroniseerScholenBoard)
// correct bedraad is, niet alleen dat synchroniseerScholen() los het juiste
// signaal teruggeeft. Dekt letterlijk de 4 door Michel genoemde testscenario's.
describe("synchroniseerScholenBoard — veiligheidsgate end-to-end (expliciete testscenario's, punt 1/12)", () => {
  function maakRouter(reconciliatieDocs: unknown[]) {
    return ({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
      if (collection === "sales-schools") {
        if (where?.mondayItemId) return Promise.resolve({ docs: [] }); // verwerkSchoolItem-upsert-lookup: telt in deze tests als "nieuw"
        if (where?.nogOpMondayBoard) return Promise.resolve({ docs: reconciliatieDocs });
        return Promise.resolve({ docs: [] }); // synchroniseerUpdates se board-brede find
      }
      return Promise.resolve({ docs: [] });
    };
  }

  beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue({ id: 1 });
    mockUpdate.mockReset().mockResolvedValue({ id: 1 });
    mockUpdateGlobal.mockReset().mockResolvedValue({});
    mockHaalScholenPagina.mockReset();
    mockHaalRecenteUpdates.mockReset().mockResolvedValue([]);
    mockBepaalGeplandeActie.mockReset();
  });

  it("volledige, geslaagde sync: een school die niet meer op het board staat wordt gedeactiveerd", async () => {
    mockHaalScholenPagina.mockResolvedValueOnce({ items: [maakSimpelItem("11111")], cursor: null });
    mockFind.mockImplementation(maakRouter([{ id: 42, schoolName: "schoolbestuur Tjongerwerven", mondayItemId: "12752900049" }]));

    const resultaat = await synchroniseerScholenBoard(maakPayload());

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 42, data: expect.objectContaining({ nogOpMondayBoard: false, actief: false }) }));
    expect(resultaat.scholenVanBoardGehaald).toBe(1);
  });

  it("API faalt halverwege de paginering: GEEN enkele bestaande school wordt gedeactiveerd", async () => {
    mockHaalScholenPagina.mockResolvedValueOnce({ items: [maakSimpelItem("11111")], cursor: "verder" }).mockRejectedValueOnce(new Error("Netwerkfout"));
    mockFind.mockImplementation(maakRouter([{ id: 42, schoolName: "schoolbestuur Tjongerwerven", mondayItemId: "12752900049" }]));

    const resultaat = await synchroniseerScholenBoard(maakPayload());

    const deactiverendeUpdates = mockUpdate.mock.calls.filter(([call]) => (call as { data?: { nogOpMondayBoard?: boolean } }).data?.nogOpMondayBoard === false);
    expect(deactiverendeUpdates).toHaveLength(0);
    expect(resultaat.scholenVanBoardGehaald).toBe(0);
    expect(resultaat.fouten.some((f) => f.includes("Scholen-pagina ophalen mislukt"))).toBe(true);
  });

  it("lege foutresponse/0 items ondanks een technisch geslaagde paginering: niet geïnterpreteerd als leeg board, geen school gedeactiveerd", async () => {
    mockHaalScholenPagina.mockResolvedValueOnce({ items: [], cursor: null });
    mockFind.mockImplementation(maakRouter([{ id: 42, schoolName: "schoolbestuur Tjongerwerven", mondayItemId: "12752900049" }]));

    const resultaat = await synchroniseerScholenBoard(maakPayload());

    const deactiverendeUpdates = mockUpdate.mock.calls.filter(([call]) => (call as { data?: { nogOpMondayBoard?: boolean } }).data?.nogOpMondayBoard === false);
    expect(deactiverendeUpdates).toHaveLength(0);
    expect(resultaat.scholenVanBoardGehaald).toBe(0);
    expect(resultaat.fouten.some((f) => f.includes("0 scholen terug"))).toBe(true);
  });

  it("een item dat weer terugkeert op het board wordt weer actief — self-healing reactivatie", async () => {
    mockHaalScholenPagina.mockResolvedValueOnce({ items: [maakSimpelItem("12752900049")], cursor: null });
    mockFind.mockImplementation(({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
      if (collection === "sales-schools") {
        if (where?.mondayItemId) {
          return Promise.resolve({
            docs: [{ id: 42, relatiestatus: "Lead", salesfase: null, mondayVolgendeActieDatum: null, onderwijstype: null, nogOpMondayBoard: false, verwijderdVanBoardOp: "2026-08-10T00:00:00.000Z" }],
          });
        }
        return Promise.resolve({ docs: [] });
      }
      return Promise.resolve({ docs: [] });
    });

    await synchroniseerScholenBoard(maakPayload());

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42, data: expect.objectContaining({ nogOpMondayBoard: true, verwijderdVanBoardOp: null, actief: true }) })
    );
  });
});
