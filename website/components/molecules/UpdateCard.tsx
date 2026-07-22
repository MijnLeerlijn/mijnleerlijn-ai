import Badge from "@/components/atoms/Badge";
import GradientAccent from "@/components/atoms/GradientAccent";
import { focusRing } from "@/utils/focus-ring";

export interface UpdateCardProps {
  titel: string;
  badge: "Nieuw" | "Bijgewerkt";
  datum: string;
  href: string;
}

// Zie docs/HOMEPAGE-VISUAL-SPEC.md §7 "Net bijgewerkt". Was inline opgemaakt
// in UpdatesSection — nu een herbruikbare kaart (ook bruikbaar voor Updates-
// en Categorie-overzicht-achtige lijsten later).
export default function UpdateCard({ titel, badge, datum, href }: UpdateCardProps) {
  return (
    <a
      href={href}
      className={`group overflow-hidden rounded-lg bg-white shadow-sm transition-all duration-[120ms] hover:-translate-y-0.5 hover:shadow-md ${focusRing}`}
    >
      <div className="p-4">
        <Badge tone={badge === "Nieuw" ? "success" : "info"}>{badge}</Badge>
        <p className="mt-3 line-clamp-2 text-lg font-semibold text-grijs-900">{titel}</p>
        <p className="mt-2 text-xs text-grijs-400">{datum}</p>
      </div>
      <GradientAccent className="h-1 rounded-none" />
      <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-blauw">
        Lees verder
        <span aria-hidden className="transition-transform duration-[120ms] group-hover:translate-x-1">
          ▸▸
        </span>
      </div>
    </a>
  );
}
