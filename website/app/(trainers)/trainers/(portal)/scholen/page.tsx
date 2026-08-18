import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, CircleAlert } from "lucide-react";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { bepaalScholenVoorTrainer, type TrainerSchoolSamenvatting } from "@/lib/trainers/monday-links";
import { formatKorteDatum } from "@/lib/sales/format-datum";

export const metadata = { title: "Mijn scholen — Trainerportal" };

function StatusTelling({ aantal, label, kleurKlasse }: { aantal: number; label: string; kleurKlasse: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-medium ${kleurKlasse}`}>
      {aantal} {label}
    </span>
  );
}

function SchoolKaart({ school }: { school: TrainerSchoolSamenvatting }) {
  return (
    <Link
      href={`/scholen/${school.id}`}
      className="flex flex-col gap-3 rounded-xl border border-grijs-200 bg-white p-4 shadow-sm transition-colors hover:border-teal-200 hover:shadow-md"
    >
      <div>
        <h3 className="text-h3 font-semibold text-grijs-900">{school.naam}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-body-sm text-grijs-600">
          {school.onderwijstype && <span>{school.onderwijstype}</span>}
          {school.onderwijstype && school.locatie && <span aria-hidden>·</span>}
          {school.locatie && (
            <span className="flex items-center gap-1">
              <MapPin size={13} />
              {school.locatie}
            </span>
          )}
          {!school.onderwijstype && !school.locatie && <span>—</span>}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <StatusTelling aantal={school.aantalOpen} label="open" kleurKlasse="bg-amber-50 text-amber-700" />
        <StatusTelling aantal={school.aantalGepland} label="gepland" kleurKlasse="bg-blue-50 text-blue-700" />
        <StatusTelling aantal={school.aantalGedaan} label="gedaan" kleurKlasse="bg-green-50 text-green-700" />
      </div>

      {school.eerstvolgendeTraining && (
        <p className="text-body-sm text-grijs-600">
          Eerstvolgende: <span className="font-medium text-grijs-900">{formatKorteDatum(school.eerstvolgendeTraining.datum)}</span> —{" "}
          {school.eerstvolgendeTraining.naam}
        </p>
      )}
    </Link>
  );
}

// Architectuurrapport §5 — resolutieladder tier 1+2 ("bevestigd", klikbaar)
// gescheiden van tier 3 ("mogelijk gekoppeld", uitsluitend read-context, zie
// bepaalScholenVoorTrainer() in monday-links.ts). Nooit samenvoegen: een
// naam-suggestie mag nooit als bevestigde autorisatie ogen.
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {bevestigd.map((school) => (
            <SchoolKaart key={school.id} school={school} />
          ))}
        </div>
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
