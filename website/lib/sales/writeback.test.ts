import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { voerWriteBackUit, schrijfDatumLaatsteContactTerug, schrijfDatumVolgendeActieTerug, schrijfTypeSchoolTerug } from "./writeback";
import { leesKolomWaarde } from "./monday-client";
import { SCHOLEN_KOLOM } from "./monday-columns";

vi.mock("./monday-client", () => ({ leesKolomWaarde: vi.fn() }));
const mockLeesKolomWaarde = vi.mocked(leesKolomWaarde);
const mockCreate = vi.fn();

function maakPayload(): Payload {
  return { create: mockCreate } as unknown as Payload;
}

beforeEach(() => {
  mockLeesKolomWaarde.mockReset();
  mockCreate.mockReset().mockResolvedValue({ id: 1 });
});

describe("voerWriteBackUit — read-then-write, conflictdetectie, logging", () => {
  it("leest eerst de actuele Monday-waarde vóór elke schrijfpoging", async () => {
    mockLeesKolomWaarde.mockResolvedValue({ id: SCHOLEN_KOLOM.typeSchool, text: null, value: null });

    await voerWriteBackUit(maakPayload(), {
      schoolId: 1,
      mondayItemId: "123",
      columnId: SCHOLEN_KOLOM.typeSchool,
      nieuweWaarde: "Montessori",
      verwachteHuidigeWaarde: null,
      actorId: 7,
      bron: "veld_correctie_voorstel",
    });

    expect(mockLeesKolomWaarde).toHaveBeenCalledWith("123", SCHOLEN_KOLOM.typeSchool);
  });

  it("weigert te schrijven bij een conflict (Monday-waarde afwijkt van de verwachte snapshot) — nooit stilzwijgend overschrijven", async () => {
    mockLeesKolomWaarde.mockResolvedValue({ id: SCHOLEN_KOLOM.typeSchool, text: "Domein onderwijs", value: null });

    const resultaat = await voerWriteBackUit(maakPayload(), {
      schoolId: 1,
      mondayItemId: "123",
      columnId: SCHOLEN_KOLOM.typeSchool,
      nieuweWaarde: "Montessori",
      verwachteHuidigeWaarde: null, // AI voorstel ging uit van "leeg"
      actorId: 7,
      bron: "veld_correctie_voorstel",
    });

    expect(resultaat.status).toBe("conflict");
    const logCall = mockCreate.mock.calls[0]![0];
    expect(logCall.data.type).toBe("monday_writeback");
    expect(logCall.data.payload.status).toBe("conflict");
  });

  it("gaat NIET in conflict wanneer verwachteHuidigeWaarde exact overeenkomt met de actuele waarde", async () => {
    mockLeesKolomWaarde.mockResolvedValue({ id: SCHOLEN_KOLOM.typeSchool, text: null, value: null });

    const resultaat = await voerWriteBackUit(maakPayload(), {
      schoolId: 1,
      mondayItemId: "123",
      columnId: SCHOLEN_KOLOM.typeSchool,
      nieuweWaarde: "Montessori",
      verwachteHuidigeWaarde: null,
      actorId: 7,
      bron: "veld_correctie_voorstel",
    });

    // Geen conflict — maar de mutatie zelf is bewust nog niet geactiveerd (zie volgende test).
    expect(resultaat.status).toBe("niet_geactiveerd");
  });

  it("BEWUST: de daadwerkelijke Monday-mutatie is nog niet geactiveerd — geen gegokte mutation-vorm verzonden", async () => {
    mockLeesKolomWaarde.mockResolvedValue({ id: SCHOLEN_KOLOM.typeSchool, text: null, value: null });

    const resultaat = await voerWriteBackUit(maakPayload(), {
      schoolId: 1,
      mondayItemId: "123",
      columnId: SCHOLEN_KOLOM.typeSchool,
      nieuweWaarde: "Montessori",
      verwachteHuidigeWaarde: null,
      actorId: 7,
      bron: "veld_correctie_voorstel",
    });

    expect(resultaat.status).toBe("niet_geactiveerd");
    expect(resultaat.boodschap).toMatch(/niet geactiveerd|niet.*geverifieerd/i);
  });

  it("logt oude waarde, nieuwe waarde, actor en tijdstip bij elke poging", async () => {
    mockLeesKolomWaarde.mockResolvedValue({ id: SCHOLEN_KOLOM.typeSchool, text: null, value: null });

    await voerWriteBackUit(maakPayload(), {
      schoolId: 1,
      mondayItemId: "123",
      columnId: SCHOLEN_KOLOM.typeSchool,
      nieuweWaarde: "Montessori",
      verwachteHuidigeWaarde: null,
      actorId: 7,
      bron: "veld_correctie_voorstel",
      relatedProposalId: 55,
    });

    const logCall = mockCreate.mock.calls[0]![0];
    expect(logCall.data.actor).toBe(7);
    expect(logCall.data.relatedProposal).toBe(55);
    expect(logCall.data.occurredAt).toBeDefined();
    expect(logCall.data.payload.oudeWaarde).toBeNull();
    expect(logCall.data.payload.nieuweWaarde).toBe("Montessori");
  });

  it("gebruikt uitsluitend een van de 3 toegestane column-ID's — een vrije string compileert niet (compile-time garantie, hier functioneel bevestigd)", () => {
    expect(SCHOLEN_KOLOM.typeSchool).toBe("dropdown_mm4v9rvg");
    expect(SCHOLEN_KOLOM.datumLaatsteContact).toBe("date_mm5q1phd");
    expect(SCHOLEN_KOLOM.datumVolgendeActie).toBe("date_mm5qswfk");
  });
});

