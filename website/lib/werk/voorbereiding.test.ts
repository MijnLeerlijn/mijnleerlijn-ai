import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bepaalVoorbereidingKandidaten,
  haalVoorbereidingSignalen,
  dempSignaal,
  maakVoorbereidingstaak,
  herinnerMorgen,
  PREP_LOOKAHEAD_DAGEN,
} from "./voorbereiding";
import type { GoogleCalendarEvent } from "@/lib/google-calendar/api";
import type { SchoolOptie } from "./school-matching";

const VANDAAG = "2026-08-17";

function event(overrides: Partial<GoogleCalendarEvent> & { id: string; datum: string; titel: string }): GoogleCalendarEvent {
  return { volledigeDag: false, tijd: null, eindTijd: null, ...overrides };
}

const SCHOLEN: SchoolOptie[] = [
  { id: 1, schoolName: "Springplank" },
  { id: 2, schoolName: "De Horizon" },
  { id: 3, schoolName: "Montessorischool De Horizon" },
];

describe("bepaalVoorbereidingKandidaten — puur, deterministisch, geen AI", () => {
  it("herkent de genoemde trefwoorden (training/presentatie/demo/kennismaking/schoolbezoek/bestuursvergadering)", () => {
    const events = [
      event({ id: "1", datum: "2026-08-19", titel: "Training bij Springplank" }),
      event({ id: "2", datum: "2026-08-19", titel: "Presentatie voorstel" }),
      event({ id: "3", datum: "2026-08-19", titel: "Demo nieuwe app" }),
      event({ id: "4", datum: "2026-08-19", titel: "Kennismaking met bestuur" }),
      event({ id: "5", datum: "2026-08-19", titel: "Schoolbezoek De Horizon" }),
      event({ id: "6", datum: "2026-08-19", titel: "Bestuursvergadering" }),
    ];
    expect(bepaalVoorbereidingKandidaten(events, [], VANDAAG)).toHaveLength(6);
  });

  it("negeert events zonder een van de trefwoorden", () => {
    const events = [event({ id: "1", datum: "2026-08-19", titel: "Lunchafspraak" })];
    expect(bepaalVoorbereidingKandidaten(events, [], VANDAAG)).toEqual([]);
  });

  it("berekent dagenTotEvent correct", () => {
    const events = [event({ id: "1", datum: "2026-08-19", titel: "Training" })];
    expect(bepaalVoorbereidingKandidaten(events, [], VANDAAG)[0]!.dagenTotEvent).toBe(2);
  });

  it("koppelt een betrouwbaar herkende school", () => {
    const events = [event({ id: "1", datum: "2026-08-19", titel: "Training bij Springplank" })];
    const kandidaat = bepaalVoorbereidingKandidaten(events, SCHOLEN, VANDAAG)[0]!;
    expect(kandidaat.school?.id).toBe(1);
    expect(kandidaat.schoolTwijfel).toBe(false);
  });

  it("koppelt GEEN school bij twijfel (2+ kandidaten) — schoolTwijfel: true, school: null", () => {
    const events = [event({ id: "1", datum: "2026-08-19", titel: "Training bij Montessorischool De Horizon" })];
    const kandidaat = bepaalVoorbereidingKandidaten(events, SCHOLEN, VANDAAG)[0]!;
    expect(kandidaat.school).toBeNull();
    expect(kandidaat.schoolTwijfel).toBe(true);
  });

  it("school: null zonder enige herkenning (geen gok)", () => {
    const events = [event({ id: "1", datum: "2026-08-19", titel: "Training bij een onbekende school" })];
    const kandidaat = bepaalVoorbereidingKandidaten(events, SCHOLEN, VANDAAG)[0]!;
    expect(kandidaat.school).toBeNull();
    expect(kandidaat.schoolTwijfel).toBe(false);
  });

  it("PREP_LOOKAHEAD_DAGEN is 2-3 dagen (opdrachtseis)", () => {
    expect(PREP_LOOKAHEAD_DAGEN).toBeGreaterThanOrEqual(2);
    expect(PREP_LOOKAHEAD_DAGEN).toBeLessThanOrEqual(3);
  });
});

function maakFakePayload() {
  const docs: Record<number, Record<string, unknown>> = {};
  let volgendeId = 100;
  return {
    docs,
    find: vi.fn(async ({ collection, where }: { collection: string; where?: unknown }) => {
      if (collection !== "voorbereiding-signalen") return { docs: [] };
      const alle = Object.values(docs);
      // Zeer eenvoudige, testdoeleinde-only where-interpretatie: filtert op eigenaar/eventId(-in) wanneer aanwezig.
      const w = where as { and?: Array<Record<string, { equals?: unknown; in?: unknown[] }>> } | undefined;
      const eigenaarClause = w?.and?.find((c) => "eigenaar" in c)?.eigenaar;
      const eventIdClause = w?.and?.find((c) => "eventId" in c)?.eventId;
      const gefilterd = alle.filter((d) => {
        if (eigenaarClause?.equals !== undefined && d.eigenaar !== eigenaarClause.equals) return false;
        if (eventIdClause?.equals !== undefined && d.eventId !== eventIdClause.equals) return false;
        if (eventIdClause?.in !== undefined && !eventIdClause.in.includes(d.eventId)) return false;
        return true;
      });
      return { docs: gefilterd };
    }),
    create: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      const id = volgendeId++;
      const doc = { id, ...data };
      if (collection === "voorbereiding-signalen") docs[id] = doc;
      return doc;
    }),
    update: vi.fn(async ({ collection, id, data }: { collection: string; id: number; data: Record<string, unknown> }) => {
      if (collection === "voorbereiding-signalen" && docs[id]) Object.assign(docs[id]!, data);
      return { id, ...data };
    }),
  };
}

