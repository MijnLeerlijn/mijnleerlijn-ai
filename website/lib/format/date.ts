// Domeinkennis (Nederlandse datumweergave voor het platform), geen React —
// zie docs/PLATFORM-FOUNDATION.md §1 voor het onderscheid met utils/.
export function formatDatumNL(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
