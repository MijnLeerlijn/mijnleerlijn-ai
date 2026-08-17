import type { Payload } from "payload";
import type { GoogleCalendarEvent } from "@/lib/google-calendar/api";
import { matchSchoolBetrouwbaar, type SchoolOptie } from "./school-matching";

// Mijn Werk Fase 2 (2026-08-17) — voorbereidingssignalen voor aankomende
// agenda-afspraken. Detectie is VOLLEDIG deterministisch (trefwoorden +
// lib/werk/school-matching.ts se strenge match-of-niets-functie) — GEEN
// AI-aanroep, opdrachtseis: "gebruik alleen AI als deterministische
// classificatie onvoldoende is" + "geen AI-call op iedere
// dashboard-refresh" (deze functie draait bij elke Vandaag-weergave). Het
// AI-voorbereidingsvoorstel zelf is een expliciet-klik-only, aparte stap
// (app/api/werk/voorbereiding/ai-voorstel, niet dit bestand).

/** Hoeveel dagen vooruit gekeken wordt — enige bron van waarheid, ook voor de route die het Calendar-leesvenster bepaalt. */
export const PREP_LOOKAHEAD_DAGEN = 3;

const PREP_TREFWOORDEN = ["training", "presentatie", "demo", "kennismaking", "schoolbezoek", "bestuursvergadering"];

function isPrepWaardig(titel: string): boolean {
  const genormaliseerd = titel.toLowerCase();
  return PREP_TREFWOORDEN.some((woord) => genormaliseerd.includes(woord));
}

function verschilInDagen(vanIso: string, totIso: string): number {
  const [vj, vm, vd] = vanIso.split("-").map(Number) as [number, number, number];
  const [tj, tm, td] = totIso.split("-").map(Number) as [number, number, number];
  const van = Date.UTC(vj, vm - 1, vd);
  const tot = Date.UTC(tj, tm - 1, td);
  return Math.round((tot - van) / 86_400_000);
}

export interface VoorbereidingKandidaat {
  event: GoogleCalendarEvent;
  school: SchoolOptie | null;
  /** true wanneer er 2+ scholen matchten — geen automatische koppeling, de UI toont dan "School koppelen". */
  schoolTwijfel: boolean;
  dagenTotEvent: number;
}

/**
 * Puur, deterministisch: welke look-ahead-events verdienen een
 * voorbereidingssignaal, en welke school (indien betrouwbaar herkend) erbij
 * hoort. Geen Payload-afhankelijkheid — testbaar zonder mocks, zelfde
 * "pure kernfunctie + Payload-aware orchestrator eromheen"-scheiding als
 * lib/sales/vandaag.ts (puur) vs lib/werk/wachten-op.ts (Payload-aware).
 */
export function bepaalVoorbereidingKandidaten(events: GoogleCalendarEvent[], scholen: SchoolOptie[], vandaag: string): VoorbereidingKandidaat[] {
  return events
    .filter((event) => isPrepWaardig(event.titel))
    .map((event) => {
      const match = matchSchoolBetrouwbaar(event.titel, scholen);
      return {
        event,
        school: match.school,
        schoolTwijfel: match.kandidaten.length > 1,
        dagenTotEvent: verschilInDagen(vandaag, event.datum),
      };
    });
}

export type VoorbereidingStatus = "gesignaleerd" | "gedempt" | "uitgesteld" | "taak_aangemaakt";

export interface VoorbereidingSignaalWeergave extends VoorbereidingKandidaat {
  status: VoorbereidingStatus;
  signaalId: number | null;
  gekoppeldeTaakId: number | null;
}

interface VoorbereidingSignaalRij {
  id: number;
  eventId: string;
  status: VoorbereidingStatus;
  gekoppeldeTaak: number | { id: number } | null;
}

/** Payload-aware: kruist de deterministische kandidaten met bestaande voorbereiding-signalen-rijen van deze gebruiker (weggeklikt/uitgesteld/taak-aangemaakt blijft zo, i.p.v. bij elke lezing opnieuw "gesignaleerd"). */
export async function haalVoorbereidingSignalen(
  payload: Payload,
  eigenaarId: number,
  events: GoogleCalendarEvent[],
  scholen: SchoolOptie[],
  vandaag: string
): Promise<VoorbereidingSignaalWeergave[]> {
  const kandidaten = bepaalVoorbereidingKandidaten(events, scholen, vandaag);
  if (kandidaten.length === 0) return [];

  const eventIds = kandidaten.map((k) => k.event.id);
  const bestaande = await payload.find({
    collection: "voorbereiding-signalen",
    where: { and: [{ eigenaar: { equals: eigenaarId } }, { eventId: { in: eventIds } }] },
    limit: eventIds.length,
    depth: 0,
    overrideAccess: true,
  });
  const perEventId = new Map((bestaande.docs as unknown as VoorbereidingSignaalRij[]).map((rij) => [rij.eventId, rij]));

  return kandidaten.map((kandidaat) => {
    const rij = perEventId.get(kandidaat.event.id);
    const gekoppeldeTaak = rij?.gekoppeldeTaak ?? null;
    return {
      ...kandidaat,
      status: rij?.status ?? "gesignaleerd",
      signaalId: rij?.id ?? null,
      gekoppeldeTaakId: gekoppeldeTaak === null ? null : typeof gekoppeldeTaak === "number" ? gekoppeldeTaak : gekoppeldeTaak.id,
    };
  });
}