describe("haalVoorbereidingSignalen — Payload-aware: kruist met bestaande statussen", () => {
  it("levert status 'gesignaleerd' zonder bestaande rij", async () => {
    const payload = maakFakePayload();
    const events = [event({ id: "evt1", datum: "2026-08-19", titel: "Training" })];

    const resultaat = await haalVoorbereidingSignalen(payload as never, 1, events, [], VANDAAG);

    expect(resultaat).toHaveLength(1);
    expect(resultaat[0]!.status).toBe("gesignaleerd");
    expect(resultaat[0]!.signaalId).toBeNull();
  });

  it("een gedempt signaal blijft gedempt bij een volgende lezing (verdwijnt niet vanzelf terug naar 'gesignaleerd')", async () => {
    const payload = maakFakePayload();
    const events = [event({ id: "evt1", datum: "2026-08-19", titel: "Training" })];

    await dempSignaal(payload as never, 1, { eventId: "evt1", eventStart: "2026-08-19T09:00:00Z", eventTitel: "Training", schoolId: null });
    const resultaat = await haalVoorbereidingSignalen(payload as never, 1, events, [], VANDAAG);

    expect(resultaat[0]!.status).toBe("gedempt");
  });

  it("isoleert per eigenaar — gebruiker B ziet niet het gedempte signaal van gebruiker A", async () => {
    const payload = maakFakePayload();
    const events = [event({ id: "evt1", datum: "2026-08-19", titel: "Training" })];

    await dempSignaal(payload as never, 1, { eventId: "evt1", eventStart: "2026-08-19T09:00:00Z", eventTitel: "Training", schoolId: null });
    const resultaatB = await haalVoorbereidingSignalen(payload as never, 2, events, [], VANDAAG);

    expect(resultaatB[0]!.status).toBe("gesignaleerd");
  });
});

describe("maakVoorbereidingstaak — maakt een personal-task en koppelt het signaal", () => {
  it("maakt een taak gedateerd op vandaag met een standaardtitel, en zet status taak_aangemaakt", async () => {
    const payload = maakFakePayload();

    const { taakId } = await maakVoorbereidingstaak(
      payload as never,
      1,
      { eventId: "evt1", eventStart: "2026-08-19T09:00:00Z", eventTitel: "Training bij Springplank", schoolId: 5 },
      VANDAAG
    );

    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "personal-tasks",
        data: expect.objectContaining({ titel: "Voorbereiden: Training bij Springplank", datum: VANDAAG, school: 5, eigenaar: 1 }),
      })
    );
    expect(taakId).toBeGreaterThan(0);

    const signalen = await haalVoorbereidingSignalen(
      payload as never,
      1,
      [event({ id: "evt1", datum: "2026-08-19", titel: "Training bij Springplank" })],
      [],
      VANDAAG
    );
    expect(signalen[0]!.status).toBe("taak_aangemaakt");
    expect(signalen[0]!.gekoppeldeTaakId).toBe(taakId);
  });

  it("staat een titel-/beschrijving-override toe (voor een geaccepteerd AI-voorstel)", async () => {
    const payload = maakFakePayload();
    await maakVoorbereidingstaak(
      payload as never,
      1,
      { eventId: "evt1", eventStart: "2026-08-19T09:00:00Z", eventTitel: "Training", schoolId: null },
      VANDAAG,
      { titel: "AI-titel", beschrijving: "AI-beschrijving" }
    );

    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ titel: "AI-titel", beschrijving: "AI-beschrijving" }) })
    );
  });
});

describe("herinnerMorgen — maakt een herinneringstaak gedateerd op de meegegeven dag, status uitgesteld", () => {
  it("dateert de taak op de meegegeven 'morgen', niet vandaag", async () => {
    const payload = maakFakePayload();
    const morgen = "2026-08-18";

    await herinnerMorgen(payload as never, 1, { eventId: "evt1", eventStart: "2026-08-19T09:00:00Z", eventTitel: "Training", schoolId: null }, morgen);

    expect(payload.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ datum: morgen }) }));

    const signalen = await haalVoorbereidingSignalen(
      payload as never,
      1,
      [event({ id: "evt1", datum: "2026-08-19", titel: "Training" })],
      [],
      VANDAAG
    );
    expect(signalen[0]!.status).toBe("uitgesteld");
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
