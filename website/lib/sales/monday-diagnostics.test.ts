import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { verifieerMondayKoppeling, voerDiagnostischeSchrijfTest, voerDiagnostischeTerugzetting } from "./monday-diagnostics";
import { haalBoardMetKolommen, haalItemMetKolomWaarden } from "./monday-client";
import { voerWriteBackUit } from "./writeback";
import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM } from "./monday-columns";

vi.mock("./monday-client", () => ({ haalBoardMetKolommen: vi.fn(), haalItemMetKolomWaarden: vi.fn() }));
vi.mock("./writeback", () => ({ voerWriteBackUit: vi.fn() }));

const mockHaalBoard = vi.mocked(haalBoardMetKolommen);
const mockHaalItem = vi.mocked(haalItemMetKolomWaarden);
const mockVoerWriteBackUit = vi.mocked(voerWriteBackUit);

function maakPayload(): Payload {
  return {} as Payload;
}

const VOLLEDIGE_KOLOMMEN = [
  { id: SCHOLEN_KOLOM.datumLaatsteContact, title: "Datum laatste contact", type: "date" },
  { id: SCHOLEN_KOLOM.datumVolgendeActie, title: "Datum volgende actie", type: "date" },
  { id: SCHOLEN_KOLOM.typeSchool, title: "Type school", type: "dropdown" },
  { id: "color_mm4vvg4r", title: "Relatiestatus", type: "color" },
];

beforeEach(() => {
  mockHaalBoard.mockReset();
  mockHaalItem.mockReset();
  mockVoerWriteBackUit.mockReset();
});

describe("verifieerMondayKoppeling — read-only", () => {
  it("bevestigt board-toegang en dat alle 3 schrijfbare kolommen live op het board bestaan", async () => {
    mockHaalBoard.mockResolvedValue({ id: SCHOLEN_BOARD_ID, name: "1: Scholen (Master Data)", columns: VOLLEDIGE_KOLOMMEN });

    const resultaat = await verifieerMondayKoppeling();

    expect(mockHaalBoard).toHaveBeenCalledWith(SCHOLEN_BOARD_ID);
    expect(resultaat.boardBereikbaar).toBe(true);
    expect(resultaat.boardNaam).toBe("1: Scholen (Master Data)");
    expect(resultaat.kolommen).toHaveLength(3);
    expect(resultaat.kolommen.every((k) => k.gevondenOpBoard)).toBe(true);
    expect(resultaat.kolommen.find((k) => k.columnId === SCHOLEN_KOLOM.typeSchool)?.liveType).toBe("dropdown");
    expect(resultaat.testitem).toBeNull();
    expect(mockHaalItem).not.toHaveBeenCalled(); // geen itemId meegegeven -> geen itemleespoging
  });

  it("meldt een ontbrekende kolom als gevondenOpBoard: false i.p.v. te crashen", async () => {
    mockHaalBoard.mockResolvedValue({ id: SCHOLEN_BOARD_ID, name: "1: Scholen (Master Data)", columns: VOLLEDIGE_KOLOMMEN.filter((c) => c.id !== SCHOLEN_KOLOM.typeSchool) });

    const resultaat = await verifieerMondayKoppeling();

    expect(resultaat.kolommen.find((k) => k.columnId === SCHOLEN_KOLOM.typeSchool)?.gevondenOpBoard).toBe(false);
    expect(resultaat.kolommen.find((k) => k.columnId === SCHOLEN_KOLOM.datumLaatsteContact)?.gevondenOpBoard).toBe(true);
  });

  it("leest de 3 huidige waarden van een expliciet aangewezen testitem", async () => {
    mockHaalBoard.mockResolvedValue({ id: SCHOLEN_BOARD_ID, name: "1: Scholen (Master Data)", columns: VOLLEDIGE_KOLOMMEN });
    mockHaalItem.mockResolvedValue({
      id: "999",
      name: "Testschool BV",
      column_values: [
        { id: SCHOLEN_KOLOM.datumLaatsteContact, text: "2026-08-01", value: null },
        { id: SCHOLEN_KOLOM.datumVolgendeActie, text: null, value: null },
        { id: SCHOLEN_KOLOM.typeSchool, text: "Montessori", value: null },
      ],
    });

    const resultaat = await verifieerMondayKoppeling("999");

    expect(mockHaalItem).toHaveBeenCalledWith("999", [SCHOLEN_KOLOM.datumLaatsteContact, SCHOLEN_KOLOM.datumVolgendeActie, SCHOLEN_KOLOM.typeSchool]);
    expect(resultaat.testitem).toEqual({ gevonden: true, naam: "Testschool BV" });
    expect(resultaat.kolommen.find((k) => k.columnId === SCHOLEN_KOLOM.typeSchool)?.huidigeWaarde).toBe("Montessori");
    expect(resultaat.kolommen.find((k) => k.columnId === SCHOLEN_KOLOM.datumVolgendeActie)?.huidigeWaarde).toBeNull();
  });

  it("meldt een niet-bestaand testitem duidelijk (gevonden: false), geen crash", async () => {
    mockHaalBoard.mockResolvedValue({ id: SCHOLEN_BOARD_ID, name: "1: Scholen (Master Data)", columns: VOLLEDIGE_KOLOMMEN });
    mockHaalItem.mockResolvedValue(null);

    const resultaat = await verifieerMondayKoppeling("00000");

    expect(resultaat.testitem).toEqual({ gevonden: false, naam: null });
    expect(resultaat.kolommen.every((k) => k.huidigeWaarde === undefined)).toBe(true);
  });

  it("geeft boardBereikbaar: false en de fout terug wanneer het board niet leesbaar is — geen crash, geen token in de foutmelding", async () => {
    mockHaalBoard.mockRejectedValue(new Error("Monday API-aanroep mislukt (HTTP 401)."));

    const resultaat = await verifieerMondayKoppeling();

    expect(resultaat.boardBereikbaar).toBe(false);
    expect(resultaat.fout).toBe("Monday API-aanroep mislukt (HTTP 401).");
    expect(resultaat.fout).not.toMatch(/Bearer|token/i);
  });
});

