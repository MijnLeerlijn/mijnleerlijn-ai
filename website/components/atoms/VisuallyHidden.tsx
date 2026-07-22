import type { ReactNode } from "react";

// Tekst die alleen voor screenreaders bedoeld is — bv. extra context bij een
// icoon-only knop bovenop aria-label, of een skip-link. Zie docs/UI-DESIGN.md §34.
export default function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
