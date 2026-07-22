import {
  Target,
  Users,
  FileText,
  BarChart3,
  Settings,
  Download,
  Rocket,
  Award,
  StickyNote,
  Layers,
  type LucideIcon,
} from "lucide-react";
import type { CategorieKleur } from "@/lib/data/categories";

const ICONEN: Record<string, LucideIcon> = {
  Target,
  Users,
  FileText,
  BarChart3,
  Settings,
  Download,
  Rocket,
  Award,
  StickyNote,
  Layers,
};

const KLEUREN: Record<CategorieKleur, { bg: string; fg: string }> = {
  blauw: { bg: "bg-blauw/8", fg: "text-blauw" },
  groen: { bg: "bg-groen/8", fg: "text-groen" },
  oranje: { bg: "bg-oranje/8", fg: "text-oranje" },
  geel: { bg: "bg-geel/8", fg: "text-[#8a6b03]" },
  rood: { bg: "bg-rood/8", fg: "text-rood" },
};

interface CategorieIcoonProps {
  naam: string;
  kleur: CategorieKleur;
}

export default function CategorieIcoon({ naam, kleur }: CategorieIcoonProps) {
  const Icon = ICONEN[naam] ?? FileText;
  const c = KLEUREN[kleur] ?? KLEUREN.blauw;
  return (
    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${c.bg}`}>
      <Icon size={24} className={c.fg} />
    </div>
  );
}
