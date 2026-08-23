"use client";

import { useState, type FormEvent } from "react";
import { Plus, Download, Trash2, FileText, X, Users } from "lucide-react";
import { CATEGORIE_LABEL, CATEGORIE_OPTIES, type BestandCategorie, type TrainerBestandRecord, type GedeeldBestandRecord } from "@/lib/trainers/bestanden";
import type { TrainerDeelgroepSamenvatting } from "@/lib/trainers/groepen";
import { formatKorteDatum } from "@/lib/sales/format-datum";

// Traineromgeving V2, Fase 3 (2026-08-23) — algemene Bestanden-pagina (spec
// §2/§4/§10). Twee secties, bewust GEEN tabs (dit zijn geen alternatieve
// weergaven van dezelfde data zoals bij Schooldetail, maar twee inhoudelijk
// verschillende lijsten die een trainer allebei in één oogopslag moet kunnen
// zien — "makkelijk kunnen zien wat van hemzelf is, wat gedeeld is").
// Upload is een POST naar /api/trainers/bestanden; "groepen" hieronder komt
// server-side al gefilterd op de eigen, actieve lidmaatschappen van de
// trainer (lib/trainers/groepen.ts) — dit formulier toont dus per
// constructie nooit een groep waar de trainer geen lid van is (spec §4: "hij
// mag nooit delen met een groep waarvan hij geen lid is"), en de route
// herverifieert dit hoe dan ook nog een keer server-side.

