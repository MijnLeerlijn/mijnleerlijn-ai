import type { Metadata } from "next";
import KnowledgeLayout from "@/components/layouts/KnowledgeLayout";
import UpdateCard from "@/components/molecules/UpdateCard";
import { getAllArticles, getUpdates } from "@/services/payload";
import { formatDatumNL } from "@/lib/format/date";

export const metadata: Metadata = { title: "Updates — MijnLeerlijn" };

// Overzicht van alle inhoudelijke wijzigingen — de uitgelichte updates
// (zoals op de homepage) plus een volledig chronologisch overzicht van alle
// artikelen. Zie docs/UX-DESIGN.md scherm 7. Gekoppeld aan Payload via
// services/payload.ts (Fase 4 Stap 7).
export default async function UpdatesPagina() {
  const [netBijgewerkt, alleArtikelen] = await Promise.all([getUpdates(), getAllArticles()]);
  const chronologisch = [...alleArtikelen].sort((a, b) =>
    b.lastContentUpdate.localeCompare(a.lastContentUpdate)
  );

  return (
    <KnowledgeLayout breadcrumb={[{ label: "Home", href: "/" }, { label: "Updates" }]}>
      <h1 className="text-h1 font-bold text-grijs-900">Updates</h1>
      <p className="mt-2 max-w-2xl text-base text-grijs-600">
        Alles wat recent is toegevoegd of bijgewerkt in de kennisbank.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
        {netBijgewerkt.map((item) => (
          <UpdateCard
            key={item.artikelSlug}
            titel={item.titel}
            badge={item.badge}
            datum={formatDatumNL(item.datum)}
            href={`/artikel/${item.artikelSlug}`}
          />
        ))}
      </div>

      <div className="mt-16 border-t border-grijs-100 pt-10">
        <h2 className="text-h3 font-semibold text-grijs-900">Alle artikelen, meest recent eerst</h2>
        <div className="mt-4 flex flex-col">
          {chronologisch.map((artikel, index) => (
            <a
              key={artikel.slug}
              href={`/artikel/${artikel.slug}`}
              className={`flex items-center justify-between gap-4 py-3 text-sm hover:text-[var(--variant-accent)] ${index !== 0 ? "border-t border-grijs-100" : ""}`}
            >
              <span className="min-w-0 flex-1 truncate text-grijs-900">{artikel.title}</span>
              <span className="hidden shrink-0 text-grijs-400 sm:inline">{artikel.categoryTitle}</span>
              <span className="shrink-0 text-grijs-400">{formatDatumNL(artikel.lastContentUpdate)}</span>
            </a>
          ))}
        </div>
      </div>
    </KnowledgeLayout>
  );
}
