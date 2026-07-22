"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Variant } from "@/types/variant";

const VariantContext = createContext<Variant | null>(null);

interface VariantProviderProps {
  variant: Variant;
  children: ReactNode;
}

// Stelt de door de server (RootLayout, via lib/variant/get-active-variant.ts)
// herkende variant beschikbaar aan de hele boom. De accentkleur zelf komt niet
// via deze context in de opmaak terecht, maar via de CSS custom property
// --variant-accent (zie app/globals.css en app/layout.tsx) — deze context is
// voor componenten die de variant zelf nodig hebben (naam, terminologie, …).
export function VariantProvider({ variant, children }: VariantProviderProps) {
  return <VariantContext.Provider value={variant}>{children}</VariantContext.Provider>;
}

export function useVariant(): Variant {
  const context = useContext(VariantContext);
  if (!context) {
    throw new Error("useVariant moet binnen een VariantProvider gebruikt worden");
  }
  return context;
}
