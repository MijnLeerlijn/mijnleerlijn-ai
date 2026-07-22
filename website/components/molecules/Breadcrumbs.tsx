import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import Link from "@/components/atoms/Link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

// Zie docs/UI-DESIGN.md §13. Laatste item is altijd de huidige pagina
// (niet-klikbaar, aria-current="page").
export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-grijs-600">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={item.label}>
            {index > 0 && <ChevronRight size={14} aria-hidden className="shrink-0 text-grijs-400" />}
            {item.href && !isLast ? (
              <Link href={item.href} className="text-grijs-600 hover:text-[var(--variant-accent)]">
                {item.label}
              </Link>
            ) : (
              <span aria-current={isLast ? "page" : undefined} className={isLast ? "text-grijs-900" : ""}>
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
