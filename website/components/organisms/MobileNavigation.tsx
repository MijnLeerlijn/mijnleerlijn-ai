"use client";

import { useEffect, useRef } from "react";
import Link from "@/components/atoms/Link";

export interface NavItem {
  label: string;
  href: string;
}

interface MobileNavigationProps {
  items: NavItem[];
  open: boolean;
  onClose: () => void;
}

// Geëxtraheerd uit Header (was inline in het Fase 1-prototype) — zie
// docs/UI-DESIGN.md §25. Full-screen overlay, sluit met Escape en verplaatst
// focus naar het eerste item bij openen (eenvoudige focus-trap-benadering).
export default function MobileNavigation({ items, open, onClose }: MobileNavigationProps) {
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div id="mobiel-menu" className="fixed inset-0 top-14 z-30 bg-white px-6 py-4 md:hidden">
      <nav className="flex flex-col" aria-label="Mobiele navigatie">
        {items.map((item, index) => (
          <Link
            key={item.label}
            href={item.href}
            ref={index === 0 ? firstLinkRef : undefined}
            onClick={onClose}
            underline="always"
            className="flex h-12 items-center border-b border-grijs-100 text-base text-grijs-900 no-underline hover:no-underline"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
