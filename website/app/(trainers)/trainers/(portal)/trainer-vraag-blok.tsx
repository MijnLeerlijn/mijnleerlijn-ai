"use client";

import { useState, type FormEvent } from "react";
import { Sparkles, Loader2 } from "lucide-react";

const MAX_VRAAG_LENGTE = 500;

type Modus = { soort: "dashboard"; scholen: { id: string; naam: string }[] } | { soort: "schooldetail"; school: { id: string; naam: string } };

interface Antwoord {
  tekst: string;
  context: "school" | "algemeen";
}

/**
 * Traineromgeving V1, Ronde 2 afronding — Trainer-AI (2026-08-19). Eén
 * gedeeld blok voor zowel het dashboard ("Vraag over" + dropdown Alle
 * scholen/een eigen school) als schooldetail ("Vraag over [schoolnaam]",
 * geen dropdown — de huidige school IS de context). Beide sturen naar
 * dezelfde /api/trainers/vraag-route; het schoolId-onderscheid zit
 * uitsluitend in wat dit component meestuurt. Bewust een eenvoudige
 * vraag->antwoord-interactie, geen chatgeschiedenis (expliciete
 * opdrachtseis — dat is voor een latere fase).
 *
 * De scholenlijst in dashboard-modus komt uitsluitend van de aanroeper
 * (server-side afgeleid van de bevestigde context van déze trainer, zie
 * TrainerDashboardData.bevestigdeScholen in monday-links.ts) — dit
 * component verzint of haalt zelf nooit scholen op. Het schoolId dat
 * uiteindelijk verstuurd wordt is puur een client-side keuze uit die
 * server-aangeleverde lijst; de daadwerkelijke autorisatie (hoort dit
 * school-ID bij déze trainer?) gebeurt hierna opnieuw server-side, in de
 * API-route.
 */
export function TrainerVraagBlok(props: Modus) {
  const [schoolKeuze, setSchoolKeuze] = useState("");
  const [vraag, setVraag] = useState("");
  const [bezig, setBezig] = useState(false);
  const [antwoord, setAntwoord] = useState<Antwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const titel = props.soort === "schooldetail" ? `Vraag over ${props.school.naam}` : "Vraag";

  async function verstuurVraag(e: FormEvent) {
    e.preventDefault();
    const vraagTrim = vraag.trim();
    if (!vraagTrim || bezig) return;

    setBezig(true);
    setFout(null);
    setAntwoord(null);

    const schoolId = props.soort === "schooldetail" ? props.school.id : schoolKeuze || null;

    try {
      const response = await fetch("/api/trainers/vraag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ vraag: vraagTrim, schoolId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setFout(body.error ?? "Vraag stellen mislukt. Probeer het opnieuw.");
        setBezig(false);
        return;
      }

      const data = (await response.json()) as { antwoord: string; context: "school" | "algemeen" };
      setAntwoord({ tekst: data.antwoord, context: data.context });
      setBezig(false);
    } catch {
      setFout("Vraag stellen mislukt — controleer je verbinding en probeer het opnieuw.");
      setBezig(false);
    }
  }

  function nieuweVraag() {
    setVraag("");
    setAntwoord(null);
    setFout(null);
  }

  return (
    <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-grijs-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-teal-600" />
          <h2 className="text-h3 font-semibold text-grijs-900">{titel}</h2>
        </div>
        {props.soort === "dashboard" && (
          <div className="flex items-center gap-1.5">
            <label htmlFor="trainer-vraag-school" className="text-label font-medium text-grijs-600">
              Vraag over
            </label>
            <select
              id="trainer-vraag-school"
              value={schoolKeuze}
              onChange={(e) => setSchoolKeuze(e.target.value)}
              disabled={bezig}
              className="rounded-lg border border-grijs-300 py-1.5 pl-2 pr-7 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:opacity-60"
            >
              <option value="">Alle scholen</option>
              {props.scholen.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.naam}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        {antwoord ? (
          <div className="flex flex-col gap-3">
            <p className="whitespace-pre-line rounded-lg bg-teal-50/60 p-3 text-body-sm text-grijs-900">{antwoord.tekst}</p>
            <button
              type="button"
              onClick={nieuweVraag}
              className="self-start text-body-sm font-medium text-teal-700 hover:underline"
            >
              Nieuwe vraag stellen
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void verstuurVraag(e)} className="flex flex-col gap-2.5">
            <textarea
              value={vraag}
              onChange={(e) => setVraag(e.target.value)}
              disabled={bezig}
              maxLength={MAX_VRAAG_LENGTE}
              rows={2}
              placeholder={
                props.soort === "schooldetail"
                  ? "Bijvoorbeeld: wat moet ik bij de volgende training weten?"
                  : "Bijvoorbeeld: wat staat er deze week nog open?"
              }
              aria-label="Je vraag aan de Trainer-AI"
              className="w-full resize-none rounded-lg border border-grijs-300 p-3 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:opacity-60"
            />

            {fout && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-label text-red-700">
                {fout}
              </p>
            )}

            <button
              type="submit"
              disabled={bezig || vraag.trim().length === 0}
              className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-teal-600 px-4 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bezig ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Bezig met nadenken…
                </>
              ) : (
                "Vraag"
              )}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
