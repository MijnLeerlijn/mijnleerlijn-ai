"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Plus, Loader2 } from "lucide-react";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import { LegeToestand } from "./training-secties";

// Upsell-ronde (2026-09-02, spec §A1/§A2/§J) — dedicated tab "Aanvullende
// trainingen" op de schooldetailpagina: volledige lijst + "+ Aanvullende
// training"-knop. Harde productseis: binnen ~10 seconden toe te voegen —
// dus uitsluitend naam + datum, geen extra velden. De trainer die de
// aanroep doet wordt server-side (maakAanvullendeTraining) altijd
// automatisch de gekoppelde trainer; dat staat dus nergens in dit formulier.
//
// Geen import van lib/trainers/aanvullende-trainingen.ts hier (server-only
// module, o.a. Payload/Monday-imports) — zelfde conventie als training-rij.tsx
// se eigen doc-comment ("geen import van server-only code in een 'use
// client'-bestand"). De "aanvullend:<id>"-codering wordt daarom hier lokaal,
// triviaal nagebouwd (zelfde vaste vorm als codeerAanvullendeTrainingId).
function verslagHref(schoolId: string, lokaalId: number): string {
  return `/scholen/${schoolId}/trainingen/aanvullend:${lokaalId}/verslag`;
}

export interface AanvullendeTrainingRegel {
  id: number;
  naam: string;
  datum: string;
  trainerNaam: string;
}

interface BewerkStaat {
  id: number;
  naam: string;
  datum: string;
  bezig: boolean;
  fout: string | null;
}

