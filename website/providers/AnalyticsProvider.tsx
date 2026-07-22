"use client";

import { createContext, useContext, useCallback, type ReactNode } from "react";

interface AnalyticsState {
  track: (event: string, properties?: Record<string, unknown>) => void;
}

const AnalyticsContext = createContext<AnalyticsState | null>(null);

// No-op-implementatie: uitgebreide analytics is bewust uitgesteld (zie
// docs/PROJECT.md §Fasering). Deze abstractie bestaat zodat componenten later
// niet hoeven te wachten op een leverancierskeuze — track() wordt pas
// doorverbonden naar services/analytics.ts zodra die dienst gekozen is.
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const track = useCallback((_event: string, _properties?: Record<string, unknown>) => {
    // Bewust leeg in Fase 1.
  }, []);

  return <AnalyticsContext.Provider value={{ track }}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsState {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error("useAnalytics moet binnen een AnalyticsProvider gebruikt worden");
  }
  return context;
}
