"use client";

import { useState, type FormEvent } from "react";
import { Plus, Download, Trash2, FileText, X } from "lucide-react";
import { CATEGORIE_LABEL, CATEGORIE_OPTIES, type BestandCategorie, type TrainerBestandRecord } from "@/lib/trainers/bestanden";
import { formatKorteDatum } from "@/lib/sales/format-datum";

// Traineromgeving V2, Fase 3 (2026-08-23) — schoolbestanden-tab
// (Scholen → [school] → Bestanden). Client-side categoriefilter over de al
// server-side opgehaalde lijst (geen refetch per filterkeuze) — zelfde
// patroon als scholen-lijst-client.tsx/kennis-lijst-client.tsx. Upload zelf
// is een POST naar /api/trainers/scholen/[school]/bestanden; het
// school-ID komt uitsluitend uit de al-bekende `schoolId`-prop (de pagina
// zelf), nooit een los invoerveld — "school is al ingevuld en niet
// wijzigbaar" (opdrachtseis §9).

function formaatGrootte(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function bestandsextensieLabel(filename: string): string {
  const punt = filename.lastIndexOf(".");
  return punt === -1 ? "" : filename.slice(punt + 1).toUpperCase();
}

interface BestandenPaneelProps {
  schoolId: string;
  huidigeTrainerId: number;
  initieleBestanden: TrainerBestandRecord[];
  trainingen: { id: string; naam: string }[];
}

export function BestandenPaneel({ schoolId, huidigeTrainerId, initieleBestanden, trainingen }: BestandenPaneelProps) {
  const [bestanden, setBestanden] = useState(initieleBestanden);
  const [categorieFilter, setCategorieFilter] = useState<BestandCategorie | "alle">("alle");
  const [formulierOpen, setFormulierOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [verwijderBezigId, setVerwijderBezigId] = useState<number | null>(null);

  const zichtbareBestanden = categorieFilter === "alle" ? bestanden : bestanden.filter((b) => b.categorie === categorieFilter);

  async function uploaden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBezig(true);
    setFout(null);
    try {
      const formData = new FormData(event.currentTarget);
      const res = await fetch(`/api/trainers/scholen/${schoolId}/bestanden`, { method: "POST", body: formData });
      const data = (await res.json().catch(() => null)) as { bestand?: TrainerBestandRecord; error?: string } | null;
      if (!res.ok || !data?.bestand) {
        throw new Error(data?.error || "Uploaden mislukt.");
      }
      setBestanden((huidig) => [data.bestand!, ...huidig]);
      setFormulierOpen(false);
      event.currentTarget.reset();
    } catch (error) {
      setFout(error instanceof Error ? error.message : "Uploaden mislukt.");
    } finally {
      setBezig(false);
    }
  }

  async function verwijderen(id: number) {
    setVerwijderBezigId(id);
    try {
      const res = await fetch(`/api/trainers/bestanden/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setBestanden((huidig) => huidig.filter((b) => b.id !== id));
    } catch {
      setFout("Verwijderen mislukt. Probeer het opnieuw.");
    } finally {
      setVerwijderBezigId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          value={categorieFilter}
          onChange={(e) => setCategorieFilter(e.target.value as BestandCategorie | "alle")}
          aria-label="Filter op categorie"
          className="rounded-lg border border-grijs-300 bg-white px-2.5 py-1.5 text-body-sm text-grijs-700"
        >
          <option value="alle">Alle categorieën</option>
          {CATEGORIE_OPTIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORIE_LABEL[c]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setFormulierOpen((open) => !open)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-label font-semibold text-white transition-colors hover:bg-teal-700"
        >
          {formulierOpen ? <X size={13} /> : <Plus size={13} />}
          {formulierOpen ? "Annuleren" : "Bestand uploaden"}
        </button>
      </div>

      {formulierOpen && (
        <form onSubmit={uploaden} className="flex flex-col gap-2.5 rounded-lg border border-grijs-200 bg-grijs-50 p-3.5">
          <div>
            <label htmlFor="schoolbestand-file" className="mb-1 block text-label font-medium text-grijs-700">
              Bestand
            </label>
            <input id="schoolbestand-file" name="file" type="file" required className="block w-full text-body-sm" />
          </div>
          <div>
            <label htmlFor="schoolbestand-titel" className="mb-1 block text-label font-medium text-grijs-700">
              Titel
            </label>
            <input id="schoolbestand-titel" name="titel" type="text" required className="w-full rounded-lg border border-grijs-300 px-2.5 py-1.5 text-body-sm" />
          </div>
          <div>
            <label htmlFor="schoolbestand-categorie" className="mb-1 block text-label font-medium text-grijs-700">
              Categorie
            </label>
            <select id="schoolbestand-categorie" name="categorie" required defaultValue="" className="w-full rounded-lg border border-grijs-300 bg-white px-2.5 py-1.5 text-body-sm">
              <option value="" disabled>
                Kies een categorie
              </option>
              {CATEGORIE_OPTIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIE_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          {trainingen.length > 0 && (
            <div>
              <label htmlFor="schoolbestand-training" className="mb-1 block text-label font-medium text-grijs-700">
                Training (optioneel)
              </label>
              <select id="schoolbestand-training" name="mondayTrainingId" defaultValue="" className="w-full rounded-lg border border-grijs-300 bg-white px-2.5 py-1.5 text-body-sm">
                <option value="">Geen specifieke training</option>
                {trainingen.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.naam}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="schoolbestand-omschrijving" className="mb-1 block text-label font-medium text-grijs-700">
              Omschrijving (optioneel)
            </label>
            <textarea id="schoolbestand-omschrijving" name="omschrijving" rows={2} className="w-full rounded-lg border border-grijs-300 px-2.5 py-1.5 text-body-sm" />
          </div>
          {fout && (
            <p role="alert" className="text-label text-red-600">
              {fout}
            </p>
          )}
          <button type="submit" disabled={bezig} className="self-start rounded-lg bg-teal-600 px-3 py-1.5 text-label font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50">
            {bezig ? "Bezig met uploaden…" : "Uploaden"}
          </button>
        </form>
      )}

      {zichtbareBestanden.length === 0 ? (
        <p className="px-1 py-4 text-body-sm text-grijs-600">
          {bestanden.length === 0 ? "Nog geen bestanden bij deze school." : "Geen bestanden in deze categorie."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-grijs-100">
          {zichtbareBestanden.map((bestand) => (
            <li key={bestand.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5">
              <div className="flex min-w-[12rem] flex-1 items-start gap-2">
                <FileText size={16} className="mt-0.5 shrink-0 text-grijs-400" />
                <div>
                  <p className="text-body-sm font-medium text-grijs-900">{bestand.titel}</p>
                  <p className="text-label text-grijs-600">
                    {bestandsextensieLabel(bestand.filename)} · {formaatGrootte(bestand.sizeBytes)} · {CATEGORIE_LABEL[bestand.categorie]} · {bestand.uploaderNaam} ·{" "}
                    {formatKorteDatum(bestand.createdAt)}
                    {bestand.trainingNaam && <> · {bestand.trainingNaam}</>}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <a
                  href={`/api/trainers/bestanden/${bestand.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-grijs-300 px-2.5 py-1.5 text-label font-semibold text-grijs-700 transition-colors hover:border-teal-300 hover:bg-teal-50/40 hover:text-teal-700"
                >
                  <Download size={13} />
                  Download
                </a>
                {bestand.uploaderId === huidigeTrainerId && (
                  <button
                    type="button"
                    onClick={() => verwijderen(bestand.id)}
                    disabled={verwijderBezigId === bestand.id}
                    aria-label={`Verwijder ${bestand.titel}`}
                    className="inline-flex items-center rounded-lg p-1.5 text-grijs-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
