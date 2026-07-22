"use client";

import { useEffect, useState } from "react";

// Gedeelde, domein-onwetende hook — zie docs/PLATFORM-FOUNDATION.md §1.
// Domeinspecifieke hooks (bv. useArtikelData) horen in de bijbehorende
// features/-map, niet hier.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const onChange = () => setMatches(mediaQueryList.matches);

    onChange();
    mediaQueryList.addEventListener("change", onChange);
    return () => mediaQueryList.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
