"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Traineromgeving V2, Fase 1 (2026-08-28) — het "+ Logboekitem"-formulier.
// Eigen, losse frontend-types (geen import van server-only code in een
// "use client"-bestand), zelfde conventie als verslag-editor.tsx/
// schrijf-feedback.tsx.
const MAX_TEKST = 4000;

const TYPE_OPTIES: { value: string; label: string }[] = [
  { value: "telefonisch", label: "Telefonisch" },
  { value: "helpdesk", label: "Helpdesk" },
  { value: "overleg", label: "Overleg" },
  { value: "notitie", label: "Notitie" },
  { value: "overig", label: "Overig" },
];

/** "2026-08-28T14:05" in de LOKALE tijd van de browser — het juiste standaardformaat voor <input type="datetime-local">. Server-side wordt dit bij verzenden omgezet naar een echte ISO-tijdstip (new Date(...).toISOString()), zie handleSubmit hieronder. */
function nuAlsDatetimeLocal(): string {
  const nu = new Date();
  const lokaal = new Date(nu.getTime() - nu.getTimezoneOffset() * 60_000);
  return lokaal.toISOString().slice(0, 16);
}

export function LogboekForm({
  scholen,
  vooringevuldeSchoolId,
  vooringevuldeTrainingId,
}: {
  scholen: { id: string; naam: string }[];
  vooringevuldeSchoolId?: string;
  vooringevuldeTrainingId?: string;
}) {
  const router = useRouter();
  const schoolGevonden = vooringevuldeSchoolId && scholen.some((s) => s.id === vooringevuldeSchoolId);

  const [school, setSchool] = useState(schoolGevonden ? vooringevuldeSchoolId! : "");
  const [type, setType] = useState("");
  const [occurredAt, setOccurredAt] = useState(nuAlsDatetimeLocal());
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!school || !type || !occurredAt || tekst.trim().length === 0) return;

    setBezig(true);
    setFout(null);
    try {
      const response = await fetch("/api/trainers/logboek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          mondaySchoolId: school,
          type,
          occurredAt: new Date(occurredAt).toISOString(),
          tekst,
          mondayTrainingId: vooringevuldeTrainingId,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setFout(typeof body.error === "string" ? body.error : "Opslaan mislukt. Probeer het opnieuw.");
        setBezig(false);
        return;
      }
      router.push(schoolGevonden ? `/scholen/${school}` : "/logboek");
      router.refresh();
    } catch {
      setFout("Opslaan mislukt — controleer je verbinding en probeer het opnieuw.");
      setBezig(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="logboek-school" className="mb-1 block text-label font-medium text-grijs-700">
          School
        </label>
        <select
          id="logboek-school"
          value={school}
          onChange={(e) => setSchool(e.target.value)}
          required
          className="w-full rounded-lg border border-grijs-300 bg-white px-3 py-2 text-body-sm text-grijs-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="" disabled>
            Kies een school…
          </option>
          {scholen.map((s) => (
            <option key={s.id} value={s.id}>
              {s.naam}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="logboek-type" className="mb-1 block text-label font-medium text-grijs-700">
          Type contact
        </label>
        <select
          id="logboek-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          required
          className="w-full rounded-lg border border-grijs-300 bg-white px-3 py-2 text-body-sm text-grijs-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="" disabled>
            Kies een type…
          </option>
          {TYPE_OPTIES.map((optie) => (
            <option key={optie.value} value={optie.value}>
              {optie.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="logboek-datum" className="mb-1 block text-label font-medium text-grijs-700">
          Datum/tijd
        </label>
        <input
          id="logboek-datum"
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          required
          className="w-full rounded-lg border border-grijs-300 bg-white px-3 py-2 text-body-sm text-grijs-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>

      <div>
        <label htmlFor="logboek-tekst" className="mb-1 block text-label font-medium text-grijs-700">
          Notitie
        </label>
        <textarea
          id="logboek-tekst"
          value={tekst}
          onChange={(e) => setTekst(e.target.value.slice(0, MAX_TEKST))}
          required
          rows={5}
          placeholder="Waar ging het contact over?"
          className="w-full rounded-lg border border-grijs-300 bg-white px-3 py-2 text-body-sm text-grijs-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <p className="mt-1 text-right text-label text-grijs-500">
          {tekst.length}/{MAX_TEKST}
        </p>
      </div>

      {fout && <p className="rounded-lg bg-red-50 px-3 py-2 text-body-sm text-red-700">{fout}</p>}

      <button
        type="submit"
        disabled={bezig || !school || !type || tekst.trim().length === 0}
        className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-teal-600 px-4 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {bezig && <Loader2 size={15} className="animate-spin" />}
        {bezig ? "Opslaan…" : "Logboekitem opslaan"}
      </button>
    </form>
  );
}
