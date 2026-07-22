"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface SearchState {
  laatsteVraag: string | null;
  bezigMetZoeken: boolean;
  stelVraag: (vraag: string) => void;
  reset: () => void;
}

const SearchContext = createContext<SearchState | null>(null);

// Lokale (niet-server) staat van de in-place antwoordervaring — zie
// docs/HOMEPAGE-SPEC.md en docs/PLATFORM-FOUNDATION.md §6. Bewaart bewust
// geen antwoordinhoud buiten de sessie (zie docs/SECURITY-AND-PRIVACY.md over
// AI-vraaglogs). De homepage gebruikt in Fase 1–3 nog URL-state (?state=) als
// primair mechanisme (zie HOMEPAGE-SPEC.md) — deze provider is het
// voorbereide aanknopingspunt voor Fase 6, nog niet verplicht gebruikt.
export function SearchProvider({ children }: { children: ReactNode }) {
  const [laatsteVraag, setLaatsteVraag] = useState<string | null>(null);
  const [bezigMetZoeken, setBezigMetZoeken] = useState(false);

  const stelVraag = (vraag: string) => {
    setLaatsteVraag(vraag);
    setBezigMetZoeken(true);
  };

  const reset = () => {
    setLaatsteVraag(null);
    setBezigMetZoeken(false);
  };

  return (
    <SearchContext.Provider value={{ laatsteVraag, bezigMetZoeken, stelVraag, reset }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchState {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch moet binnen een SearchProvider gebruikt worden");
  }
  return context;
}
