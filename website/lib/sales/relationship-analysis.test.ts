import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { maakSchoolRelatieAnalyse, bouwVoorstelRedenTekst, type SchoolRelatieAnalyse } from "./relationship-analysis";
import { haalUpdatesVoorItem } from "./monday-client";
import { generateStructuredOutput } from "@/services/ai-client";
import { bepaalProposalVoorkeur } from "./proposal-preferences";

vi.mock("./monday-client", () => ({ haalUpdatesVoorItem: vi.fn() }));
vi.mock("@/services/ai-client", () => ({ generateStructuredOutput: vi.fn() }));
vi.mock("./proposal-preferences", () => ({ bepaalProposalVoorkeur: vi.fn() }));

const mockHaalUpdates = vi.mocked(haalUpdatesVoorItem);
const mockGenerate = vi.mocked(generateStructuredOutput);
const mockVoorkeur = vi.mocked(bepaalProposalVoorkeur);
const mockFindByID = vi.fn();

function maakPayload(): Payload {
  return { findByID: mockFindByID } as unknown as Payload;
}

const SCHOOL = {
  id: 1,
  schoolName: "De Regenboog",
  mondayItemId: "111",
  relatiestatus: "Prospect",
  salesfase: null,
  onderwijstype: null,
  mondayVolgendeActieDatum: null,
};

const GEEN_VOORKEUR = { mediaanDagenTotVervolgactie: null, meestGekozenKanaal: null, aantalVoorstellenGebruikt: 0 };

const VOLLEDIG_LLM_ANTWOORD = {
  laatsteContactSamenvatting: "School bespreekt intern en komt terug.",
  afspraken: [{ tekst: "school bespreekt MijnLeerlijn intern en komt terug", wie: "school" as const }],
  wieIsAanZet: "school" as const,
  risicoDatLeadStilvalt: "middel" as const,
  onvoldoendeContext: false,
  mogelijkAfgesloten: false,
  aanbevolenVolgendeStap: "Stuur een korte follow-upmail",
  aanbevolenDatum: "2026-08-25",
  aanbevolenKanaal: "mail" as const,
  aanbevolenType: "mail" as const,
  reden: "Er is geen vervolgdatum en de afgesproken terugkoppeling is uitgebleven.",
  confidence: "hoog" as const,
};

beforeEach(() => {
  mockHaalUpdates.mockReset();
  mockGenerate.mockReset();
  mockVoorkeur.mockReset().mockResolvedValue(GEEN_VOORKEUR);
  mockFindByID.mockReset();
});

