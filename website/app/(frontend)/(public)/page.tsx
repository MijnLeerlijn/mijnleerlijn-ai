import { Suspense } from "react";
import Hero, { type HomepageState } from "@/components/organisms/Hero";
import RecentSection from "@/components/organisms/RecentSection";
import DiscoverSection from "@/components/organisms/DiscoverSection";
import UpdatesSection from "@/components/organisms/UpdatesSection";
import DemoSwitcher from "@/components/DemoSwitcher";
import { getCategories, getUpdates } from "@/services/payload";

const GELDIGE_STATES: HomepageState[] = ["eerste-bezoek", "recent-bekeken"];

function isGeldigeState(value: string | undefined): value is HomepageState {
  return GELDIGE_STATES.includes(value as HomepageState);
}

interface HomeProps {
  searchParams: Promise<{ state?: string }>;
}

// De homepage kent, zonder analytics/auth (bewust uitgesteld, zie
// IMPLEMENTATION-PLAN.md Fase 3), geen echte "eerder hier geweest"-detectie.
// De twee documenteerde varianten (UX-DESIGN.md scherm 1) blijven daarom via
// ?state= schakelbaar — uitsluitend de zoekervaring zelf is nu echt
// interactief (zie SearchPanel/lib/search/simulate.ts).
export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const state: HomepageState = isGeldigeState(params?.state) ? params.state : "eerste-bezoek";
  const welkomTerug = state === "recent-bekeken";

  const [categorieen, updates] = await Promise.all([getCategories(), getUpdates()]);

  return (
    <div className="pb-16">
      <Hero welkomTerug={welkomTerug} />
      {welkomTerug && <RecentSection />}
      <DiscoverSection
        categorieen={categorieen.map((c) => ({
          slug: c.slug,
          titel: c.titel,
          icoon: c.icoon,
          kleur: c.kleur,
        }))}
      />
      <UpdatesSection
        updates={updates.map((u) => ({
          artikelSlug: u.artikelSlug,
          titel: u.titel,
          badge: u.badge,
          datum: u.datum,
        }))}
      />

      {/* Alleen zichtbaar in ontwikkeling — geen onderdeel van het echte product, zie IMPLEMENTATION-PLAN.md Fase 3 */}
      {process.env.NODE_ENV !== "production" && (
        <Suspense fallback={null}>
          <DemoSwitcher />
        </Suspense>
      )}
    </div>
  );
}
