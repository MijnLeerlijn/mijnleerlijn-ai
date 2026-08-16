import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { heranalyseerVoorstel } from "./proposal-reanalyze";
import { maakSchoolRelatieAnalyse, bouwVoorstelRedenTekst } from "./relationship-analysis";
import { vervangVoorstel } from "./proposals";

vi.mock("./relationship-analysis", () => ({ maakSchoolRelatieAnalyse: vi.fn(), bouwVoorstelRedenTekst: vi.fn(() => "Laatste echte contact: 5 dagen geleden\nWaarom: test") }));
vi.mock("./proposals", () => ({ vervangVoorstel: vi.fn() }));

const mockAnalyse = vi.mocked(maakSchoolRelatieAnalyse);
const mockBouwReden = vi.mocked(bouwVoorstelRedenTekst);
const mockVervang = vi.mocked(vervangVoorstel);
const mockFindByID = vi.fn();

function maakPayload(): Payload {
  return { findByID: mockFindByID } as unknown as Payload;
}

const SCHOOL = { id: 1, schoolName: "De Regenboog", mondayItemId: "111", relatiestatus: "Prospect", salesfase: null, onderwijstype: null };
const OUD_VOORSTEL_PENDING = { id: 50, status: "pending", proposalType: "volgende_actie", school: SCHOOL };

const KLAAR_ANALYSE = {
  laatsteEchteContactDatum: "2026-08-10T00:00:00.000Z",
  dagenSindsLaatsteContact: 5,
  laatsteContactSamenvatting: "x",
  afspraken: [],
  wieIsAanZet: "school" as const,
  bestaandeVervolgdatum: null,
  relatiestatus: "Prospect",
  salesfase: null,
  onderwijstype: null,
  risicoDatLeadStilvalt: "middel" as const,
  aanbevolenVolgendeStap: "Stuur een follow-upmail",
  aanbevolenDatum: "2026-08-25",
  aanbevolenKanaal: "mail" as const,
  aanbevolenType: "mail" as const,
  datumHerkomst: "generieke_inschatting" as const,
  reden: "Test.",
  confidence: "hoog" as const,
  onvoldoendeContext: false,
  mogelijkAfgesloten: false,
};

beforeEach(() => {
  mockFindByID.mockReset();
  mockAnalyse.mockReset();
  mockBouwReden.mockReset().mockReturnValue("Laatste echte contact: 5 dagen geleden\nWaarom: test");
  mockVervang.mockReset().mockResolvedValue({ nieuwProposalId: 999 });
});

describe("heranalyseerVoorstel", () => {
  it("gooit een fout als het voorstel niet bestaat", async () => {
    mockFindByID.mockResolvedValue(null);

    await expect(heranalyseerVoorstel(maakPayload(), 999, 7)).rejects.toThrow("niet gevonden");
    expect(mockAnalyse).not.toHaveBeenCalled();
  });

  it("gooit een fout als het voorstel al is afgehandeld — geen heranalyse op een afgesloten voorstel", async () => {
    mockFindByID.mockResolvedValue({ ...OUD_VOORSTEL_PENDING, status: "accepted" });

    await expect(heranalyseerVoorstel(maakPayload(), 50, 7)).rejects.toThrow("al afgehandeld");
    expect(mockAnalyse).not.toHaveBeenCalled();
  });

  it("gooit een fout voor een 'veld_correctie'-voorstel — heranalyse is alleen voor volgende-actie-voorstellen", async () => {
    mockFindByID.mockResolvedValue({ ...OUD_VOORSTEL_PENDING, proposalType: "veld_correctie" });

    await expect(heranalyseerVoorstel(maakPayload(), 50, 7)).rejects.toThrow("volgende actie");
    expect(mockAnalyse).not.toHaveBeenCalled();
  });

  it("maakt een nieuw voorstel via vervangVoorstel wanneer de heranalyse status 'klaar' teruggeeft", async () => {
    mockFindByID.mockResolvedValue(OUD_VOORSTEL_PENDING);
    mockAnalyse.mockResolvedValue({ status: "klaar", analyse: KLAAR_ANALYSE, brontekstUpdateIds: ["u1", "u2"] });

    const resultaat = await heranalyseerVoorstel(maakPayload(), 50, 7);

    expect(resultaat).toEqual({ status: "nieuw_voorstel", proposalId: 999 });
    expect(mockVervang).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        oudProposalId: 50,
        actorId: 7,
        nieuwVoorstel: expect.objectContaining({ school: 1, proposalText: "Stuur een follow-upmail", confidence: "hoog" }),
      })
    );
  });

  it("laat het oude voorstel ongemoeid (geen vervangVoorstel-aanroep) wanneer de heranalyse 'onvoldoende_context' teruggeeft", async () => {
    mockFindByID.mockResolvedValue(OUD_VOORSTEL_PENDING);
    mockAnalyse.mockResolvedValue({ status: "onvoldoende_context", analyse: { ...KLAAR_ANALYSE, onvoldoendeContext: true } });

    const resultaat = await heranalyseerVoorstel(maakPayload(), 50, 7);

    expect(resultaat.status).toBe("geen_wijziging");
    expect(mockVervang).not.toHaveBeenCalled();
  });

  it("laat het oude voorstel ongemoeid wanneer de heranalyse 'mogelijk_afgesloten' teruggeeft", async () => {
    mockFindByID.mockResolvedValue(OUD_VOORSTEL_PENDING);
    mockAnalyse.mockResolvedValue({ status: "mogelijk_afgesloten", analyse: { ...KLAAR_ANALYSE, mogelijkAfgesloten: true } });

    const resultaat = await heranalyseerVoorstel(maakPayload(), 50, 7);

    expect(resultaat.status).toBe("geen_wijziging");
    expect(mockVervang).not.toHaveBeenCalled();
  });

  it("laat het oude voorstel ongemoeid wanneer er helemaal geen betrouwbare context (meer) is", async () => {
    mockFindByID.mockResolvedValue(OUD_VOORSTEL_PENDING);
    mockAnalyse.mockResolvedValue({ status: "geen_context" });

    const resultaat = await heranalyseerVoorstel(maakPayload(), 50, 7);

    expect(resultaat.status).toBe("geen_wijziging");
    expect(mockVervang).not.toHaveBeenCalled();
  });

  it("werkt ook voor een 'bestaande_vervolgdatum'-voorstel (herbeoordeelt de hele relatie, niet alleen die datum)", async () => {
    mockFindByID.mockResolvedValue({ ...OUD_VOORSTEL_PENDING, proposalType: "bestaande_vervolgdatum" });
    mockAnalyse.mockResolvedValue({ status: "klaar", analyse: KLAAR_ANALYSE, brontekstUpdateIds: [] });

    const resultaat = await heranalyseerVoorstel(maakPayload(), 50, 7);

    expect(resultaat.status).toBe("nieuw_voorstel");
  });

  it("haalt de school apart op wanneer het voorstel alleen een kaal school-ID heeft (depth 0)", async () => {
    mockFindByID
      .mockResolvedValueOnce({ ...OUD_VOORSTEL_PENDING, school: 1 }) // sales-proposals findByID
      .mockResolvedValueOnce(SCHOOL); // sales-schools findByID
    mockAnalyse.mockResolvedValue({ status: "klaar", analyse: KLAAR_ANALYSE, brontekstUpdateIds: [] });

    await heranalyseerVoorstel(maakPayload(), 50, 7);

    expect(mockFindByID).toHaveBeenCalledWith(expect.objectContaining({ collection: "sales-schools", id: 1 }));
  });
});
