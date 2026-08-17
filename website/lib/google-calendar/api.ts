// Live Calendar-eventlezing — geen bulkopslag, geen event-mirror (zie
// payload/collections/GoogleConnections.ts se toelichting en de opdracht:
// "geselecteerde dag, evt. een paar dagen vooruit ... geen deelnemerslijsten/
// beschrijvingen/eventbodies lokaal dupliceren tenzij strikt noodzakelijk").
// Rechtstreekse fetch naar de Calendar API v3, zelfde stijl als lib/gmail/api.ts
// (geen googleapis-SDK).
//
// V1 leest uitsluitend de PRIMARY-agenda (opdrachtseis: "V1 primary calendar,
// tenzij bestaande Google-API-logica een nette multi-calendar-oplossing
// triviaal maakt" — dat is hier niet het geval: multi-calendar zou een
// aparte calendarList-aanroep + per-calendar events.list + merge-logica
// vergen, geen triviale toevoeging).

const GOOGLE_CALENDAR_EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface RuwGoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

export interface GoogleCalendarEvent {
  id: string;
  titel: string;
  volledigeDag: boolean;
  /** YYYY-MM-DD — lokale kalenderdag van de start, al in de agenda-tijdzone (zie de toelichting bij lokaleDatum/lokaleTijd hieronder). */
  datum: string;
  /** HH:MM, null voor hele-dag-events. */
  tijd: string | null;
  /** HH:MM, null voor hele-dag-events. */
  eindTijd: string | null;
}

// Google levert dateTime voor getimede events altijd MET het numerieke
// offset van de agenda-tijdzone zelf (bv. "2026-08-20T09:00:00+02:00"), niet
// genormaliseerd naar UTC — de YYYY-MM-DD/HH:MM-substring is dus al de
// correcte lokale waarde. Zelfde timezone-veilige substring-conventie als
// lib/sales/format-datum.ts/vandaag.ts (die bestanden bestaan juist om een
// eerdere UTC-verschuivingsbug te voorkomen) — GEEN Date-object-aanmaak/
// -herformattering hier, dat zou dat euvel opnieuw kunnen introduceren.
function lokaleDatum(dateTimeIso: string): string {
  return dateTimeIso.slice(0, 10);
}
function lokaleTijd(dateTimeIso: string): string {
  return dateTimeIso.slice(11, 16);
}

function naarGoogleCalendarEvent(event: RuwGoogleEvent): GoogleCalendarEvent | null {
  if (!event.id) return null;

  if (event.start?.date) {
    // Hele-dag-event: alleen een datum, geen tijd/tijdzone in de payload.
    return {
      id: event.id,
      titel: event.summary?.trim() || "(geen titel)",
      volledigeDag: true,
      datum: event.start.date,
      tijd: null,
      eindTijd: null,
    };
  }

  if (event.start?.dateTime) {
    return {
      id: event.id,
      titel: event.summary?.trim() || "(geen titel)",
      volledigeDag: false,
      datum: lokaleDatum(event.start.dateTime),
      tijd: lokaleTijd(event.start.dateTime),
      eindTijd: event.end?.dateTime ? lokaleTijd(event.end.dateTime) : null,
    };
  }

  return null; // Onverwacht event zonder start (zou niet moeten voorkomen) — defensief overslaan i.p.v. crashen.
}

export interface AgendaEventsResultaat {
  events: GoogleCalendarEvent[];
  timeZone: string;
}

/**
 * Haalt events op in [timeMinIso, timeMaxIso). singleEvents=true zet
 * herhalende afspraken om in losse instanties (nodig voor correcte weergave
 * EN om showDeleted=false geannuleerde losse instanties te laten uitsluiten).
 * Geannuleerde events worden hieronder DAARNAAST nog eens defensief
 * weggefilterd (status === "cancelled") — nooit op één enkele laag
 * vertrouwen voor "nooit tonen" (opdrachtseis).
 */
