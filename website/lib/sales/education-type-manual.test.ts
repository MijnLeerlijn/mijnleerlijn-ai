import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { stelOnderwijstypeHandmatigIn } from "./education-type-manual";
import { leesKolomWaarde } from "./monday-client";
import { schrijfTypeSchoolTerug } from "./writeback";
import { SCHOLEN_KOLOM } from "./monday-columns";

vi.mock("./monday-client", () => ({ leesKolomWaarde: vi.fn() }));
vi.mock("./writeback", () => ({ schrijfTypeSchoolTerug: vi.fn() }));

const mockLeesKolom = vi.mocked(leesKolomWaarde);
const mockSchrijfTypeSchool = vi.mocked(schrijfTypeSchoolTerug);
const mockFindByID = vi.fn();
const mockFind = vi.fn();
const mockUpdate = vi.fn();

function maakPayload(): Payload {
  return { findByID: mockFindByID, find: mockFind, update: mockUpdate } as unknown as Payload;
}

const SCHOOL = { id: 1, mondayItemId: "111" };
const VARIANT = { id: 5, educationType: "Montessori" };

beforeEach(() => {
  mockLeesKolom.mockReset();
  mockSchrijfTypeSchool.mockReset();
  mockFindByID.mockReset();
  mockFind.mockReset().mockResolvedValue({ docs: [] });
  mockUpdate.mockReset().mockResolvedValue({ id: 1 });
});

describe("stelOnderwijstypeHandmatigIn", () => {
  it("gooit een fout als de school niet bestaat", async () => {
    mockFindByID.mockResolvedValue(null);

    await expect(stelOnderwijstypeHandmatigIn(maakPayload(), 999, 5, 7)).rejects.toThrow("School niet gevonden");
    expect(mockSchrijfTypeSchool).not.toHaveBeenCalled();
  });

  it("gooit een fout als de variant niet bestaat", async () => {
    mockFindByID.mockResolvedValueOnce(SCHOOL).mockResolvedValueOnce(null);

    await expect(stelOnderwijstypeHandmatigIn(maakPayload(), 1, 999, 7)).rejects.toThrow("niet gevonden");
    expect(mockSchrijfTypeSchool).not.toHaveBeenCalled();
  });

  it("leest eerst de actuele Monday-waarde vóór de write-back (conflictcheck)", async () => {
    mockFindByID.mockResolvedValueOnce(SCHOOL).mockResolvedValueOnce(VARIANT);
    mockLeesKolom.mockResolvedValue({ id: SCHOLEN_KOLOM.typeSchool, text: null, value: null });
    mockSchrijfTypeSchool.mockResolvedValue({ status: "niet_geactiveerd", boodschap: "x" });

    await stelOnderwijstypeHandmatigIn(maakPayload(), 1, 5, 7);

    expect(mockLeesKolom).toHaveBeenCalledWith("111", SCHOLEN_KOLOM.typeSchool);
    expect(mockSchrijfTypeSchool).toHaveBeenCalledWith(expect.anything(), 1, "111", "Montessori", null, 7);
  });

  it("gebruikt variant.educationType als de te schrijven Monday-waarde — geen hardcoded label", async () => {
    mockFindByID.mockResolvedValueOnce(SCHOOL).mockResolvedValueOnce({ id: 8, educationType: "Domein onderwijs" });
    mockLeesKolom.mockResolvedValue(null);
    mockSchrijfTypeSchool.mockResolvedValue({ status: "niet_geactiveerd", boodschap: "x" });

    await stelOnderwijstypeHandmatigIn(maakPayload(), 1, 8, 7);

    expect(mockSchrijfTypeSchool).toHaveBeenCalledWith(expect.anything(), 1, "111", "Domein onderwijs", null, 7);
  });

  it("werkt de lokale sales-schools.onderwijstype bij ZODRA de write-back daadwerkelijk gelukt is", async () => {
    mockFindByID.mockResolvedValueOnce(SCHOOL).mockResolvedValueOnce(VARIANT);
    mockLeesKolom.mockResolvedValue(null);
    mockSchrijfTypeSchool.mockResolvedValue({ status: "geschreven", boodschap: "ok" });

    const resultaat = await stelOnderwijstypeHandmatigIn(maakPayload(), 1, 5, 7);

    expect(resultaat.lokaalBijgewerkt).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ collection: "sales-schools", id: 1, data: { onderwijstype: 5 } }));
  });

  it("werkt de lokale waarde NIET bij bij een conflict — Monday blijft bron van waarheid, geen schijnwerkelijkheid", async () => {
    mockFindByID.mockResolvedValueOnce(SCHOOL).mockResolvedValueOnce(VARIANT);
    mockLeesKolom.mockResolvedValue({ id: SCHOLEN_KOLOM.typeSchool, text: "Anders organiseren", value: null });
    mockSchrijfTypeSchool.mockResolvedValue({ status: "conflict", boodschap: "Conflict: Monday is gewijzigd" });

    const resultaat = await stelOnderwijstypeHandmatigIn(maakPayload(), 1, 5, 7);

    expect(resultaat.lokaalBijgewerkt).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ collection: "sales-schools" }));
  });

  it("werkt de lokale waarde niet bij zolang de write-back nog niet geactiveerd is", async () => {
    mockFindByID.mockResolvedValueOnce(SCHOOL).mockResolvedValueOnce(VARIANT);
    mockLeesKolom.mockResolvedValue(null);
    mockSchrijfTypeSchool.mockResolvedValue({ status: "niet_geactiveerd", boodschap: "nog niet geactiveerd" });

    const resultaat = await stelOnderwijstypeHandmatigIn(maakPayload(), 1, 5, 7);

    expect(resultaat.lokaalBijgewerkt).toBe(false);
  });

  it("markeert een nog openstaand AI-veldvoorstel voor Type school als 'superseded' zodra de handmatige write-back gelukt is", async () => {
    mockFindByID.mockResolvedValueOnce(SCHOOL).mockResolvedValueOnce(VARIANT);
    mockLeesKolom.mockResolvedValue(null);
    mockSchrijfTypeSchool.mockResolvedValue({ status: "geschreven", boodschap: "ok" });
    mockFind.mockResolvedValue({ docs: [{ id: 77 }] });

    await stelOnderwijstypeHandmatigIn(maakPayload(), 1, 5, 7);

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "sales-proposals",
        where: expect.objectContaining({ proposalType: { equals: "veld_correctie" }, targetColumnId: { equals: SCHOLEN_KOLOM.typeSchool } }),
      })
    );
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ collection: "sales-proposals", id: 77, data: { status: "superseded" } }));
  });

  it("laat pending veldvoorstellen ongemoeid wanneer de write-back niet gelukt is", async () => {
    mockFindByID.mockResolvedValueOnce(SCHOOL).mockResolvedValueOnce(VARIANT);
    mockLeesKolom.mockResolvedValue(null);
    mockSchrijfTypeSchool.mockResolvedValue({ status: "mislukt", boodschap: "x" });

    await stelOnderwijstypeHandmatigIn(maakPayload(), 1, 5, 7);

    expect(mockFind).not.toHaveBeenCalled();
  });
});
