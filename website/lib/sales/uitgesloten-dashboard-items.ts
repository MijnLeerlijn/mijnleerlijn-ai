// Monday-items op board 18420120365 die geen klant en geen licentie zijn.
// Ze blijven in Monday en in de sync; alleen de dashboardtellingen slaan ze over.
// De losse scholen met een vergelijkbare naam tellen wél mee.
const UITGESLOTEN_DASHBOARD_ITEM_IDS = new Set([
  // Montessorischool de Basis en de Kraal: alleen een trainingsitem.
  "12993435378",
]);

export function teltMeeInDashboard(mondayItemId: string | number | null | undefined): boolean {
  if (mondayItemId == null) return true;
  const id = String(mondayItemId).trim();
  return id.length > 0 && !UITGESLOTEN_DASHBOARD_ITEM_IDS.has(id);
}
