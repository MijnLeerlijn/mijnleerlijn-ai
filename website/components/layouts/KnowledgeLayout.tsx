import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import Breadcrumbs, { type BreadcrumbItem } from "@/components/molecules/Breadcrumbs";

interface KnowledgeLayoutProps {
  breadcrumb: BreadcrumbItem[];
  /** Optionele sticky sidebar (bv. inhoudsopgave bij een artikel). */
  sidebar?: ReactNode;
  children: ReactNode;
}

// Breadcrumb + optionele sticky sidebar voor contentzware pagina's (artikel,
// categorie, updates, contact, kies-variant). Zie PLATFORM-FOUNDATION.md §4.
//
// Wrapt NIET (meer) in PublicLayout: elke pagina die dit component gebruikt,
// zit al onder de route-groep app/(frontend)/(public)/layout.tsx, die zelf
// al PublicLayout (Header/Footer) rendert. De extra PublicLayout hier
// verdubbelde Header/Footer op elke pagina die KnowledgeLayout gebruikt
// (artikel, categorie, updates, contact, kies-variant) — de route-groep-
// layout is en blijft de enige plek die Header/Footer rendert.
export default function KnowledgeLayout({ breadcrumb, sidebar, children }: KnowledgeLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-8 lg:px-16 lg:py-16">
      <div className="mb-8">
        <Breadcrumbs items={breadcrumb} />
      </div>

      {sidebar ? (
        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
          {/* Mobiel/tablet: inklapbare "Inhoud"-sectie via <details>, geen sidebar-content verloren.
              Zie docs/HOMEPAGE-VISUAL-SPEC.md §13 — natieve HTML i.p.v. een eigen
              accordeon-component/ARIA, zie de toegankelijkheidsuitgangspunten van Fase 2. */}
          <details className="mb-6 rounded-md border border-grijs-200 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-grijs-900">
              Inhoud
              <ChevronDown size={16} aria-hidden className="shrink-0" />
            </summary>
            <div className="border-t border-grijs-100 px-4 py-3">{sidebar}</div>
          </details>

          <aside className="hidden lg:block">
            <div className="sticky top-24">{sidebar}</div>
          </aside>
          <div>{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
