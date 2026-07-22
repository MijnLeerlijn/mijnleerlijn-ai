"use client";

import { useState } from "react";
import Image from "next/image";
import GradientAccent from "@/components/atoms/GradientAccent";
import SearchPanel from "@/components/organisms/SearchPanel";
import { vindVariant } from "@/lib/data/variants";

export type HomepageState = "eerste-bezoek" | "recent-bekeken";

interface HeroProps {
  welkomTerug?: boolean;
}

const actieveVariant = vindVariant("mijnleerlijn")!;
const taglineWoorden = actieveVariant.branding.tagline.split(" ");
const taglineAccent = taglineWoorden.at(-1)!;
const tagline = taglineWoorden.slice(0, -1).join(" ");

// Merk-chrome (achtergrond, kop, foto, tagline) — zie
// docs/HOMEPAGE-VISUAL-SPEC.md §2. De zoek-/antwoordlogica zelf leeft nu in
// het SearchPanel-organism, dat volledig op eigen invoer draait (geen
// state-prop meer nodig — zie lib/search/simulate.ts).
export default function Hero({ welkomTerug = false }: HeroProps) {
  const [zoekActief, setZoekActief] = useState(false);

  return (
    <section className="relative overflow-hidden bg-donkerblauw">
      {/* Ineengrijpende kleurvlakken — brandbook-patroon, zie docs/HOMEPAGE-VISUAL-SPEC.md §2 */}
      <div
        className="pointer-events-none absolute right-0 top-[7.5%] hidden h-[85%] w-[45%] bg-groen lg:block"
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1200px] px-4 py-12 sm:px-8 sm:py-16 lg:px-16 lg:py-24">
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-8">
          <div className="max-w-[560px]">
            {welkomTerug && !zoekActief && <p className="mb-2 text-sm text-white/70">Welkom terug.</p>}

            <h1 className="text-[32px] leading-10 font-bold text-white sm:text-[40px] sm:leading-[48px]">
              Vind direct antwoord op je vraag.
            </h1>
            <p className="mt-4 text-lg leading-7 text-white/85">
              Typ wat je zoekt — we wijzen je meteen de juiste stap of uitleg.
            </p>

            <SearchPanel onStatusChange={(status) => setZoekActief(status !== "stil")} />

            {!zoekActief && (
              <div className="mt-12">
                <p className="text-sm text-white/70">
                  {tagline}{" "}
                  <span className="rounded-[4px] border border-white px-2 py-1 text-white">
                    {taglineAccent}
                  </span>
                </p>
                <GradientAccent className="mt-2 w-[280px]" />
              </div>
            )}
          </div>

          <div className="mt-10 lg:mt-0 lg:ml-auto lg:w-[38%] lg:shrink-0">
            <div className="relative h-[240px] lg:h-[420px]">
              <div className="absolute top-0 h-2 w-full bg-groen lg:hidden" />
              <Image
                src="/brand/images/mijn-leerlijn-jongen-met-boeken-op-hoofd-1-1.png"
                alt="Jongen met boeken op zijn hoofd"
                fill
                sizes="(min-width: 1024px) 38vw, 100vw"
                className="object-cover lg:rounded-none"
                priority
              />
              <Image
                src="/brand/beeldmerk-kleur.png"
                alt=""
                aria-hidden
                width={240}
                height={240}
                className="pointer-events-none absolute bottom-0 right-0 hidden w-[180px] opacity-90 brightness-0 invert lg:block"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
