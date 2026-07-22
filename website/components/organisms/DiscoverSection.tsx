import { ChevronRight } from "lucide-react";
import GradientAccent from "@/components/atoms/GradientAccent";
import Divider from "@/components/atoms/Divider";
import KennisKaart from "@/components/molecules/KennisKaart";
import type { CategorieKleur } from "@/lib/data/categories";
import { populaireVragen } from "@/lib/data/popular-questions";
import { focusRing } from "@/utils/focus-ring";

export interface DiscoverCategorie {
  slug: string;
  titel: string;
  icoon: string;
  kleur: CategorieKleur;
}

interface DiscoverSectionProps {
  categorieen: DiscoverCategorie[];
}

// Presentationeel organism — ontvangt categorieën via props (opgehaald in
// app/(frontend)/(public)/page.tsx via services/payload.ts, zie
// docs/PLATFORM-FOUNDATION.md §2 regel 6: components/ roept nooit
// rechtstreeks services/ aan). De zoeksimulatie (populaireVragen) blijft
// bewust op lib/data gebaseerd — echte retrieval hoort bij Fase 6.
export default function DiscoverSection({ categorieen }: DiscoverSectionProps) {
  return (
    <section id="ontdek" className="bg-ontdek-bg py-12 lg:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8 lg:px-16">
        <div className="flex items-center gap-4">
          <h2 className="shrink-0 text-h2 font-semibold text-grijs-900">Ontdek een onderwerp</h2>
          <GradientAccent className="w-[60px]" />
          <Divider className="flex-1" />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <h3 className="text-sm font-medium tracking-[0.04em] text-grijs-600 uppercase">Onderwerpen</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {categorieen.map((c) => (
                <KennisKaart
                  key={c.slug}
                  titel={c.titel}
                  icoon={c.icoon}
                  kleur={c.kleur}
                  href={`/categorie/${c.slug}`}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium tracking-[0.04em] text-grijs-600 uppercase">
              Populaire vragen
            </h3>
            <ul className="mt-4">
              {populaireVragen.map((v, i) => (
                <li key={v.vraag} className={i !== 0 ? "border-t border-grijs-100" : ""}>
                  <a
                    href={`/zoeken?q=${encodeURIComponent(v.vraag)}`}
                    className={`group flex items-center justify-between rounded-sm py-3 text-base text-grijs-900 transition-colors duration-[120ms] hover:text-blauw ${focusRing}`}
                  >
                    {v.vraag}
                    <ChevronRight
                      size={16}
                      aria-hidden
                      className="shrink-0 text-grijs-400 transition-transform duration-[120ms] group-hover:translate-x-1"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
