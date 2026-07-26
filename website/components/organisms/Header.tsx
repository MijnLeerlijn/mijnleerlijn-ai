"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Button from "@/components/atoms/Button";

// Helpdesk MVP 1.0 (2026-07-25): opzettelijk vereenvoudigd tot uitsluitend
// logo + één knop — "de chatbot is de homepage", zie het akkoord op het
// wireframevoorstel. De eerdere Categorieën/Updates/Contact-navigatie en het
// bijbehorende mobiele hamburgermenu (MobileNavigation) zijn hier bewust
// verwijderd, niet verborgen: met nog maar één link is een apart uitklapbaar
// mobiel menu overbodige complexiteit. Contact loopt voortaan inline via de
// chat (zie HelpdeskChat), niet meer via een aparte geadverteerde nav-link.
export default function Header() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  // Zelfde patroon als de vroegere zoek-scroll-behavior: scroll naar de
  // sidebar als die al op de pagina staat (de homepage), anders naar de
  // homepage navigeren met een anchor.
  const naarHandleidingen = () => {
    const sidebar = document.getElementById("handleidingen");
    if (sidebar) {
      sidebar.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      router.push("/#handleidingen");
    }
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b border-grijs-200 bg-white transition-all duration-200 ${scrolled ? "shadow-sm" : ""}`}
    >
      <div
        className={`mx-auto flex max-w-[1200px] items-center justify-between px-4 transition-all duration-200 sm:px-8 lg:px-16 ${
          scrolled ? "h-14" : "h-16"
        }`}
      >
        <NextLink href="/" className="flex items-center" aria-label="Naar de homepage van MijnLeerlijn">
          <Image
            src="/brand/logo-kleur.svg"
            alt="MijnLeerlijn"
            width={161}
            height={31}
            className={`w-auto transition-all duration-200 ${scrolled ? "h-6" : "h-7"}`}
            priority
          />
        </NextLink>

        <Button variant="secondary" size="compact" onClick={naarHandleidingen}>
          Handleidingen
        </Button>
      </div>
    </header>
  );
}
