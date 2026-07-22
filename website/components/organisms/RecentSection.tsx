import RecentCard from "@/components/molecules/RecentCard";
import { recentBekeken } from "@/lib/data/recently-viewed";

export default function RecentSection() {
  return (
    <section className="bg-white py-8 lg:py-16">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8 lg:px-16">
        <h2 className="text-h2 font-semibold text-grijs-900">Verder waar je gebleven was</h2>

        <div className="mt-6 -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 sm:pb-0 lg:grid lg:grid-cols-4">
          {recentBekeken.map((item) => (
            <RecentCard
              key={item.artikelSlug}
              titel={item.titel}
              sectie={item.sectie}
              bekekenOp={item.bekekenOp}
              href={`/artikel/${item.artikelSlug}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
