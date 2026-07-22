import { ChevronLeft, ChevronRight } from "lucide-react";
import IconButton from "@/components/atoms/IconButton";
import { focusRing } from "@/utils/focus-ring";

interface PaginationProps {
  huidigePagina: number;
  totaalPaginas: number;
  onPaginaWijzigen: (pagina: number) => void;
}

// Zie docs/UX-DESIGN.md §Componentenbibliotheek §Data-weergave. Minimale
// prev/next + paginanummers; geen "ellipsis"-logica nodig op deze schaal.
export default function Pagination({ huidigePagina, totaalPaginas, onPaginaWijzigen }: PaginationProps) {
  return (
    <nav aria-label="Paginering" className="flex items-center justify-center gap-1">
      <IconButton
        icon={ChevronLeft}
        aria-label="Vorige pagina"
        disabled={huidigePagina === 1}
        onClick={() => onPaginaWijzigen(huidigePagina - 1)}
        className="text-grijs-600 hover:text-[var(--variant-accent)]"
      />
      {Array.from({ length: totaalPaginas }, (_, i) => i + 1).map((pagina) => (
        <button
          key={pagina}
          type="button"
          aria-current={pagina === huidigePagina ? "page" : undefined}
          onClick={() => onPaginaWijzigen(pagina)}
          className={`flex h-10 w-10 items-center justify-center rounded-md text-sm font-medium transition-colors duration-[120ms] ${focusRing} ${
            pagina === huidigePagina
              ? "bg-[var(--variant-accent)] text-white"
              : "text-grijs-600 hover:bg-grijs-100"
          }`}
        >
          {pagina}
        </button>
      ))}
      <IconButton
        icon={ChevronRight}
        aria-label="Volgende pagina"
        disabled={huidigePagina === totaalPaginas}
        onClick={() => onPaginaWijzigen(huidigePagina + 1)}
        className="text-grijs-600 hover:text-[var(--variant-accent)]"
      />
    </nav>
  );
}
