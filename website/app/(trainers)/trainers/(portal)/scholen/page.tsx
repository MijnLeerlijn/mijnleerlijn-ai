import { redirect } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { bepaalScholenVoorTrainer } from "@/lib/trainers/monday-links";
import ScholenLijstClient from "./scholen-lijst-client";

export const metadata = { title: "Mijn scholen — Trainerportal" };

// Architectuurrapport §5 — resolutieladder tier 1+2 ("bevestigd", klikbaar)
// gescheiden van tier 3 ("mogelijk gekoppeld", uitsluitend read-context, zie
// bepaalScholenVoorTrainer() in monday-links.ts). Nooit samenvoegen: een
// naam-suggestie mag nooit als bevestigde autorisatie ogen.
//
// Ronde 2 (2026-08-19) — deze pagina blijft de server-side auth-gate + de
// ENE live Monday-fetch; de zoekbalk + kaartgrid zelf verhuisden naar
// scholen-lijst-client.tsx (client-side filteren, geen Monday-call per
// toetsaanslag). "Mogelijk gekoppeld" blijft hier, buiten de zoekfilter —
// die sectie is al structureel leeg sinds de legacy-schoolmatch-fix (zie
// monday-links.ts) en heeft dus niets om te doorzoeken.
export default async function TrainerScholenPage() {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const { bevestigd, mogelijkGekoppeld } = await bepaalScholenVoorTrainer(trainer);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-h1 font-bold text-donkerblauw">Mijn scholen</h1>
        <p className="mt-1 text-body-lg text-grijs-600">
          {bevestigd.length === 0 ? "Nog geen scholen gekoppeld." : `${bevestigd.length} ${bevestigd.length === 1 ? "school" : "scholen"}`}
        </p>
      </div>

      {bevestigd.length === 0 ? (
        <div className="rounded-xl border border-grijs-200 bg-white p-6 text-body-sm text-grijs-600 shadow-sm">
          Er zijn nog geen scholen aan je account gekoppeld. Neem contact op met de administratie als je verwacht hier scholen te zien.
        </div>
      ) : (
        <ScholenLijstClient scholen={bevestigd} />
      )}

      {mogelijkGekoppeld.length > 0 && (
        <section className="rounded-xl border border-grijs-200 bg-grijs-50 p-4">
          <div className="flex items-center gap-2 text-grijs-600">
            <CircleAlert size={16} />
            <h2 className="text-body-sm font-semibold">Mogelijk ook van jou (niet bevestigd)</h2>
          </div>
          <p className="mt-1 text-label text-grijs-600">
            Deze scholen konden niet met zekerheid aan je account gekoppeld worden. Vraag dit na bij de administratie als dit klopt.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {mogelijkGekoppeld.map((suggestie) => (
              <li key={suggestie.mogelijkeSchoolId} className="text-body-sm text-grijs-700">
                {suggestie.mogelijkeSchoolNaam}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
