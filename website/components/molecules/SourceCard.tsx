import { FileText } from "lucide-react";
import { focusRing } from "@/utils/focus-ring";

export interface SourceCardProps {
  titel: string;
  sectie: string;
  datum: string;
  href?: string;
}

// "Bronnenkaart" — zie docs/UX-DESIGN.md §Componentenbibliotheek en
// docs/AI-KNOWLEDGE-STRATEGY.md §Bronvermelding (verplichte velden). Dekt ook
// wat elders "SourceLink" heet — zelfde kaartvorm, geen dubbele component.
export default function SourceCard({ titel, sectie, datum, href = "#" }: SourceCardProps) {
  return (
    <a
      href={href}
      className={`flex items-start gap-3 rounded-md bg-grijs-50 p-3 hover:bg-grijs-100 ${focusRing}`}
    >
      <FileText size={20} aria-hidden className="mt-0.5 shrink-0 text-blauw" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-blauw hover:underline">{titel}</p>
        <p className="text-xs text-grijs-600">{sectie}</p>
        <p className="text-xs text-grijs-400">Bijgewerkt: {datum}</p>
      </div>
    </a>
  );
}
