import type { ReactNode } from "react";
import { notFound } from "next/navigation";

// Alleen in development bereikbaar — zie docs/IMPLEMENTATION-PLAN.md Fase 2
// stap 6. In productie geeft elke /dev/*-route een 404, ongeacht welke
// sub-route later nog wordt toegevoegd onder deze layout.
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return children;
}