export function AanvullendeTrainingenPaneel({ schoolId, initieel }: { schoolId: string; initieel: AanvullendeTrainingRegel[] }) {
  const [lijst, setLijst] = useState(initieel);
  const [formOpen, setFormOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [datum, setDatum] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const naamId = useId();
  const datumId = useId();

  // Productiecheck-bugfix (2026-08-31, bug 1) — naam/datum achteraf kunnen
  // wijzigen. Eén gedeeld object i.p.v. losse states per veld: er kan
  // hoogstens één rij tegelijk in bewerkstand staan, dus geen aparte
  // per-rij-state (en dus ook geen useId()-per-rij, wat binnen .map() sowieso
  // niet mag — React-hooks nooit in een lus).
  const [bewerkStaat, setBewerkStaat] = useState<BewerkStaat | null>(null);

  function beginBewerken(training: AanvullendeTrainingRegel) {
    setBewerkStaat({ id: training.id, naam: training.naam, datum: training.datum, bezig: false, fout: null });
  }

  async function opslaanBewerken(e: React.FormEvent) {
    e.preventDefault();
    if (!bewerkStaat || !bewerkStaat.naam.trim() || !bewerkStaat.datum) return;
    setBewerkStaat((huidig) => (huidig ? { ...huidig, bezig: true, fout: null } : huidig));
    try {
      const response = await fetch(`/api/trainers/scholen/${schoolId}/aanvullende-trainingen/${bewerkStaat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ naam: bewerkStaat.naam.trim(), datum: bewerkStaat.datum }),
      });
      const data = await response.json();
      if (!response.ok) {
        setBewerkStaat((huidig) => (huidig ? { ...huidig, bezig: false, fout: data.error ?? "Wijzigen mislukt. Probeer het opnieuw." } : huidig));
        return;
      }
      setLijst((huidig) => huidig.map((t) => (t.id === bewerkStaat.id ? { ...t, naam: data.training.naam, datum: data.training.datum } : t)));
      setBewerkStaat(null);
    } catch {
      setBewerkStaat((huidig) => (huidig ? { ...huidig, bezig: false, fout: "Wijzigen mislukt — controleer je verbinding en probeer het opnieuw." } : huidig));
    }
  }

  async function versturen(e: React.FormEvent) {
    e.preventDefault();
    if (!naam.trim() || !datum) return;
    setBezig(true);
    setFout(null);
    try {
      const response = await fetch(`/api/trainers/scholen/${schoolId}/aanvullende-trainingen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ naam: naam.trim(), datum }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFout(data.error ?? "Aanmaken mislukt. Probeer het opnieuw.");
        return;
      }
      const nieuw: AanvullendeTrainingRegel = { id: data.training.id, naam: data.training.naam, datum: data.training.datum, trainerNaam: "Jij" };
      setLijst((huidig) => [nieuw, ...huidig]);
      setNaam("");
      setDatum("");
      setFormOpen(false);
    } catch {
      setFout("Aanmaken mislukt — controleer je verbinding en probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body-sm text-grijs-600">Trainingen die je zelf, los van het MijnLeerlijn-traject, bij deze school geeft.</p>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 py-1.5 text-label font-semibold text-white transition-colors hover:bg-teal-700"
          >
            <Plus size={13} />
            Aanvullende training
          </button>
        )}
      </div>

      {formOpen && (
        <form onSubmit={versturen} className="flex flex-col gap-2.5 rounded-xl border border-grijs-200 bg-grijs-50 p-3.5">
          <div className="flex flex-wrap gap-2.5">
            <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
              <label htmlFor={naamId} className="text-label font-medium uppercase tracking-wide text-grijs-500">
                Training
              </label>
              <input
                id={naamId}
                type="text"
                autoFocus
                required
                maxLength={200}
                value={naam}
                disabled={bezig}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="Bijv. Coachgesprek rekenen groep 5"
                className="rounded-lg border border-grijs-300 px-2.5 py-1.5 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={datumId} className="text-label font-medium uppercase tracking-wide text-grijs-500">
                Datum
              </label>
              <input
                id={datumId}
                type="date"
                required
                value={datum}
                disabled={bezig}
                onChange={(e) => setDatum(e.target.value)}
                className="rounded-lg border border-grijs-300 px-2.5 py-1.5 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
              />
            </div>
          </div>

          {fout && (
            <p role="alert" className="rounded-md bg-red-50 px-2 py-1.5 text-label text-red-700">
              {fout}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={bezig || !naam.trim() || !datum}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-label font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bezig && <Loader2 size={12} className="animate-spin" />}
              Toevoegen
            </button>
            <button
              type="button"
              disabled={bezig}
              onClick={() => {
                setFormOpen(false);
                setFout(null);
              }}
              className="text-label font-medium text-grijs-600 hover:text-grijs-800"
            >
              Annuleren
            </button>
          </div>
        </form>
      )}

      {lijst.length === 0 ? (
        <LegeToestand tekst="Nog geen aanvullende trainingen bij deze school." />
      ) : (
        <ul className="flex flex-col divide-y divide-grijs-100 overflow-hidden rounded-lg border border-grijs-200 bg-white">
          {lijst.map((training) =>
            bewerkStaat?.id === training.id ? (
              <li key={training.id} className="px-3.5 py-2.5">
                <form onSubmit={opslaanBewerken} className="flex flex-wrap items-end gap-2.5">
                  <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
                    <label htmlFor={`bewerk-naam-${training.id}`} className="text-label font-medium uppercase tracking-wide text-grijs-500">
                      Training
                    </label>
                    <input
                      id={`bewerk-naam-${training.id}`}
                      type="text"
                      autoFocus
                      required
                      maxLength={200}
                      value={bewerkStaat.naam}
                      disabled={bewerkStaat.bezig}
                      onChange={(e) => setBewerkStaat((huidig) => (huidig ? { ...huidig, naam: e.target.value } : huidig))}
                      className="rounded-lg border border-grijs-300 px-2.5 py-1.5 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`bewerk-datum-${training.id}`} className="text-label font-medium uppercase tracking-wide text-grijs-500">
                      Datum
                    </label>
                    <input
                      id={`bewerk-datum-${training.id}`}
                      type="date"
                      required
                      value={bewerkStaat.datum}
                      disabled={bewerkStaat.bezig}
                      onChange={(e) => setBewerkStaat((huidig) => (huidig ? { ...huidig, datum: e.target.value } : huidig))}
                      className="rounded-lg border border-grijs-300 px-2.5 py-1.5 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={bewerkStaat.bezig || !bewerkStaat.naam.trim() || !bewerkStaat.datum}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-label font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {bewerkStaat.bezig && <Loader2 size={12} className="animate-spin" />}
                      Opslaan
                    </button>
                    <button type="button" disabled={bewerkStaat.bezig} onClick={() => setBewerkStaat(null)} className="text-label font-medium text-grijs-600 hover:text-grijs-800">
                      Annuleren
                    </button>
                  </div>
                  {bewerkStaat.fout && (
                    <p role="alert" className="w-full rounded-md bg-red-50 px-2 py-1.5 text-label text-red-700">
                      {bewerkStaat.fout}
                    </p>
                  )}
                </form>
              </li>
            ) : (
              <li key={training.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2.5">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-body-sm font-medium text-grijs-900">{training.naam}</p>
                  <p className="text-label text-grijs-600">{training.trainerNaam}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-body-sm text-grijs-600">{formatKorteDatum(training.datum)}</span>
                  <button type="button" onClick={() => beginBewerken(training)} className="text-label font-medium text-teal-700 hover:underline">
                    Bewerken
                  </button>
                  <Link href={verslagHref(schoolId, training.id)} className="text-label font-medium text-teal-700 hover:underline">
                    Verslag
                  </Link>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
