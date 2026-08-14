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

/** Aantal hele dagen sinds `iso` (voor "geen contact gepland sinds X dagen"-teksten). */
export function dagenSinds(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const datum = new Date(iso).getTime();
  if (Number.isNaN(datum)) return null;
  return Math.max(0, Math.floor((Date.now() - datum) / (1000 * 60 * 60 * 24)));
}
