import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  titel: string;
  beschrijving?: string;
  actie?: ReactNode;
}

// Zie docs/UI-DESIGN.md §16. Lijnicoon i.p.v. illustratie — er bestaat bewust
// geen eigen illustratiestijl, zie docs/DESIGN-SYSTEM.md §Ontbreekt.
export default function EmptyState({ icon: Icon, titel, beschrijving, actie }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
      <Icon size={32} aria-hidden className="text-grijs-400" />
      <h3 className="text-h3 font-semibold text-grijs-900">{titel}</h3>
      {beschrijving && <p className="max-w-sm text-sm text-grijs-600">{beschrijving}</p>}
      {actie && <div className="mt-2">{actie}</div>}
    </div>
  );
}
