"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { List, X } from "lucide-react";
import { haalHeadingsOp, type MarkdownHeading } from "@/lib/content/markdown-headings";
import { KennisMarkdown } from "./kennis-markdown";

// Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing naar
// juiste hoofdstuk" (opdrachtseis §1): de kennisreader. Desktop: vaste
// inhoudsopgave naast de tekst, actief hoofdstuk gemarkeerd tijdens
// scrollen. Mobiel: geen vaste zijbalk, een "Inhoud"-knop opent een
// bottom-sheet-menu. Headings komen uitsluitend uit lib/content/
// markdown-headings.ts (opdrachtseis §2: geen handmatig hardcoded menu) —
// zowel de inhoudsopgave hier als de id's in kennis-markdown.tsx gebruiken
// exact dezelfde, hier ÉÉN keer berekende lijst.

// TrainerPortalNav (../../trainer-portal-nav.tsx) is een sticky h-14 (56px)
// header — de inhoudsopgave-drempel en de scroll-margin op elke heading
// (kennis-markdown.tsx: scroll-mt-20 = 80px) houden daar rekening mee, zodat
// een aangesprongen hoofdstuk nooit onder de sticky balk verdwijnt.
const STICKY_HEADER_HOOGTE = 56;

export interface KennisReaderProps {
  titel: string;
  tekst: string;
}