describe("schrijfDatumLaatsteContactTerug — datumvergelijking, nooit regressie", () => {
  it("weigert een oudere/gelijke datum te schrijven over een al aanwezige, recentere Monday-datum", async () => {
    mockLeesKolomWaarde.mockResolvedValue({ id: SCHOLEN_KOLOM.datumLaatsteContact, text: "2026-08-10", value: null });

    const resultaat = await schrijfDatumLaatsteContactTerug(maakPayload(), 1, "123", "2026-08-05");

    expect(resultaat.status).toBe("conflict");
    expect(mockCreate).toHaveBeenCalledTimes(1); // alleen het conflict-logboekje, geen 2e read/write-log
  });

  it("staat een nieuwere datum toe (gaat door naar het generieke schrijfpad)", async () => {
    mockLeesKolomWaarde.mockResolvedValue({ id: SCHOLEN_KOLOM.datumLaatsteContact, text: "2026-08-01", value: null });

    const resultaat = await schrijfDatumLaatsteContactTerug(maakPayload(), 1, "123", "2026-08-11");

    expect(resultaat.status).toBe("niet_geactiveerd"); // mutatie zelf nog gated, maar geen conflict
  });

  it("schrijft door als er nog helemaal geen datum in Monday staat", async () => {
    mockLeesKolomWaarde.mockResolvedValue(null);

    const resultaat = await schrijfDatumLaatsteContactTerug(maakPayload(), 1, "123", "2026-08-11");

    expect(resultaat.status).toBe("niet_geactiveerd");
  });
});

describe("schrijfDatumVolgendeActieTerug — respecteert een al bestaande Monday-waarde", () => {
  it("gaat in conflict als Monday al een andere vervolgdatum heeft — nooit stil overschrijven", async () => {
    mockLeesKolomWaarde.mockResolvedValue({ id: SCHOLEN_KOLOM.datumVolgendeActie, text: "2026-09-01", value: null });

    const resultaat = await schrijfDatumVolgendeActieTerug(maakPayload(), 1, "123", "2026-09-10", 7);

    expect(resultaat.status).toBe("conflict");
  });
});

describe("schrijfTypeSchoolTerug — alleen na expliciete bevestiging (aanroeper-verantwoordelijkheid)", () => {
  it("geeft de opgegeven snapshot door aan het generieke conflictpad", async () => {
    mockLeesKolomWaarde.mockResolvedValue({ id: SCHOLEN_KOLOM.typeSchool, text: "Montessori", value: null });

    const resultaat = await schrijfTypeSchoolTerug(maakPayload(), 1, "123", "Domein onderwijs", "Montessori", 7, 55);

    // huidige waarde "Montessori" komt overeen met de meegegeven snapshot → geen conflict, wel nog niet-geactiveerd
    expect(resultaat.status).toBe("niet_geactiveerd");
  });

  it("gaat in conflict als iemand de Monday-waarde inmiddels handmatig heeft gewijzigd", async () => {
    mockLeesKolomWaarde.mockResolvedValue({ id: SCHOLEN_KOLOM.typeSchool, text: "Anders organiseren", value: null });

    const resultaat = await schrijfTypeSchoolTerug(maakPayload(), 1, "123", "Domein onderwijs", "Montessori", 7, 55);

    expect(resultaat.status).toBe("conflict");
  });
});
