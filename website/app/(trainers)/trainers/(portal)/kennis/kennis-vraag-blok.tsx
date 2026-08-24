"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";

const MAX_VRAAG_LENGTE = 500;

interface Bron {
  id: number;
  titel: string;
  /** Hoofdstuk van de best passende chunk (opdrachtseis §5) — null als het document geen hoofdstukmetadata heeft. */
  heading: string | null;
  headingSlug: string | null;
}

interface Antwoord {
  tekst: string;
  bronnen: Bron[];
}

/**
 * Vervolgronde (2026-08-22) — Kennis-Q&A: "Stel een vraag over MijnLeerlijn
 * en onze werkwijze" (opdrachtseis, exacte tekst). Zelfde opzet als
 * trainer-vraag-blok.tsx (eenvoudige vraag->antwoord, geen chatgeschiedenis)
 * — bewust een ANDER component, geen hergebruik van dat blok zelf: dit stuurt
 * naar een andere route (/api/trainers/kennis/vraag, geen schoolId-concept)
 * en toont bronartikelen met doorklik, wat trainer-vraag-blok.tsx niet doet.
 *
 * Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing"
 * (opdrachtseis §5): een bron met headingSlug krijgt een "Bekijk hoofdstuk"-
 * link naar /kennis/[id]#slug (scrolt direct naar dat hoofdstuk, zie
 * kennis-reader.tsx); zonder headingSlug (document zonder hoofdstukmetadata)
 * blijft de link naar het hele document, zoals voorheen.
 */
export function KennisVraagBlok() {
  const [vraag, setVraag] = useState("");
  const [bezig, setBezig] = useState(false);
  const [antwoord, setAntwoord] = useState<Antwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function verstuurVraag(e: FormEvent) {
    e.preventDefault();
    const vraagTrim = vraag.trim();
    if (!vraagTrim || bezig) return;

    setBezig(true);
    setFout(null);
    setAntwoord(null);

    try {
      const response = await fetch("/api/trainers/kennis/vraag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ vraag: vraagTrim }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setFout(body.error ?? "Vraag stellen mislukt. Probeer het opnieuw.");
        setBezig(false);
        return;
      }

      const data = (await response.json()) as { antwoord: string; bronnen: Bron[] };
      setAntwoord({ tekst: data.antwoord, bronnen: data.bronnen });
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
    <section className="rounded-xl border border-teal-200 bg-teal-50/40 shadow-sm">
      <div className="flex items-center gap-2 border-b border-teal-100 px-4 py-3">
        <Sparkles size={16} className="text-teal-700" />
        <h2 className="text-h3 font-semibold text-grijs-900">Stel een vraag over MijnLeerlijn en onze werkwijze</h2>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {antwoord ? (
          <div className="flex flex-col gap-3">
            <p className="whitespace-pre-line rounded-lg bg-white p-3 text-body-sm text-grijs-900">{antwoord.tekst}</p>
            {antwoord.bronnen.length > 0 && (
              <div>
                <p className="text-label font-medium text-grijs-600">Gebruikte kennisartikelen</p>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {antwoord.bronnen.map((bron, index) => (
                    <li key={`${bron.id}-${bron.headingSlug ?? index}`} className="rounded-lg border border-grijs-100 bg-white px-3 py-2">
                      <p className="text-body-sm font-medium text-grijs-900">{bron.titel}</p>
                      {bron.headingSlug && bron.heading && <p className="mt-0.5 text-label text-grijs-600">{bron.heading}</p>}
                      <Link
                        href={bron.headingSlug ? `/kennis/${bron.id}#${bron.headingSlug}` : `/kennis/${bron.id}`}
                        className="mt-1 inline-flex items-center gap-1 text-body-sm font-medium text-teal-700 hover:underline"
                      >
                        {bron.headingSlug ? "Bekijk hoofdstuk" : "Bekijk artikel"}
                        <ArrowRight size={13} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button type="button" onClick={nieuweVraag} className="self-start text-body-sm font-medium text-teal-700 hover:underline">
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
              placeholder="Bijvoorbeeld: hoe begeleid ik een school bij het voorbereiden van een periode?"
              aria-label="Je vraag over MijnLeerlijn en onze werkwijze"
              className="w-full resize-none rounded-lg border border-grijs-300 bg-white p-3 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:opacity-60"
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
