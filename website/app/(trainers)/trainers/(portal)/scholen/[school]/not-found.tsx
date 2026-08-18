import Link from "next/link";

// Wordt gerenderd wanneer haalSchoolDetail() null teruggeeft — óók bij een
// bestaand school-ID dat niet van déze trainer is (object-level autorisatie,
// zie monday-links.ts). Bewust GEEN onderscheid in de tekst tussen "bestaat
// niet" en "is niet van jou": dat onderscheid zelf zou al een datalek zijn.
export default function SchoolNietGevonden() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-grijs-200 bg-white px-4 py-16 text-center shadow-sm">
      <p className="text-label font-medium uppercase tracking-wide text-grijs-400">404</p>
      <h1 className="font-display text-h2 font-bold text-donkerblauw">School niet gevonden</h1>
      <p className="max-w-sm text-body-sm text-grijs-600">
        Deze school bestaat niet of is niet aan jouw account gekoppeld.
      </p>
      <Link href="/scholen" className="mt-2 text-body-sm font-medium text-teal-700 hover:underline">
        Terug naar Mijn scholen
      </Link>
    </div>
  );
}