export function KennisReader({ titel, tekst }: KennisReaderProps) {
  const headings = useMemo(() => haalHeadingsOp(tekst), [tekst]);
  const [actieveSlug, setActieveSlug] = useState<string | null>(headings[0]?.slug ?? null);
  const [mobielOpen, setMobielOpen] = useState(false);
  const mobielKnopRef = useRef<HTMLButtonElement>(null);

  // Actief hoofdstuk tijdens scrollen (opdrachtseis §1: "tijdens het
  // scrollen moet het actieve hoofdstuk in de inhoudsopgave gemarkeerd
  // worden"). rootMargin duwt de effectieve "drempellijn" naar net onder de
  // sticky header; -70% onderaan zorgt dat een hoofdstuk pas als actief
  // geldt zodra het écht bovenin beeld is, niet meteen zodra de onderkant
  // nog maar net zichtbaar wordt.
  useEffect(() => {
    if (headings.length === 0) return;
    const elementen = headings.map((h) => document.getElementById(h.slug)).filter((el): el is HTMLElement => el !== null);
    if (elementen.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const zichtbaar = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target as HTMLElement);
        if (zichtbaar.length === 0) return;
        const bovenste = zichtbaar.reduce((a, b) => (a.getBoundingClientRect().top <= b.getBoundingClientRect().top ? a : b));
        setActieveSlug(bovenste.id);
      },
      { rootMargin: `-${STICKY_HEADER_HOOGTE + 24}px 0px -70% 0px`, threshold: 0 }
    );
    elementen.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  // Kort visueel markeren bij binnenkomst via een "Bekijk hoofdstuk"-link
  // (opdrachtseis §6: /kennis/[id]#slug -> even duidelijk waar het antwoord
  // vandaan kwam). Uitsluitend bij het laden van de pagina — niet bij elke
  // gewone klik in de inhoudsopgave hiernaast, dat zou storend knipperen.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const element = document.getElementById(hash);
    if (!element) return;
    element.classList.add("bg-teal-100", "-mx-2", "px-2");
    const timer = setTimeout(() => element.classList.remove("bg-teal-100", "-mx-2", "px-2"), 2500);
    return () => clearTimeout(timer);
  }, []);

  function sluitMobielMenu() {
    setMobielOpen(false);
    mobielKnopRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-h2 font-bold text-donkerblauw">{titel}</h1>
        {headings.length > 0 && (
          <button
            type="button"
            ref={mobielKnopRef}
            onClick={() => setMobielOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-grijs-300 bg-white px-3 py-1.5 text-body-sm font-medium text-grijs-700 hover:bg-grijs-50 lg:hidden"
          >
            <List size={16} />
            Inhoud
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 rounded-xl border border-grijs-200 bg-white p-6 shadow-sm">
          <KennisMarkdown tekst={tekst} headings={headings} />
        </div>

        {headings.length > 0 && (
          <aside className="hidden lg:block">
            <div className="sticky" style={{ top: STICKY_HEADER_HOOGTE + 24 }}>
              <KennisTocLijst headings={headings} actieveSlug={actieveSlug} />
            </div>
          </aside>
        )}
      </div>

      {mobielOpen && <MobielTocMenu headings={headings} actieveSlug={actieveSlug} onClose={sluitMobielMenu} />}
    </div>
  );
}

function KennisTocLijst({
  headings,
  actieveSlug,
  onNavigate,
}: {
  headings: MarkdownHeading[];
  actieveSlug: string | null;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Inhoudsopgave" className="max-h-[calc(100vh-8rem)] overflow-y-auto">
      <p className="mb-2 text-label font-semibold uppercase tracking-wide text-grijs-500">Inhoud</p>
      <ul className="flex flex-col gap-0.5 border-l border-grijs-200">
        {headings.map((heading) => {
          const actief = heading.slug === actieveSlug;
          return (
            <li key={heading.slug}>
              <a
                href={`#${heading.slug}`}
                onClick={onNavigate}
                aria-current={actief ? "location" : undefined}
                className={`-ml-px block border-l-2 py-1 pr-2 text-body-sm transition-colors ${
                  actief ? "border-teal-600 font-medium text-teal-700" : "border-transparent text-grijs-600 hover:text-grijs-900"
                }`}
                style={{ paddingLeft: `${8 + (heading.level - 1) * 12}px` }}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Bottom-sheet menu voor mobiel — zelfde basisprincipes als het bestaande
// components/organisms/MobileNavigation.tsx (Escape sluit, focus gaat bij
// openen naar het eerste item), hier aangevuld met een eenvoudige focus-trap
// (Tab blijft binnen het menu) en focus-teruggave naar de "Inhoud"-knop bij
// sluiten — de sheet ligt bovenop nog zichtbare pagina-inhoud (i.t.t.
// MobileNavigation, dat de hele pagina bedekt), dus Tab zou anders zo de
// onderliggende pagina in kunnen lopen.
function MobielTocMenu({
  headings,
  actieveSlug,
  onClose,
}: {
  headings: MarkdownHeading[];
  actieveSlug: string | null;
  onClose: () => void;
}) {
  const paneelRef = useRef<HTMLDivElement>(null);
  const eersteLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    eersteLinkRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !paneelRef.current) return;
      const focusbaar = paneelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (focusbaar.length === 0) return;
      const eerste = focusbaar[0]!;
      const laatste = focusbaar[focusbaar.length - 1]!;
      if (event.shiftKey && document.activeElement === eerste) {
        event.preventDefault();
        laatste.focus();
      } else if (!event.shiftKey && document.activeElement === laatste) {
        event.preventDefault();
        eerste.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:hidden" role="dialog" aria-modal="true" aria-label="Inhoudsopgave">
      <div className="flex-1 bg-donkerblauw/40" onClick={onClose} aria-hidden="true" />
      <div ref={paneelRef} className="max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-grijs-200 bg-white p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-body-md font-semibold text-grijs-900">Inhoud</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Inhoudsopgave sluiten"
            className="rounded-lg p-1.5 text-grijs-500 hover:bg-grijs-100 hover:text-grijs-900"
          >
            <X size={18} />
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {headings.map((heading, index) => {
            const actief = heading.slug === actieveSlug;
            return (
              <li key={heading.slug}>
                <a
                  ref={index === 0 ? eersteLinkRef : undefined}
                  href={`#${heading.slug}`}
                  onClick={onClose}
                  aria-current={actief ? "location" : undefined}
                  className={`block rounded-lg px-3 py-2 text-body-sm ${
                    actief ? "bg-teal-50 font-medium text-teal-700" : "text-grijs-700 hover:bg-grijs-50"
                  }`}
                  style={{ paddingLeft: `${12 + (heading.level - 1) * 14}px` }}
                >
                  {heading.text}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
