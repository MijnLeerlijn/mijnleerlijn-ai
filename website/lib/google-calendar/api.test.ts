import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAgendaEventsInBereik, lokaleMiddernachtAlsUtc, volgendeDagIso } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

// lokaleMiddernachtAlsUtc: bewuste tijdzonecorrectheidstest (de opdracht
// noemt expliciet "geen events die middernacht overspannen" als risico) —
// geverifieerd tegen bekende, echte UTC-offsets van Europe/Amsterdam
// (zomer/wintertijd) en America/New_York, niet alleen UTC zelf (waar een
// tijdzonebug toevallig onzichtbaar zou blijven).
describe("lokaleMiddernachtAlsUtc", () => {
  it("Europe/Amsterdam zomertijd (UTC+2): lokale middernacht is 22:00 UTC de dag ervoor", () => {
    expect(lokaleMiddernachtAlsUtc("2026-08-20", "Europe/Amsterdam").toISOString()).toBe("2026-08-19T22:00:00.000Z");
  });

  it("Europe/Amsterdam wintertijd (UTC+1): lokale middernacht is 23:00 UTC de dag ervoor", () => {
    expect(lokaleMiddernachtAlsUtc("2026-01-15", "Europe/Amsterdam").toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("America/New_York (negatief offset, UTC-4 in de zomer): lokale middernacht valt NA de UTC-kalenderdag", () => {
    expect(lokaleMiddernachtAlsUtc("2026-08-20", "America/New_York").toISOString()).toBe("2026-08-20T04:00:00.000Z");
  });

  it("UTC zelf: lokale middernacht is exact gelijk aan de UTC-kalenderdag", () => {
    expect(lokaleMiddernachtAlsUtc("2026-08-20", "UTC").toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });
});

describe("volgendeDagIso", () => {
  it("gewone dag", () => {
    expect(volgendeDagIso("2026-08-20")).toBe("2026-08-21");
  });

  it("maandwissel", () => {
    expect(volgendeDagIso("2026-08-31")).toBe("2026-09-01");
  });

  it("jaarwissel", () => {
    expect(volgendeDagIso("2026-12-31")).toBe("2027-01-01");
  });
});

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe("fetchAgendaEventsInBereik", () => {
  it("normaliseert een getimed event: datum/tijd al-lokale substring uit dateTime, geen Date-herformattering", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        timeZone: "Europe/Amsterdam",
        items: [
          {
            id: "evt1",
            summary: "Training Montessorischool X",
            start: { dateTime: "2026-08-20T09:00:00+02:00" },
            end: { dateTime: "2026-08-20T10:30:00+02:00" },
          },
        ],
      })
    );

    const { events, timeZone } = await fetchAgendaEventsInBereik("token", "2026-08-19T22:00:00.000Z", "2026-08-20T22:00:00.000Z");

    expect(timeZone).toBe("Europe/Amsterdam");
    expect(events).toEqual([
      { id: "evt1", titel: "Training Montessorischool X", volledigeDag: false, datum: "2026-08-20", tijd: "09:00", eindTijd: "10:30" },
    ]);
  });

  it("normaliseert een hele-dag-event zonder tijd/tijdzone", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        timeZone: "Europe/Amsterdam",
        items: [{ id: "evt2", summary: "Studiedag", start: { date: "2026-08-20" }, end: { date: "2026-08-21" } }],
      })
    );

    const { events } = await fetchAgendaEventsInBereik("token", "x", "y");
    expect(events).toEqual([{ id: "evt2", titel: "Studiedag", volledigeDag: true, datum: "2026-08-20", tijd: null, eindTijd: null }]);
  });

  it("sluit geannuleerde events uit — ook als de API showDeleted=false ooit zou negeren (verdedigingslaag)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        timeZone: "UTC",
        items: [
          { id: "evt3", status: "cancelled", summary: "Afgezegd", start: { dateTime: "2026-08-20T09:00:00Z" } },
          { id: "evt4", summary: "Blijft staan", start: { dateTime: "2026-08-20T10:00:00Z" } },
        ],
      })
    );

    const { events } = await fetchAgendaEventsInBereik("token", "x", "y");
    expect(events.map((e) => e.id)).toEqual(["evt4"]);
  });

  it("slaat events zonder id defensief over i.p.v. te crashen", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        timeZone: "UTC",
        items: [{ summary: "Geen id", start: { dateTime: "2026-08-20T09:00:00Z" } }],
      })
    );

    const { events } = await fetchAgendaEventsInBereik("token", "x", "y");
    expect(events).toEqual([]);
  });

  it("valt terug op '(geen titel)' bij een lege/ontbrekende summary", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, { timeZone: "UTC", items: [{ id: "evt5", start: { dateTime: "2026-08-20T09:00:00Z" } }] })
    );

    const { events } = await fetchAgendaEventsInBereik("token", "x", "y");
    expect(events[0]!.titel).toBe("(geen titel)");
  });

  it("gooit een duidelijke fout bij een niet-ok response, zonder de token te lekken", async () => {
    vi.stubGlobal("fetch", mockFetch(401, { error: "invalid_token" }));
    await expect(fetchAgendaEventsInBereik("geheim-token", "x", "y")).rejects.toThrow(/401/);
  });
});
