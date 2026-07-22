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

const sitemap = [
  [
    { label: "Home", href: "/" },
    { label: "Categorieën", href: "/#ontdek" },
  ],
  [
    { label: "Updates", href: "/updates" },
    { label: "Contact", href: "/contact" },
  ],
];

const socialIcons: { icon: ComponentType<SocialIconProps>; label: string }[] = [
  { icon: InstagramIcon, label: "Volg ons op Instagram" },
  { icon: LinkedinIcon, label: "Volg ons op LinkedIn" },
  { icon: FacebookIcon, label: "Volg ons op Facebook" },
];

export default function Footer() {
  return (
    <footer className="mt-auto bg-donkerblauw pb-8 pt-12 lg:pt-16">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8 lg:px-16">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <Image
              src="/brand/logo-kleur.svg"
              alt="MijnLeerlijn"
              width={161}
              height={31}
              className="h-8 w-auto brightness-0 invert"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {sitemap.map((col, i) => (
              <div key={i} className="flex flex-col">
                {col.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onDark
                    underline="hover"
                    className="flex h-8 items-center text-sm"
                  >
                    {item.label}
                  </Link>
                ))}
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

        <div className="mt-4 flex flex-col gap-2 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 MijnLeerlijn | Onderdeel van sCoolsuite B.V. | Privacy</p>
          <p>Prototype — nog geen definitieve content</p>
        </div>
      </div>
    </footer>
  );
}
