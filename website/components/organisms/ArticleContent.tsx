import ArtikelBlok from "@/components/molecules/ArtikelBlok";
import type { ArticleWithContent } from "@/lib/data";
import { slugify } from "@/utils/slugify";

interface ArticleContentProps {
  secties: ArticleWithContent["sections"];
}

// De sectie/blok-boomstructuur uit docs/DATA-MODEL.md gerenderd — zie
// docs/UI-DESIGN.md §11. Section-id's (voor de inhoudsopgave-ankers) worden
// hier eenmalig afgeleid, niet meer los in de pagina berekend.
export default function ArticleContent({ secties }: ArticleContentProps) {
  return (
    <div className="flex flex-col gap-10">
      {secties.map((sectie) => (
        <section key={sectie.id} id={slugify(sectie.title)} className="scroll-mt-24">
          <h2 className="text-h2 font-semibold text-grijs-900">{sectie.title}</h2>
          <div className="mt-4 flex flex-col gap-4">
            {sectie.blocks.map((blok) => (
              <ArtikelBlok key={blok.id} blok={blok} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