function formaatGrootte(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function bestandsextensieLabel(filename: string): string {
  const punt = filename.lastIndexOf(".");
  return punt === -1 ? "" : filename.slice(punt + 1).toUpperCase();
}

function MijnBestandRij({ bestand, onVerwijderen, verwijderBezig }: { bestand: TrainerBestandRecord; onVerwijderen: (id: number) => void; verwijderBezig: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5">
      <div className="flex min-w-[12rem] flex-1 items-start gap-2">
        <FileText size={16} className="mt-0.5 shrink-0 text-grijs-400" />
        <div>
          <p className="text-body-sm font-medium text-grijs-900">{bestand.titel}</p>
          <p className="text-label text-grijs-600">
            {bestandsextensieLabel(bestand.filename)} · {formaatGrootte(bestand.sizeBytes)} · {CATEGORIE_LABEL[bestand.categorie]} · {formatKorteDatum(bestand.createdAt)}
            {bestand.zichtbaarheid === "gedeeld" && bestand.deelgroepen.length > 0 && (
              <> · Gedeeld met {bestand.deelgroepen.map((g) => g.naam).join(", ")}</>
            )}
            {bestand.zichtbaarheid === "prive" && <> · Alleen voor mij</>}
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
        <button
          type="button"
          onClick={() => onVerwijderen(bestand.id)}
          disabled={verwijderBezig}
          aria-label={`Verwijder ${bestand.titel}`}
          className="inline-flex items-center rounded-lg p-1.5 text-grijs-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </li>
  );
}

function GedeeldBestandRij({ bestand }: { bestand: GedeeldBestandRecord }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5">
      <div className="flex min-w-[12rem] flex-1 items-start gap-2">
        <FileText size={16} className="mt-0.5 shrink-0 text-grijs-400" />
        <div>
          <p className="text-body-sm font-medium text-grijs-900">{bestand.titel}</p>
          <p className="text-label text-grijs-600">
            {bestandsextensieLabel(bestand.filename)} · {formaatGrootte(bestand.sizeBytes)} · {CATEGORIE_LABEL[bestand.categorie]} · {bestand.uploaderNaam} · {formatKorteDatum(bestand.createdAt)}
          </p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-label text-teal-700">
            <Users size={11} />
            Via {bestand.gedeeldViaGroepen.map((g) => g.naam).join(", ")}
          </p>
        </div>
      </div>
      <a
        href={`/api/trainers/bestanden/${bestand.id}/download`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-grijs-300 px-2.5 py-1.5 text-label font-semibold text-grijs-700 transition-colors hover:border-teal-300 hover:bg-teal-50/40 hover:text-teal-700"
      >
        <Download size={13} />
        Download
      </a>
    </li>
  );
}

interface BestandenClientProps {
  initieelMijnBestanden: TrainerBestandRecord[];
  initieelGedeeldeBestanden: GedeeldBestandRecord[];
  groepen: TrainerDeelgroepSamenvatting[];
}

export function BestandenClient({ initieelMijnBestanden, initieelGedeeldeBestanden, groepen }: BestandenClientProps) {
  const [mijnBestanden, setMijnBestanden] = useState(initieelMijnBestanden);
  const [gedeeldeBestanden] = useState(initieelGedeeldeBestanden);
  const [formulierOpen, setFormulierOpen] = useState(false);
  const [zichtbaarheid, setZichtbaarheid] = useState<"prive" | "gedeeld">("prive");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [verwijderBezigId, setVerwijderBezigId] = useState<number | null>(null);

  async function uploaden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBezig(true);
    setFout(null);
    try {
      const formData = new FormData(event.currentTarget);
      const res = await fetch("/api/trainers/bestanden", { method: "POST", body: formData });
      const data = (await res.json().catch(() => null)) as { bestand?: TrainerBestandRecord; error?: string } | null;
      if (!res.ok || !data?.bestand) {
        throw new Error(data?.error || "Uploaden mislukt.");
      }
      setMijnBestanden((huidig) => [data.bestand!, ...huidig]);
      setFormulierOpen(false);
      setZichtbaarheid("prive");
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
      setMijnBestanden((huidig) => huidig.filter((b) => b.id !== id));
    } catch {
      setFout("Verwijderen mislukt. Probeer het opnieuw.");
    } finally {
      setVerwijderBezigId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
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
        <form onSubmit={uploaden} className="flex flex-col gap-2.5 rounded-xl border border-grijs-200 bg-white p-4 shadow-sm">
          <div>
            <label htmlFor="algemeen-file" className="mb-1 block text-label font-medium text-grijs-700">
              Bestand
            </label>
            <input id="algemeen-file" name="file" type="file" required className="block w-full text-body-sm" />
          </div>
          <div>
            <label htmlFor="algemeen-titel" className="mb-1 block text-label font-medium text-grijs-700">
              Titel
            </label>
            <input id="algemeen-titel" name="titel" type="text" required className="w-full rounded-lg border border-grijs-300 px-2.5 py-1.5 text-body-sm" />
          </div>
          <div>
            <label htmlFor="algemeen-categorie" className="mb-1 block text-label font-medium text-grijs-700">
              Categorie
            </label>
            <select id="algemeen-categorie" name="categorie" required defaultValue="" className="w-full rounded-lg border border-grijs-300 bg-white px-2.5 py-1.5 text-body-sm">
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
          <div>
            <label htmlFor="algemeen-omschrijving" className="mb-1 block text-label font-medium text-grijs-700">
              Omschrijving (optioneel)
            </label>
            <textarea id="algemeen-omschrijving" name="omschrijving" rows={2} className="w-full rounded-lg border border-grijs-300 px-2.5 py-1.5 text-body-sm" />
          </div>

          <fieldset>
            <legend className="mb-1 text-label font-medium text-grijs-700">Zichtbaarheid</legend>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-body-sm text-grijs-800">
                <input type="radio" name="zichtbaarheid" value="prive" checked={zichtbaarheid === "prive"} onChange={() => setZichtbaarheid("prive")} />
                Alleen voor mij
              </label>
              <label className="flex items-center gap-2 text-body-sm text-grijs-800">
                <input
                  type="radio"
                  name="zichtbaarheid"
                  value="gedeeld"
                  checked={zichtbaarheid === "gedeeld"}
                  onChange={() => setZichtbaarheid("gedeeld")}
                  disabled={groepen.length === 0}
                />
                Delen met groep(en){groepen.length === 0 && " (je zit nog in geen enkele groep)"}
              </label>
            </div>
          </fieldset>

          {zichtbaarheid === "gedeeld" && groepen.length > 0 && (
            <div>
              <span className="mb-1 block text-label font-medium text-grijs-700">Groepen</span>
              <div className="flex flex-col gap-1.5">
                {groepen.map((groep) => (
                  <label key={groep.id} className="flex items-center gap-2 text-body-sm text-grijs-800">
                    <input type="checkbox" name="deelgroepen" value={groep.id} />
                    {groep.naam}
                  </label>
                ))}
              </div>
            </div>
          )}

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

      <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
        <div className="border-b border-grijs-100 px-4 py-3">
          <h2 className="text-h3 font-semibold text-grijs-900">Mijn bestanden</h2>
        </div>
        <div className="px-3.5 py-1">
          {mijnBestanden.length === 0 ? (
            <p className="px-1 py-4 text-body-sm text-grijs-600">Je hebt nog geen bestanden geüpload.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-grijs-100">
              {mijnBestanden.map((bestand) => (
                <MijnBestandRij key={bestand.id} bestand={bestand} onVerwijderen={verwijderen} verwijderBezig={verwijderBezigId === bestand.id} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
        <div className="border-b border-grijs-100 px-4 py-3">
          <h2 className="text-h3 font-semibold text-grijs-900">Met mij gedeeld</h2>
        </div>
        <div className="px-3.5 py-1">
          {gedeeldeBestanden.length === 0 ? (
            <p className="px-1 py-4 text-body-sm text-grijs-600">Nog niets met je gedeeld.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-grijs-100">
              {gedeeldeBestanden.map((bestand) => (
                <GedeeldBestandRij key={bestand.id} bestand={bestand} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
