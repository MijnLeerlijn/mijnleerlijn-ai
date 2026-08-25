"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Loader2 } from "lucide-react";

// Correctieronde Admin Traineromgeving (2026-08-25) — trainer wijzigt eigen
// wachtwoord. Eigen, losse frontend-state (geen import van server-only code
// in een "use client"-bestand), zelfde conventie als logboek/nieuw/
// logboek-form.tsx. Na een geslaagde wijziging worden alle drie velden
// geleegd (nooit een wachtwoord in de DOM laten staan na afloop) en toont dit
// component alleen een succesmelding — geen redirect nodig, de trainer blijft
// op /profiel.
export function WachtwoordForm() {
  const [huidigWachtwoord, setHuidigWachtwoord] = useState("");
  const [nieuwWachtwoord, setNieuwWachtwoord] = useState("");
  const [nieuwWachtwoordBevestiging, setNieuwWachtwoordBevestiging] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFout(null);
    setSucces(false);

    if (nieuwWachtwoord !== nieuwWachtwoordBevestiging) {
      setFout("De bevestiging komt niet overeen met het nieuwe wachtwoord.");
      return;
    }

    setBezig(true);
    try {
      const response = await fetch("/api/trainers/wachtwoord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ huidigWachtwoord, nieuwWachtwoord, nieuwWachtwoordBevestiging }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setFout(typeof body.error === "string" ? body.error : "Wachtwoord wijzigen mislukt. Probeer het opnieuw.");
        return;
      }
      setHuidigWachtwoord("");
      setNieuwWachtwoord("");
      setNieuwWachtwoordBevestiging("");
      setSucces(true);
    } catch {
      setFout("Wachtwoord wijzigen mislukt — controleer je verbinding en probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="max-w-md rounded-xl border border-grijs-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3 border-b border-grijs-100 pb-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
          <KeyRound size={20} />
        </div>
        <div>
          <p className="text-body-lg font-semibold text-grijs-900">Wachtwoord wijzigen</p>
          <p className="text-body-sm text-grijs-600">Wijzig je eigen inlogwachtwoord.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="huidig-wachtwoord" className="mb-1 block text-label font-medium text-grijs-700">
            Huidig wachtwoord
          </label>
          <input
            id="huidig-wachtwoord"
            type="password"
            autoComplete="current-password"
            required
            value={huidigWachtwoord}
            onChange={(e) => setHuidigWachtwoord(e.target.value)}
            className="w-full rounded-lg border border-grijs-300 bg-white px-3 py-2 text-body-sm text-grijs-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div>
          <label htmlFor="nieuw-wachtwoord" className="mb-1 block text-label font-medium text-grijs-700">
            Nieuw wachtwoord
          </label>
          <input
            id="nieuw-wachtwoord"
            type="password"
            autoComplete="new-password"
            required
            value={nieuwWachtwoord}
            onChange={(e) => setNieuwWachtwoord(e.target.value)}
            className="w-full rounded-lg border border-grijs-300 bg-white px-3 py-2 text-body-sm text-grijs-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div>
          <label htmlFor="nieuw-wachtwoord-bevestigen" className="mb-1 block text-label font-medium text-grijs-700">
            Nieuw wachtwoord bevestigen
          </label>
          <input
            id="nieuw-wachtwoord-bevestigen"
            type="password"
            autoComplete="new-password"
            required
            value={nieuwWachtwoordBevestiging}
            onChange={(e) => setNieuwWachtwoordBevestiging(e.target.value)}
            className="w-full rounded-lg border border-grijs-300 bg-white px-3 py-2 text-body-sm text-grijs-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        {fout && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-body-sm text-red-700">
            {fout}
          </p>
        )}
        {succes && <p className="rounded-lg bg-teal-50 px-3 py-2 text-body-sm text-teal-700">Je wachtwoord is gewijzigd.</p>}

        <button
          type="submit"
          disabled={bezig || !huidigWachtwoord || !nieuwWachtwoord || !nieuwWachtwoordBevestiging}
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-teal-600 px-4 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {bezig && <Loader2 size={15} className="animate-spin" />}
          {bezig ? "Bezig…" : "Wachtwoord wijzigen"}
        </button>
      </form>
    </div>
  );
}
