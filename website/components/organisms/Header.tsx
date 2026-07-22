"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, Menu, X } from "lucide-react";
import Link from "@/components/atoms/Link";
import IconButton from "@/components/atoms/IconButton";
import MobileNavigation from "@/components/organisms/MobileNavigation";

const navItems = [
  { label: "Categorieën", href: "/#ontdek" },
  { label: "Updates", href: "/#updates" },
  { label: "Contact", href: "/contact" },
];

export default function Header() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const naarZoekveld = () => {
    const zoekveld = document.getElementById("zoekveld");
    if (zoekveld) {
      zoekveld.focus();
      zoekveld.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      router.push("/zoeken");
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

        <nav className="hidden items-center gap-8 md:flex" aria-label="Hoofdnavigatie">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href} className="py-1 text-base text-grijs-900">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <IconButton
            icon={Search}
            aria-label="Zoeken"
            className="text-grijs-600 hover:text-[var(--variant-accent)]"
            onClick={naarZoekveld}
          />
          <IconButton
            icon={menuOpen ? X : Menu}
            aria-label={menuOpen ? "Sluit menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobiel-menu"
            className="text-grijs-900 md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
          />
        </div>
      </div>

      <MobileNavigation items={navItems} open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
