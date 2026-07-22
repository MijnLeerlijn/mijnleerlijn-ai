// Gereserveerd integratiepunt voor een nog te kiezen analytics-leverancier.
// Uitgebreide analytics is bewust uitgesteld (zie docs/PROJECT.md §Fasering).
// providers/AnalyticsProvider.tsx roept dit aan zodra er een implementatie is.

export async function trackEvent(event: string, properties?: Record<string, unknown>): Promise<void> {
  throw new Error(`Nog niet geïmplementeerd (later, zie docs/PROJECT.md §Fasering): trackEvent("${event}")`);
}