export async function fetchAgendaEventsInBereik(
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<AgendaEventsResultaat> {
  const params = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: "true",
    orderBy: "startTime",
    showDeleted: "false",
    maxResults: "250",
  });

  const response = await fetch(`${GOOGLE_CALENDAR_EVENTS_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const tekst = await response.text().catch(() => "");
    throw new Error(`Ophalen agenda-events mislukt (${response.status}): ${tekst}`);
  }

  const body = (await response.json()) as { timeZone?: string; items?: RuwGoogleEvent[] };
  const events = (body.items ?? [])
    .filter((event) => event.status !== "cancelled")
    .map(naarGoogleCalendarEvent)
    .filter((event): event is GoogleCalendarEvent => event !== null);

  return { events, timeZone: body.timeZone ?? "UTC" };
}

export interface GoogleCalendarEventMetBeschrijving extends GoogleCalendarEvent {
  beschrijving: string | null;
}

/**
 * Haalt ÉÉN specifiek event op, MET beschrijving — anders dan
 * fetchAgendaEventsInBereik (dagoverzicht, bewust zonder beschrijving/
 * deelnemers, zie de moduletoelichting) is dit uitsluitend voor het
 * expliciet-klik-only AI-voorbereidingsvoorstel (app/api/werk/voorbereiding/
 * ai-voorstel): dáár is de beschrijving genuinely nodig voor een zinnig
 * voorstel, en wordt hij nooit verder opgeslagen dan die ene AI-aanroep.
 * Geeft null terug voor een niet-(meer-)bestaand/geannuleerd event i.p.v. te
 * gooien — de aanroeper toont dan nette "niet meer beschikbaar", geen crash.
 */
export async function fetchAgendaEventById(accessToken: string, eventId: string): Promise<GoogleCalendarEventMetBeschrijving | null> {
  const response = await fetch(`${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) {
    const tekst = await response.text().catch(() => "");
    throw new Error(`Ophalen agenda-event mislukt (${response.status}): ${tekst}`);
  }

  const raw = (await response.json()) as RuwGoogleEvent;
  if (raw.status === "cancelled") return null;

  const basis = naarGoogleCalendarEvent(raw);
  if (!basis) return null;

  return { ...basis, beschrijving: raw.description?.trim() || null };
}

/**
 * Geeft het UTC-instant van lokale middernacht (00:00) op `datumIso` in
 * `tijdZone` — nodig om timeMin/timeMax correct te bepalen: de server draait
 * in UTC, dus "vandaag 00:00" in de agenda-tijdzone valt NIET samen met
 * "vandaag 00:00 UTC" (dat zou events rond middernacht foutief kunnen missen
 * of dubbel over de daggrens laten vallen — exact de klasse
 * tijdzonebug die de opdracht met "geen events die middernacht overspannen"
 * benoemt). Standaardtechniek zonder datumbibliotheek: formatteer een
 * UTC-gok in de doeltijdzone, en corrigeer met het gemeten verschil —
 * Intl.DateTimeFormat past hierbij automatisch de juiste DST-regel toe voor
 * díe specifieke datum.
 */
export function lokaleMiddernachtAlsUtc(datumIso: string, tijdZone: string): Date {
  const [jaar, maand, dag] = datumIso.split("-").map(Number) as [number, number, number];
  const gok = Date.UTC(jaar, maand - 1, dag, 0, 0, 0);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tijdZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const delen = fmt.formatToParts(new Date(gok));
  const waarde = (type: string) => Number(delen.find((d) => d.type === type)?.value ?? 0);
  const lokaalAlsUtc = Date.UTC(waarde("year"), waarde("month") - 1, waarde("day"), waarde("hour") % 24, waarde("minute"), waarde("second"));
  const verschilMs = lokaalAlsUtc - gok;
  return new Date(gok - verschilMs);
}

/** Eén kalenderdag verder, puur op de YYYY-MM-DD-string (UTC-interne rekenwijze, geen lokale-tijdzone-aanname). */
export function volgendeDagIso(datumIso: string): string {
  const [jaar, maand, dag] = datumIso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(jaar, maand - 1, dag + 1)).toISOString().slice(0, 10);
}
