import Link from "next/link";

// Traineromgeving V1, Ronde 3 (2026-08-24) — wordt gerenderd wanneer
// haalTrainingVoorMutatie() null teruggeeft voor dit trainingId, óók bij een
// bestaand training-ID dat niet van déze trainer is (object-level
// autorisatie). Bewust een eigen grens op dit niveau (i.p.v. de
// dichtstbijzijnde ouder, scholen/[school]/not-found.tsx, te laten
// bubbelen): die tekst gaat specifiek over "school bestaat niet", wat hier
// misleidend zou zijn — de school kan prima geldig zijn, alleen dit
// training-ID niet. Zelfde anti-enumeratie-principe: geen onderscheid
// tussen "bestaat niet" en "is niet van jou".
export default function TrainingNietGevonden() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-grijs-200 bg-white px-4 py-16 text-center shadow-sm">
      <p className="text-label font-medium uppercase tracking-wide text-grijs-400">404</p>
      <h1 className="font-display text-h2 font-bold text-donkerblauw">Training niet gevonden</h1>
      <p className="max-w-sm text-body-sm text-grijs-600">
        Deze training bestaat niet of is niet aan jouw account gekoppeld.
      </p>
      <Link href="/scholen" className="mt-2 text-body-sm font-medium text-teal-700 hover:underline">
        Terug naar Mijn scholen
      </Link>
    </div>
  );
}
