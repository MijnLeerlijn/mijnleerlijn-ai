// Sales UX V2 (2026-08-14) — gedeelde datum-/type-weergave, gebruikt door
// alle Sales-admin-views (Vandaag/Scholen/Schooldetail/Acties/widget) i.p.v.
// losse `.slice(0,10)`/`toLocaleDateString`-aanroepen per bestand. Puur
// weergavelaag — raakt geen enkele opgeslagen waarde aan.
//
// TYPE_LABEL is een letterlijke kopie van de options-labels in
// payload/collections/SalesLogEvents.ts (niet rechtstreeks geïmporteerd: dat
// bestand is een Payload CollectionConfig, niet veilig om in "use
// client"-componenten te bundelen). Bij een wijziging aan die options ook
// hier bijwerken.
const TYPE_LABEL: Record<string, string> = {
  contact: "Contact",
  mail: "Mail",
  afspraak: "Afspraak",
  monday_status: "Monday-statuswijziging",
  ai_voorstel: "AI-voorstel",
  actie_gepland: "Actie gepland",
  actie_aangepast: "Actie aangepast",
  actie_afgerond: "Actie afgerond",
  actie_vervallen: "Actie vervallen",
  notitie: "Notitie",
  systeem: "Systeem",
  monday_writeback: "Monday write-back",
};

export function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

/** "13 mrt 2026" — korte NL-datum, geen tijd. */
export function formatKorteDatum(iso: string | null | undefined): string {
  if (!iso) return "—";
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return "—";
  return datum.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Sales UX-ronde 3 (2026-08-14) — "13 mrt 2026, 14:32", voor het logboek
 * (expliciete opdrachtseis: datum ÉN tijd per regel, i.t.t. de rest van
 * Sales waar alleen de datum relevant is).
 */
export function formatKorteDatumTijd(iso: string | null | undefined): string {
  if (!iso) return "—";
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return "—";
  return `${datum.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}, ${datum.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Aantal hele dagen sinds `iso` (voor "geen contact gepland sinds X dagen"-teksten). */
export function dagenSinds(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const datum = new Date(iso).getTime();
  if (Number.isNaN(datum)) return null;
  return Math.max(0, Math.floor((Date.now() - datum) / (1000 * 60 * 60 * 24)));
}

// Sales-productiecorrectie (2026-08-16) — timezone-veilige "vandaag"-bepaling.
// BUG gevonden bij onderzoek: SalesDashboardPaneel.tsx/SalesVandaagView.tsx
// hadden allebei hun EIGEN `vandaagIso()` als `new Date().toISOString().slice(0,10)`
// — dat rekent in UTC. Rond lokale middernacht (bv. 00:30 in Nederland, UTC+1/+2)
// geeft dat nog de vorige kalenderdag terug. `getFullYear()/getMonth()/getDate()`
// (i.p.v. de UTC-varianten) lezen de datum in de tijdzone van de browser zelf —
// dat IS de tijdzone van de gebruiker, precies wat hier nodig is. Nooit
// `toISOString()`/`getUTC*` gebruiken voor "welke kalenderdag is het nu".
export function lokaleDatumIso(datum: Date): string {
  const jaar = datum.getFullYear();
  const maand = String(datum.getMonth() + 1).padStart(2, "0");
  const dag = String(datum.getDate()).padStart(2, "0");
  return `${jaar}-${maand}-${dag}`;
}

/** "Vandaag" in de lokale tijdzone van de gebruiker (browser) — vervangt elke losse `new Date().toISOString().slice(0,10)`. */
export function vandaagIso(): string {
  return lokaleDatumIso(new Date());
}

/** Telt `dagen` (mag negatief) op bij een "YYYY-MM-DD"-datum — puur kalenderrekenen, geen tijdzone-gevoelige Date-aritmetiek op momenten. */
export function voegDagenToe(iso: string, dagen: number): string {
  const [jaar, maand, dag] = iso.split("-").map(Number) as [number, number, number];
  const datum = new Date(jaar, maand - 1, dag);
  datum.setDate(datum.getDate() + dagen);
  return lokaleDatumIso(datum);
}
