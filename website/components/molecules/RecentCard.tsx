import { focusRing } from "@/utils/focus-ring";

export interface RecentCardProps {
  titel: string;
  sectie: string;
  bekekenOp: string;
  href: string;
}

// Zie docs/HOMEPAGE-VISUAL-SPEC.md §5 "Verder waar je gebleven was" — vlakke
// kaartstijl (geen schaduw), zie docs/UI-DESIGN.md §18.
export default function RecentCard({ titel, sectie, bekekenOp, href }: RecentCardProps) {
  return (
    <a
      href={href}
      className={`w-[240px] shrink-0 snap-start rounded-lg border border-grijs-200 bg-white p-4 transition-colors duration-[120ms] hover:border-blauw lg:w-auto ${focusRing}`}
    >
      <p className="line-clamp-2 text-sm font-semibold text-grijs-900">{titel}</p>
      <p className="mt-1 text-xs text-grijs-600">{sectie}</p>
      <p className="mt-3 text-right text-xs text-grijs-400">{bekekenOp}</p>
    </a>
  );
}