describe("maakSchoolRelatieAnalyse", () => {
  it("geeft 'geen_context' terug zonder enige betrouwbare Update — AI wordt niet aangeroepen", async () => {
    mockHaalUpdates.mockResolvedValue([]);

    const uitkomst = await maakSchoolRelatieAnalyse(maakPayload(), SCHOOL);

    expect(uitkomst.status).toBe("geen_context");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("geeft 'geen_context' terug wanneer ALLE Updates gemigreerd zijn — AI wordt niet aangeroepen (scenario 6)", async () => {
    mockHaalUpdates.mockResolvedValue([
      { id: "u1", item_id: "111", text_body: "📜 Gemigreerde CRM-gegevens (oud Sales-board)\nLaatste contact: 13/March/2026", created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z", creator: null },
    ]);

    const uitkomst = await maakSchoolRelatieAnalyse(maakPayload(), SCHOOL);

    expect(uitkomst.status).toBe("geen_context");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("bepaalt laatsteEchteContactDatum/dagenSindsLaatsteContact DETERMINISTISCH uit uitsluitend niet-gemigreerde Updates, ook als een gemigreerde Update recenter lijkt", async () => {
    const nu = Date.now();
    const elfDagenGeleden = new Date(nu - 11 * 24 * 60 * 60 * 1000).toISOString();
    mockHaalUpdates.mockResolvedValue([
      { id: "u-oud-echt", item_id: "111", text_body: "School belt terug volgende week.", created_at: elfDagenGeleden, updated_at: elfDagenGeleden, creator: null },
      // Gemigreerde Update met een LATERE created_at (migratiedatum) dan de echte contactdatum — mag NOOIT als "laatste contact" tellen.
      { id: "u-gemigreerd-nieuw", item_id: "111", text_body: "📜 Gemigreerde CRM-gegevens (oud Sales-board)\nOude notitie.", created_at: new Date(nu - 1 * 24 * 60 * 60 * 1000).toISOString(), updated_at: "x", creator: null },
    ]);
    mockGenerate.mockResolvedValue(VOLLEDIG_LLM_ANTWOORD);

    const uitkomst = await maakSchoolRelatieAnalyse(maakPayload(), SCHOOL);

    expect(uitkomst.status).toBe("klaar");
    if (uitkomst.status !== "klaar") throw new Error("onverwacht");
    expect(uitkomst.analyse.laatsteEchteContactDatum).toBe(elfDagenGeleden);
    expect(uitkomst.analyse.dagenSindsLaatsteContact).toBe(11);
    // De gemigreerde Update-ID zit niet in de brontekst-ID's die als "bron" gelden.
    expect(uitkomst.brontekstUpdateIds).toEqual(["u-oud-echt"]);
  });

  it("geeft 'onvoldoende_context' terug wanneer het model zelf aangeeft onvoldoende basis te hebben — geen verzonnen advies", async () => {
    mockHaalUpdates.mockResolvedValue([{ id: "u1", item_id: "111", text_body: "Kort telefoontje, verder niets concreets.", created_at: "2026-08-01T00:00:00.000Z", updated_at: "x", creator: null }]);
    mockGenerate.mockResolvedValue({
      ...VOLLEDIG_LLM_ANTWOORD,
      onvoldoendeContext: true,
      aanbevolenVolgendeStap: null,
      aanbevolenDatum: null,
      aanbevolenKanaal: null,
      aanbevolenType: null,
    });

    const uitkomst = await maakSchoolRelatieAnalyse(maakPayload(), SCHOOL);

    expect(uitkomst.status).toBe("onvoldoende_context");
    if (uitkomst.status === "klaar") throw new Error("onverwacht");
    if (uitkomst.status === "onvoldoende_context") {
      expect(uitkomst.analyse.aanbevolenVolgendeStap).toBeNull();
      expect(uitkomst.analyse.onvoldoendeContext).toBe(true);
    }
  });

  it("dwingt onvoldoende_context af (defensief) wanneer het model onvoldoendeContext:false zegt maar toch geen datum/actie geeft", async () => {
    mockHaalUpdates.mockResolvedValue([{ id: "u1", item_id: "111", text_body: "x", created_at: "2026-08-01T00:00:00.000Z", updated_at: "x", creator: null }]);
    mockGenerate.mockResolvedValue({ ...VOLLEDIG_LLM_ANTWOORD, onvoldoendeContext: false, aanbevolenDatum: null });

    const uitkomst = await maakSchoolRelatieAnalyse(maakPayload(), SCHOOL);

    expect(uitkomst.status).toBe("onvoldoende_context");
  });

  it("geeft 'mogelijk_afgesloten' terug bij een ondubbelzinnige afwijzing — geen voorstel", async () => {
    mockHaalUpdates.mockResolvedValue([{ id: "u1", item_id: "111", text_body: "We gaan niet verder met MijnLeerlijn, bedankt voor het gesprek.", created_at: "2026-08-01T00:00:00.000Z", updated_at: "x", creator: null }]);
    mockGenerate.mockResolvedValue({ ...VOLLEDIG_LLM_ANTWOORD, mogelijkAfgesloten: true });

    const uitkomst = await maakSchoolRelatieAnalyse(maakPayload(), SCHOOL);

    expect(uitkomst.status).toBe("mogelijk_afgesloten");
  });

  it("geeft bij succes een volledige SchoolRelatieAnalyse terug met de deterministische EN de AI-velden correct gemapt", async () => {
    mockHaalUpdates.mockResolvedValue([{ id: "u1", item_id: "111", text_body: "School bespreekt intern.", created_at: "2026-08-01T00:00:00.000Z", updated_at: "x", creator: null }]);
    mockGenerate.mockResolvedValue(VOLLEDIG_LLM_ANTWOORD);

    const uitkomst = await maakSchoolRelatieAnalyse(maakPayload(), { ...SCHOOL, salesfase: "Kennismaking" });

    expect(uitkomst.status).toBe("klaar");
    if (uitkomst.status !== "klaar") throw new Error("onverwacht");
    expect(uitkomst.analyse.relatiestatus).toBe("Prospect");
    expect(uitkomst.analyse.salesfase).toBe("Kennismaking");
    expect(uitkomst.analyse.aanbevolenVolgendeStap).toBe("Stuur een korte follow-upmail");
    expect(uitkomst.analyse.aanbevolenDatum).toBe("2026-08-25");
    expect(uitkomst.analyse.aanbevolenKanaal).toBe("mail");
    expect(uitkomst.analyse.wieIsAanZet).toBe("school");
    expect(uitkomst.analyse.afspraken).toEqual([{ tekst: "school bespreekt MijnLeerlijn intern en komt terug", wie: "school" }]);
  });

  it("zoekt de onderwijstype-naam op (variants) wanneer het school-record een variant-ID heeft", async () => {
    mockHaalUpdates.mockResolvedValue([{ id: "u1", item_id: "111", text_body: "x", created_at: "2026-08-01T00:00:00.000Z", updated_at: "x", creator: null }]);
    mockGenerate.mockResolvedValue(VOLLEDIG_LLM_ANTWOORD);
    mockFindByID.mockResolvedValue({ id: 5, name: "Montessori" });

    const uitkomst = await maakSchoolRelatieAnalyse(maakPayload(), { ...SCHOOL, onderwijstype: 5 });

    expect(mockFindByID).toHaveBeenCalledWith(expect.objectContaining({ collection: "variants", id: 5 }));
    if (uitkomst.status !== "klaar") throw new Error("onverwacht");
    expect(uitkomst.analyse.onderwijstype).toBe("Montessori");
  });

  it("geeft de historische voorkeur (mediaan dagen/kanaal) door aan de prompt zodat het advies daarop kan voortbouwen", async () => {
    mockHaalUpdates.mockResolvedValue([{ id: "u1", item_id: "111", text_body: "x", created_at: "2026-08-01T00:00:00.000Z", updated_at: "x", creator: null }]);
    mockVoorkeur.mockResolvedValue({ mediaanDagenTotVervolgactie: 10, meestGekozenKanaal: "mail", aantalVoorstellenGebruikt: 6 });
    mockGenerate.mockResolvedValue(VOLLEDIG_LLM_ANTWOORD);

    await maakSchoolRelatieAnalyse(maakPayload(), SCHOOL);

    const call = mockGenerate.mock.calls[0]![0] as { userPrompt: string };
    expect(call.userPrompt).toContain("ongeveer 10 dagen");
    expect(call.userPrompt).toContain("mail");
  });

  it("scheidt betrouwbare en gemigreerde Updates duidelijk gelabeld in de prompt", async () => {
    mockHaalUpdates.mockResolvedValue([
      { id: "u1", item_id: "111", text_body: "Recent telefoongesprek.", created_at: "2026-08-01T00:00:00.000Z", updated_at: "x", creator: null },
      { id: "u2", item_id: "111", text_body: "📜 Gemigreerde CRM-gegevens (oud Sales-board)\nOude notitie uit vorig systeem.", created_at: "2026-07-01T00:00:00.000Z", updated_at: "x", creator: null },
    ]);
    mockGenerate.mockResolvedValue(VOLLEDIG_LLM_ANTWOORD);

    await maakSchoolRelatieAnalyse(maakPayload(), SCHOOL);

    const call = mockGenerate.mock.calls[0]![0] as { userPrompt: string };
    expect(call.userPrompt).toContain("UITSLUITEND achtergrond");
    expect(call.userPrompt).toContain("Oude notitie uit vorig systeem");
  });
});

describe("bouwVoorstelRedenTekst", () => {
  const BASIS: SchoolRelatieAnalyse = {
    laatsteEchteContactDatum: "2026-08-04T00:00:00.000Z",
    dagenSindsLaatsteContact: 11,
    laatsteContactSamenvatting: "x",
    afspraken: [],
    wieIsAanZet: "school",
    bestaandeVervolgdatum: null,
    relatiestatus: "Prospect",
    salesfase: null,
    onderwijstype: null,
    risicoDatLeadStilvalt: "middel",
    aanbevolenVolgendeStap: "Stuur een korte follow-upmail",
    aanbevolenDatum: "2026-08-25",
    aanbevolenKanaal: "mail",
    aanbevolenType: "mail",
    reden: "Er is geen vervolgdatum en de afgesproken terugkoppeling is uitgebleven.",
    confidence: "hoog",
    onvoldoendeContext: false,
    mogelijkAfgesloten: false,
  };

  it("bouwt exact het gevraagde formaat: laatste contact, afspraak (indien aanwezig), waarom", () => {
    const tekst = bouwVoorstelRedenTekst({ ...BASIS, afspraken: [{ tekst: "school bespreekt MijnLeerlijn intern en komt terug", wie: "school" }] });

    expect(tekst).toBe(
      "Laatste echte contact: 11 dagen geleden\n" +
        "Afspraak: school bespreekt MijnLeerlijn intern en komt terug\n" +
        "Waarom: Er is geen vervolgdatum en de afgesproken terugkoppeling is uitgebleven."
    );
  });

  it("laat de 'Afspraak'-regel weg wanneer er geen afspraken zijn", () => {
    const tekst = bouwVoorstelRedenTekst({ ...BASIS, afspraken: [] });

    expect(tekst).not.toContain("Afspraak:");
    expect(tekst.split("\n")).toHaveLength(2);
  });
});