async function vindOfMaakSignaalRij(
  payload: Payload,
  eigenaarId: number,
  eventId: string,
  eventStart: string,
  schoolId: number | null
): Promise<{ id: number }> {
  const bestaand = await payload.find({
    collection: "voorbereiding-signalen",
    where: { and: [{ eigenaar: { equals: eigenaarId } }, { eventId: { equals: eventId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (bestaand.docs[0]) return bestaand.docs[0] as unknown as { id: number };

  return (await payload.create({
    collection: "voorbereiding-signalen",
    overrideAccess: true,
    data: { eigenaar: eigenaarId, eventId, eventStart, school: schoolId, status: "gesignaleerd" },
  })) as unknown as { id: number };
}

export interface VoorbereidingEventContext {
  eventId: string;
  /** ISO-datetime van de eventstart — uitsluitend voor de signaalrij zelf (weergave/diagnose), geen matchlogica leest dit terug. */
  eventStart: string;
  eventTitel: string;
  schoolId: number | null;
}

/** "Ik ben al voorbereid" — dempt het signaal permanent (tot een eventuele volgende, andere afspraak). Maakt nooit een taak aan. */
export async function dempSignaal(payload: Payload, eigenaarId: number, event: VoorbereidingEventContext): Promise<void> {
  const rij = await vindOfMaakSignaalRij(payload, eigenaarId, event.eventId, event.eventStart, event.schoolId);
  await payload.update({ collection: "voorbereiding-signalen", id: rij.id, overrideAccess: true, data: { status: "gedempt" } });
}

export interface MaakVoorbereidingstaakOpties {
  /** Override — standaard "Voorbereiden: <eventtitel>". Gebruikt door het AI-voorstel (lib/werk/voorbereiding-ai.ts) voor een specifiekere titel. */
  titel?: string;
  beschrijving?: string;
  /** YYYY-MM-DD — standaard vandaag, zodat de taak meteen in de huidige Vandaag-lijst verschijnt. */
  datum?: string;
}

/**
 * "Maak voorbereidingstaak" (en de basis voor een geaccepteerd AI-voorstel,
 * zie opties) — maakt een gewone personal-task aan (nooit automatisch, altijd
 * via een expliciete gebruikersactie op de kaart) en koppelt het signaal
 * eraan (status "taak_aangemaakt").
 */
export async function maakVoorbereidingstaak(
  payload: Payload,
  eigenaarId: number,
  event: VoorbereidingEventContext,
  vandaag: string,
  opties: MaakVoorbereidingstaakOpties = {}
): Promise<{ taakId: number }> {
  const taak = await payload.create({
    collection: "personal-tasks",
    overrideAccess: true,
    data: {
      titel: opties.titel ?? `Voorbereiden: ${event.eventTitel}`,
      beschrijving: opties.beschrijving ?? null,
      datum: opties.datum ?? vandaag,
      status: "open",
      school: event.schoolId,
      eigenaar: eigenaarId,
    },
  });

  const rij = await vindOfMaakSignaalRij(payload, eigenaarId, event.eventId, event.eventStart, event.schoolId);
  await payload.update({
    collection: "voorbereiding-signalen",
    id: rij.id,
    overrideAccess: true,
    data: { status: "taak_aangemaakt", gekoppeldeTaak: taak.id },
  });

  return { taakId: taak.id as number };
}

/** "Herinner morgen" — maakt een lichte, taak-achtige herinnering aan (geen los reminder-mechanisme, opdrachtseis) en dempt het signaal (status "uitgesteld"). */
export async function herinnerMorgen(
  payload: Payload,
  eigenaarId: number,
  event: VoorbereidingEventContext,
  morgen: string
): Promise<{ taakId: number }> {
  const taak = await payload.create({
    collection: "personal-tasks",
    overrideAccess: true,
    data: {
      titel: `Herinnering: bereid je voor op ${event.eventTitel}`,
      datum: morgen,
      status: "open",
      school: event.schoolId,
      eigenaar: eigenaarId,
    },
  });

  const rij = await vindOfMaakSignaalRij(payload, eigenaarId, event.eventId, event.eventStart, event.schoolId);
  await payload.update({
    collection: "voorbereiding-signalen",
    id: rij.id,
    overrideAccess: true,
    data: { status: "uitgesteld", gekoppeldeTaak: taak.id },
  });

  return { taakId: taak.id as number };
}
