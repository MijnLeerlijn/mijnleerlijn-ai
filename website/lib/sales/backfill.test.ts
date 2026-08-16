import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { voerBackfillUit } from "./backfill";
import { maakSchoolRelatieAnalyse } from "./relationship-analysis";

// Relatie-analyse V1 (2026-08-15) — backfill.ts delegeert de daadwerkelijke
// AI-redenering voortaan volledig aan lib/sales/relationship-analysis.ts
// (zelf al uitgebreid getest in relationship-analysis.test.ts, inclusief het
// uitsluiten van gemigreerde Updates). Dit bestand test daarom uitsluitend
// de idempotentie-/veiligheidsgates die backfill.ts ZELF bewaakt: bestaande
// actie/voorstel/Monday-vervolgdatum respecteren, nooit automatisch
// accepteren, correct delegeren van elke RelatieAnalyseUitkomst-status.
vi.mock("./relationship-analysis", () => ({ maakSchoolRelatieAnalyse: vi.fn(), bouwVoorstelRedenTekst: vi.fn(() => "Laatste echte contact: 5 dagen geleden\nWaarom: test") }));
const mockAnalyse = vi.mocked(maakSchoolRelatieAnalyse);

const mockFind = vi.fn();
const mockCreate = vi.fn();

function maakPayload(): Payload {
  return { find: mockFind, create: mockCreate } as unknown as Payload;
}

const SCHOOL_A = { id: 1, schoolName: "School A", mondayItemId: "111", mondayVolgendeActieDatum: null };
const SCHOOL_B = { id: 2, schoolName: "School B", mondayItemId: "222", mondayVolgendeActieDatum: null };

beforeEach(() => {
  mockFind.mockReset();
  mockCreate.mockReset().mockResolvedValue({ id: 500 });
  mockAnalyse.mockReset();
});

function stelFindIn(config: { openActies?: Record<number, boolean>; pendingVoorstellen?: Record<number, boolean>; betrouwbareContext?: Record<number, boolean> }) {
  mockFind.mockImplementation(({ collection, where }: { collection: string; where: Record<string, unknown> }) => {
    if (collection === "sales-schools") {
      return Promise.resolve({ docs: [SCHOOL_A, SCHOOL_B] });
    }
    if (collection === "sales-actions") {
      const schoolId = (where.school as { equals: number }).equals;
      return Promise.resolve({ docs: config.openActies?.[schoolId] ? [{ id: 1 }] : [] });
    }
    if (collection === "sales-proposals") {
      const schoolId = (where.school as { equals: number }).equals;
      return Promise.resolve({ docs: config.pendingVoorstellen?.[schoolId] ? [{ id: 1 }] : [] });
    }
    if (collection === "sales-log-events") {
      const schoolId = (where.school as { equals: number }).equals;
      return Promise.resolve({
        docs: config.betrouwbareContext?.[schoolId] ? [{ payload: { gemigreerd: false } }] : [],
      });
    }
    return Promise.resolve({ docs: [] });
  });
}

const VOLLEDIGE_ANALYSE_UITKOMST = {
  status: "klaar" as const,
  analyse: {
    laatsteEchteContactDatum: "2026-08-15T00:00:00.000Z",
    dagenSindsLaatsteContact: 5,
    laatsteContactSamenvatting: "x",
    afspraken: [],
    wieIsAanZet: "school" as const,
    bestaandeVervolgdatum: null,
    relatiestatus: "Prospect",
    salesfase: null,
    onderwijstype: null,
    risicoDatLeadStilvalt: "middel" as const,
    aanbevolenVolgendeStap: "Demo inplannen",
    aanbevolenDatum: "2026-08-20",
    aanbevolenKanaal: "mail" as const,
    aanbevolenType: "afspraak" as const,
    datumHerkomst: "generieke_inschatting" as const,
    reden: "Ze vroegen expliciet om een demo.",
    confidence: "hoog" as const,
    onvoldoendeContext: false,
    mogelijkAfgesloten: false,
  },
  brontekstUpdateIds: ["u1"],
};

