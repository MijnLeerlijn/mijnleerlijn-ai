import CategorieIcoon from "@/components/atoms/CategorieIcoon";
import type { CategorieKleur } from "@/lib/data/categories";
import { focusRing } from "@/utils/focus-ring";

interface KennisKaartProps {
  titel: string;
  icoon: string;
  kleur: CategorieKleur;
  href: string;
}

// Molecule: samenstelling van het CategorieIcoon-atom + tekst. Zie
// docs/PLATFORM-FOUNDATION.md §2 — herbruikbaar, domein-onwetend qua opmaak
// (ontvangt content via props), gebruikt door DiscoverSection (organism).
export default function KennisKaart({ titel, icoon, kleur, href }: KennisKaartProps) {
  return (
    <a
      href={href}
      className={`rounded-lg bg-white p-5 shadow-sm transition-all duration-[120ms] hover:-translate-y-0.5 hover:shadow-md ${focusRing}`}
    >
      <CategorieIcoon naam={icoon} kleur={kleur} />
      <p className="mt-3 text-base font-semibold text-grijs-900">{titel}</p>
    </a>
  );
}
