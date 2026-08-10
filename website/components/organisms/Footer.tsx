import type { ComponentType } from "react";
import Image from "next/image";
import GradientAccent from "@/components/atoms/GradientAccent";
import Link from "@/components/atoms/Link";
import {
  InstagramIcon,
  LinkedinIcon,
  FacebookIcon,
  type SocialIconProps,
} from "@/components/atoms/SocialIcons";
import { focusRingOnDark } from "@/utils/focus-ring";
import { getActiveVariant } from "@/lib/variant/get-active-variant";

const sitemap = [
  [
    { label: "Home", href: "/" },
    { label: "Categorieën", href: "/#handleidingen" },
  ],
  [
    { label: "Updates", href: "/updates" },
    { label: "Contact", href: "/contact" },
    // Helpdesk-beheerkoppeling (2026), punt 9: duidelijke link naar
    // Curriculum Werkplaats vanaf de publieke Helpdesk-site. Bewust hier en
    // niet in de Header — die is sinds de MVP 1.0-opschoning (2026-07-25)
    // opzettelijk logo-only ("de chatbot is de homepage"); de Footer is de
    // ene gedeelde plek die op elke publieke pagina rendert (incl. de
    // homepage-chat, zie PublicLayout.tsx) zonder die beslissing terug te
    // draaien. Externe link (ander domein, andere applicatie) → expliciet
    // target/rel hieronder, zie de render-loop.
    { label: "Curriculum Werkplaats", href: "https://curriculum.mijnleerlijn.chat" },
  ],
];

const socialIcons: { icon: ComponentType<SocialIconProps>; label: string }[] = [
  { icon: InstagramIcon, label: "Volg ons op Instagram" },
  { icon: LinkedinIcon, label: "Volg ons op LinkedIn" },
  { icon: FacebookIcon, label: "Volg ons op Facebook" },
];

export default async function Footer() {
  const variant = await getActiveVariant();
  return (
    <footer className="mt-auto bg-donkerblauw pb-8 pt-12 lg:pt-16">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8 lg:px-16">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <Image
              src={variant.branding.logoUrl}
              alt={variant.branding.productName}
              width={161}
              height={31}
              className="h-8 w-auto brightness-0 invert"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {sitemap.map((col, i) => (
              <div key={i} className="flex flex-col">
                {col.map((item) => {
                  const isExtern = item.href.startsWith("http");
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onDark
                      underline="hover"
                      className="flex h-8 items-center text-sm"
                      {...(isExtern ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          <div>
            <p className="text-sm font-medium text-white">Volg ons</p>
            <div className="mt-3 flex gap-3">
              {socialIcons.map(({ icon: Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white transition-colors duration-[120ms] hover:border-white/60 hover:bg-white/10 ${focusRingOnDark}`}
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>
        </div>

        <GradientAccent className="mt-8 w-full" />

        <div className="mt-4 text-xs text-white/60">
          <p>{variant.websiteTeksten.footerTekst}</p>
        </div>
      </div>
    </footer>
  );
}
