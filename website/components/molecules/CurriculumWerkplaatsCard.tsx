import CategorieIcoon from "@/components/atoms/CategorieIcoon";
import { focusRing } from "@/utils/focus-ring";

interface CurriculumWerkplaatsCardProps {
  href: string;
}

// Molecule: compact kaartje naar Curriculum Werkplaats (los productonderdeel,
// eigen Next.js-app) op de publieke Helpdesk-homepage. `href` komt uit
// variant.curriculumWerkplaatsUrl (payload/collections/Variants.ts) — de
// homepage rendert dit kaartje alleen als die URL voor de actieve variant is
// ingevuld, dus hier bewust geen hardcoded MijnLeerlijn-URL en geen eigen
// zichtbaarheidscheck. Vast paars (CategorieIcoon "PenTool"/"purple", dezelfde
// combinatie als de "curriculum-werkplaats"-categorie elders, zie
// lib/data/categories.ts) in plaats van de variant-accentkleur: Curriculum
// Werkplaats heeft een eigen merkidentiteit, los van welke onderwijsvariant
// (MijnLeerlijn, MijnMonti, Mijn-D, …) hem toont.
export default function CurriculumWerkplaatsCard({ href }: CurriculumWerkplaatsCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-lg border border-purple-500/15 bg-purple-500/5 p-4 transition-all duration-[120ms] hover:-translate-y-0.5 hover:shadow-md ${focusRing}`}
    >
      <CategorieIcoon naam="PenTool" kleur="purple" />
      <p className="mt-3 text-sm font-semibold text-grijs-900">Curriculum Werkplaats</p>
      <p className="mt-1 text-sm text-grijs-600">
        Werk samen aan je curriculum. Maak en organiseer leerlijnen, doelen en onderwijsinhoud die passen bij jullie
        school.
      </p>
      <p className="mt-3 text-sm font-medium text-purple-600">Open Curriculum Werkplaats →</p>
    </a>
  );
}