describe("voerBackfillUit — idempotentie", () => {
  it("slaat een school met een al bestaande open actie over — categorie 'vervolgactie_bestaat'", async () => {
    stelFindIn({ openActies: { 1: true, 2: true } });

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.perUitkomst.vervolgactie_bestaat).toBe(2);
    expect(mockCreate).not.toHaveBeenCalled(); // geen nieuw voorstel, geen nieuwe actie
    expect(mockAnalyse).not.toHaveBeenCalled();
  });

  it("slaat een school met een al bestaand pending voorstel over — geen dubbel voorstel bij een herhaalde run", async () => {
    stelFindIn({ pendingVoorstellen: { 1: true, 2: true } });

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.perUitkomst.ai_voorstel_klaar).toBe(2);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockAnalyse).not.toHaveBeenCalled();
  });

  it("categoriseert als 'onvoldoende_context' wanneer er geen betrouwbare lokale contactcontext is — geen onnodige analyse-aanroep", async () => {
    stelFindIn({});

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.perUitkomst.onvoldoende_context).toBe(2);
    expect(mockAnalyse).not.toHaveBeenCalled();
  });

  it("maakt precies één voorstel per school aan wanneer de relatie-analyse status 'klaar' teruggeeft", async () => {
    stelFindIn({ betrouwbareContext: { 1: true, 2: true } });
    mockAnalyse.mockResolvedValue(VOLLEDIGE_ANALYSE_UITKOMST);

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.perUitkomst.ai_voorstel_klaar).toBe(2);
    const voorstelCalls = mockCreate.mock.calls.filter((c) => c[0].collection === "sales-proposals");
    expect(voorstelCalls).toHaveLength(2);
    expect(voorstelCalls[0]![0].data.status).toBe("pending"); // NOOIT automatisch geaccepteerd
    expect(voorstelCalls[0]![0].data.proposalText).toBe("Demo inplannen");
    expect(voorstelCalls[0]![0].data.relatieAnalyse).toEqual(VOLLEDIGE_ANALYSE_UITKOMST.analyse);
    expect(voorstelCalls[0]![0].data.confidence).toBe("hoog");
  });

  it("categoriseert als 'onvoldoende_context' wanneer de relatie-analyse dat teruggeeft (geen betrouwbare Updates, of het model kon geen verantwoord advies geven) — geen voorstel aangemaakt", async () => {
    stelFindIn({ betrouwbareContext: { 1: true } });
    mockFind.mockImplementationOnce(({ collection }) => (collection === "sales-schools" ? Promise.resolve({ docs: [SCHOOL_A] }) : Promise.resolve({ docs: [] })));
    stelFindIn({ betrouwbareContext: { 1: true } });
    mockAnalyse.mockResolvedValue({ status: "geen_context" });

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.perUitkomst.onvoldoende_context).toBe(1);
    expect(mockCreate).not.toHaveBeenCalledWith(expect.objectContaining({ collection: "sales-proposals" }));
  });

  it("categoriseert als 'mogelijk_afgesloten' zonder voorstel wanneer de analyse dat aangeeft", async () => {
    stelFindIn({ betrouwbareContext: { 1: true } });
    mockFind.mockImplementationOnce(({ collection }) => (collection === "sales-schools" ? Promise.resolve({ docs: [SCHOOL_A] }) : Promise.resolve({ docs: [] })));
    stelFindIn({ betrouwbareContext: { 1: true } });
    mockAnalyse.mockResolvedValue({ status: "mogelijk_afgesloten", analyse: { ...VOLLEDIGE_ANALYSE_UITKOMST.analyse, mogelijkAfgesloten: true } });

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.perUitkomst.mogelijk_afgesloten).toBe(1);
    expect(mockCreate).not.toHaveBeenCalledWith(expect.objectContaining({ collection: "sales-proposals" }));
  });

  it("maakt nooit een geaccepteerde actie aan — alleen pending voorstellen", async () => {
    stelFindIn({ betrouwbareContext: { 1: true, 2: true } });
    mockAnalyse.mockResolvedValue(VOLLEDIGE_ANALYSE_UITKOMST);

    await voerBackfillUit(maakPayload());

    expect(mockCreate).not.toHaveBeenCalledWith(expect.objectContaining({ collection: "sales-actions" }));
  });

  it("geeft een bestaande Monday-vervolgdatum door aan de relatie-analyse i.p.v. de analyse over te slaan (productiecorrectie 2026-08-16, punt 6/7/11)", async () => {
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ ...SCHOOL_A, mondayVolgendeActieDatum: "2026-09-01" }] });
      if (collection === "sales-log-events") return Promise.resolve({ docs: [{ payload: { gemigreerd: false } }] });
      return Promise.resolve({ docs: [] }); // sales-actions, sales-proposals: geen bestaand record
    });
    mockAnalyse.mockResolvedValue({
      status: "klaar",
      analyse: { ...VOLLEDIGE_ANALYSE_UITKOMST.analyse, aanbevolenDatum: "2026-09-01", datumHerkomst: "bestaande_monday_datum" as const },
      brontekstUpdateIds: ["u1"],
    });

    const resultaat = await voerBackfillUit(maakPayload());

    expect(mockAnalyse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mondayVolgendeActieDatum: "2026-09-01" }));
    expect(resultaat.perUitkomst.ai_voorstel_klaar).toBe(1);
    const voorstelCall = mockCreate.mock.calls.find((c) => c[0].collection === "sales-proposals")![0];
    expect(voorstelCall.data.proposalType).toBe("volgende_actie"); // niet meer het uitgefaseerde 'bestaande_vervolgdatum'
    expect(voorstelCall.data.proposedDate).toBe("2026-09-01");
  });

  it("slaat een school met al een pending 'bestaande_vervolgdatum'-voorstel over — idempotentie voor oude, nog niet afgehandelde voorstelrijen van dit uitgefaseerde type", async () => {
    mockFind.mockImplementation(({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [{ ...SCHOOL_A, mondayVolgendeActieDatum: "2026-09-01" }] });
      if (collection === "sales-actions") return Promise.resolve({ docs: [] });
      if (collection === "sales-proposals") {
        const proposalType = (where?.proposalType as { equals: string } | undefined)?.equals;
        return Promise.resolve({ docs: proposalType === "bestaande_vervolgdatum" ? [{ id: 42 }] : [] });
      }
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.perUitkomst.ai_voorstel_klaar).toBe(1);
    expect(resultaat.resultaten[0]!.proposalId).toBe(42);
    expect(mockAnalyse).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("voerBackfillUit — Inactief/Gestopt/Klant nooit in actieve Sales-assistentlogica (punt 8, regressietests)", () => {
  it("bevraagt sales-schools altijd met actief: true — Inactief/Gestopt/Klant-zonder-actie matchen dit filter per definitie nooit (actief wordt op sync bepaald door isOpenstaandeRelatiestatus)", async () => {
    mockFind.mockImplementation(({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
      if (collection === "sales-schools") {
        expect(where).toEqual({ actief: { equals: true } });
        return Promise.resolve({ docs: [] });
      }
      return Promise.resolve({ docs: [] });
    });

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.scholenBeoordeeld).toBe(0);
    expect(mockAnalyse).not.toHaveBeenCalled();
  });

  it("een school die niet in de actief:true-resultaatset zit (Inactief/Gestopt/Klant) wordt nooit beoordeeld, ook al staan er open acties/voorstellen los in de database", async () => {
    // sales-schools levert bewust GEEN scholen op (simuleert dat de enige
    // bestaande scholen Inactief/Gestopt/Klant zijn, dus buiten actief:true
    // vallen) — als voerBackfillUit toch iets zou beoordelen zou dat een
    // regressie zijn (bv. een aparte, niet-gefilterde query ergens).
    mockFind.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "sales-schools") return Promise.resolve({ docs: [] });
      return Promise.resolve({ docs: [{ id: 999 }] }); // zou, als 't wel bevraagd werd, een open actie/voorstel voorspiegelen
    });

    const resultaat = await voerBackfillUit(maakPayload());

    expect(resultaat.scholenBeoordeeld).toBe(0);
    expect(resultaat.resultaten).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
