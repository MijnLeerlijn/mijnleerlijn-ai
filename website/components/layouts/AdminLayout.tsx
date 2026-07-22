import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { LayoutDashboard, FileText, Layers, Image as ImageIcon, MessageSquare, Settings } from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/beheer", icon: LayoutDashboard },
  { label: "Artikelen", href: "/beheer/artikelen", icon: FileText },
  { label: "Variants", href: "/beheer/variants", icon: Layers },
  { label: "Media", href: "/beheer/media", icon: ImageIcon },
  { label: "AI-feedback", href: "/beheer/ai-feedback", icon: MessageSquare },
  { label: "Instellingen", href: "/beheer/instellingen", icon: Settings },
];

// Geen publieke Header/Footer — zie PLATFORM-FOUNDATION.md §4. Zijnavigatie is
// nu een functioneel skelet; inhoud (variant-contextselector, gebruikersmenu,
// echte data) volgt in latere fases.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-grijs-50">
      <aside className="hidden w-60 shrink-0 border-r border-grijs-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b border-grijs-200 px-4">
          <Image
            src="/brand/logo-kleur.svg"
            alt="MijnLeerlijn"
            width={140}
            height={27}
            className="h-6 w-auto"
          />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Beheernavigatie">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-grijs-900 hover:bg-grijs-50 hover:text-blauw"
              >
                <Icon size={20} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-grijs-200 bg-white px-6 lg:hidden">
          <Image
            src="/brand/logo-kleur.svg"
            alt="MijnLeerlijn"
            width={140}
            height={27}
            className="h-6 w-auto"
          />
        </header>
        <main className="flex-1 p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
