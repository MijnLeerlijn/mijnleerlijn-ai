import GradientAccent from "@/components/atoms/GradientAccent";
import Divider from "@/components/atoms/Divider";
import UpdateCard from "@/components/molecules/UpdateCard";
import { formatDatumNL } from "@/lib/format/date";

export interface UpdateSectionItem {
  artikelSlug: string;
  titel: string;
  badge: "Nieuw" | "Bijgewerkt";
  /** ISO-datum. */
  datum: string;
}

interface UpdatesSectionProps {
  updates: UpdateSectionItem[];
}

// Presentationeel organism — ontvangt updates via props, zie
// docs/PLATFORM-FOUNDATION.md §2 regel 6 (components/ roept nooit
// rechtstreeks services/ aan). Data komt uit services/payload.ts via
// app/(frontend)/(public)/page.tsx.
export default function UpdatesSection({ updates }: UpdatesSectionProps) {
  return (
    <section id="updates" className="bg-white py-12 lg:pb-16 lg:pt-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8 lg:px-16">
        <div className="flex items-center gap-4">
          <h2 className="shrink-0 text-h2 font-semibold text-grijs-900">Net bijgewerkt</h2>
          <GradientAccent className="w-[60px]" />
          <Divider className="flex-1" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          {updates.map((item) => (
            <UpdateCard
              key={item.artikelSlug}
              titel={item.titel}
              badge={item.badge}
              datum={formatDatumNL(item.datum)}
              href={`/artikel/${item.artikelSlug}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