describe("voerDiagnostischeSchrijfTest — echte primitief + leest-na-schrijven-bewijs", () => {
  it("schrijft via de echte voerWriteBackUit met forceerDiagnostisch:true en bewijst de wijziging door opnieuw te lezen", async () => {
    mockVoerWriteBackUit.mockResolvedValue({ status: "geschreven", boodschap: "Weggeschreven naar Monday." });
    mockHaalItem.mockResolvedValue({ id: "999", name: "Testschool BV", column_values: [{ id: SCHOLEN_KOLOM.typeSchool, text: "Montessori", value: null }] });

    const resultaat = await voerDiagnostischeSchrijfTest(maakPayload(), {
      schoolId: 1,
      mondayItemId: "999",
      columnId: SCHOLEN_KOLOM.typeSchool,
      verwachteHuidigeWaarde: null,
      testWaarde: "Montessori",
      actorId: 7,
    });

    expect(mockVoerWriteBackUit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mondayItemId: "999", columnId: SCHOLEN_KOLOM.typeSchool, nieuweWaarde: "Montessori", bron: "diagnostische_test", forceerDiagnostisch: true })
    );
    expect(resultaat.gelezenNaSchrijven).toBe("Montessori");
    expect(resultaat.bevestigd).toBe(true);
  });

  it("markeert bevestigd: false wanneer de teruggelezen waarde NIET overeenkomt met de testwaarde — het hele punt van deze functie", async () => {
    mockVoerWriteBackUit.mockResolvedValue({ status: "geschreven", boodschap: "Weggeschreven naar Monday." });
    mockHaalItem.mockResolvedValue({ id: "999", name: "Testschool BV", column_values: [{ id: SCHOLEN_KOLOM.typeSchool, text: "Domein onderwijs", value: null }] });

    const resultaat = await voerDiagnostischeSchrijfTest(maakPayload(), {
      schoolId: 1,
      mondayItemId: "999",
      columnId: SCHOLEN_KOLOM.typeSchool,
      verwachteHuidigeWaarde: null,
      testWaarde: "Montessori",
      actorId: 7,
    });

    expect(resultaat.gelezenNaSchrijven).toBe("Domein onderwijs");
    expect(resultaat.bevestigd).toBe(false);
  });

  it("leest niet opnieuw wanneer de schrijfpoging zelf al mislukt/conflicteert", async () => {
    mockVoerWriteBackUit.mockResolvedValue({ status: "conflict", boodschap: "Conflict." });

    const resultaat = await voerDiagnostischeSchrijfTest(maakPayload(), {
      schoolId: 1,
      mondayItemId: "999",
      columnId: SCHOLEN_KOLOM.typeSchool,
      verwachteHuidigeWaarde: null,
      testWaarde: "Montessori",
      actorId: 7,
    });

    expect(mockHaalItem).not.toHaveBeenCalled();
    expect(resultaat.bevestigd).toBe(false);
    expect(resultaat.gelezenNaSchrijven).toBeNull();
  });
});

describe("voerDiagnostischeTerugzetting — dezelfde veilige weg, bron diagnostische_terugzetting", () => {
  it("zet de oorspronkelijke waarde terug via hetzelfde veilige pad", async () => {
    mockVoerWriteBackUit.mockResolvedValue({ status: "geschreven", boodschap: "Weggeschreven naar Monday." });
    mockHaalItem.mockResolvedValue({ id: "999", name: "Testschool BV", column_values: [{ id: SCHOLEN_KOLOM.typeSchool, text: "Domein onderwijs", value: null }] });

    const resultaat = await voerDiagnostischeTerugzetting(maakPayload(), {
      schoolId: 1,
      mondayItemId: "999",
      columnId: SCHOLEN_KOLOM.typeSchool,
      oorspronkelijkeWaarde: "Domein onderwijs",
      verwachteHuidigeWaarde: "Montessori",
      actorId: 7,
    });

    expect(mockVoerWriteBackUit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nieuweWaarde: "Domein onderwijs", bron: "diagnostische_terugzetting", forceerDiagnostisch: true })
    );
    expect(resultaat.bevestigd).toBe(true);
  });

  it("weigert automatisch terugzetten naar 'leeg' — geen gok, expliciete melding, geen Monday-aanroep", async () => {
    const resultaat = await voerDiagnostischeTerugzetting(maakPayload(), {
      schoolId: 1,
      mondayItemId: "999",
      columnId: SCHOLEN_KOLOM.typeSchool,
      oorspronkelijkeWaarde: null,
      verwachteHuidigeWaarde: "Montessori",
      actorId: 7,
    });

    expect(mockVoerWriteBackUit).not.toHaveBeenCalled();
    expect(resultaat.schrijfResultaat.status).toBe("mislukt");
    expect(resultaat.schrijfResultaat.boodschap).toMatch(/handmatig/);
  });
});
