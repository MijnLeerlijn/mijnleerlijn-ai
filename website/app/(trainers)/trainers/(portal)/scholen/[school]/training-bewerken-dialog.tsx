"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, AlertTriangle, Trash2 } from "lucide-react";
import type { TrainingStatus } from "@/lib/trainers/monday-links";
import { TRAINING_STATUS_LABEL } from "@/lib/trainers/status-styles";

// Traineromgeving V1, Ronde 2 (2026-08-19) — eerste client-interactieve
// component in deze portal (alles ervoor was server-rendered read-only).
// Gebouwd op de native <dialog>+.showModal() — gratis focus-trap/Escape/
// top-layer in elke evergreen browser, relevant omdat dit meteen een
// schrijf-flow is. Eén gedeeld component i.p.v. per-rij inline-edit: een
// training-edit moet datum+status+conflict-vergelijking+per-record-retry
// kunnen tonen, en schooldetail rendert meerdere trainingen tegelijk in
// gegroepeerde lijsten — dat blijft "rustig" met één gedeelde dialoog i.p.v.
// die hele staat per rij te dragen.
//
// Stateloos verzoekmodel (lib/trainers/writeback.ts): elke poging — ook een
// "opnieuw proberen ná conflict" — is gewoon een nieuw PATCH-verzoek met een
// bijgewerkte verwachteHuidigeWaarde/verwachteHuidigeRuweTekst. Geen aparte
// "bevestig conflict"-vlag nodig; de server vergelijkt sowieso altijd live
// opnieuw, dus een tweede wijziging ná het tonen van de keuze conflicteert
// gewoon opnieuw — nooit blind overschrijven.
interface TrainingProps {
  id: string;
  naam: string;
  status: TrainingStatus;
  ruweStatusTekst: string | null;
  datum: string | null;
}

interface KolomResultaat {
  record: "trainerboard" | "centraal";
  veld: "datum" | "status";
  status: "geschreven" | "conflict" | "mislukt" | "niet_geactiveerd";
  boodschap: string;
  conflict?: { laatstGezienDoorTrainer: string | null; huidigOpMonday: string | null; gebruikerWildeZetten: string | null };
}

interface WriteBackResultaat {
  kolomResultaten: KolomResultaat[];
  algeheleStatus: "volledig_geslaagd" | "deels_geslaagd" | "geweigerd_conflict" | "volledig_mislukt" | "niet_geactiveerd";
  opnieuwProberen: { trainerboard: boolean; centraal: boolean };
  dataKwaliteitSignaal?: { veld: string; boodschap: string };
}

const RECORD_LABEL: Record<"trainerboard" | "centraal", string> = {
  trainerboard: "Trainerboard",
  centraal: "Centrale training",
};

function isGeldigeDatum(waarde: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(waarde);
}

export default function TrainingBewerkenDialog({ training }: { training: TrainingProps }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // "Baseline" — wat de trainer (of het laatste servervoordeel) het laatst
  // als waarheid zag. Wordt bijgewerkt ná elke poging, ook een geweigerde,
  // zodat een volgende poging altijd tegen de meest recent GETOONDE waarde
  // vergelijkt — nooit tegen de oorspronkelijke paginalaad als er al een
  // conflict tussendoor is getoond.
  const [baselineDatum, setBaselineDatum] = useState<string | null>(training.datum);
  const [baselineStatusTekst, setBaselineStatusTekst] = useState<string | null>(training.ruweStatusTekst);

  const [datumInvoer, setDatumInvoer] = useState(training.datum ?? "");
  const [datumVerwijderIntentie, setDatumVerwijderIntentie] = useState(false);
  const [statusInvoer, setStatusInvoer] = useState<TrainingStatus>(training.status);

  const [bezig, setBezig] = useState(false);
  const [resultaat, setResultaat] = useState<WriteBackResultaat | null>(null);
  const [algemeneFout, setAlgemeneFout] = useState<string | null>(null);

  function openDialoog() {
    setDatumInvoer(baselineDatum ?? "");
    setDatumVerwijderIntentie(false);
    setStatusInvoer(training.status);
    setResultaat(null);
    setAlgemeneFout(null);
    dialogRef.current?.showModal();
  }

  function sluitDialoog() {
    if (bezig) return; // nooit sluiten tijdens een lopende poging — voorkomt een halfafgemaakte indruk
    dialogRef.current?.close();
  }

  function bouwVerzoek(alleenRecord?: "trainerboard" | "centraal") {
    const verzoek: Record<string, unknown> = {};

    const datumGewijzigd = datumVerwijderIntentie || datumInvoer !== (baselineDatum ?? "");
    if (datumGewijzigd) {
      verzoek.datum = {
        nieuweWaarde: datumVerwijderIntentie ? null : datumInvoer || null,
        verwachteHuidigeWaarde: baselineDatum,
      };
    }

    if (statusInvoer !== training.status) {
      verzoek.status = { nieuweWaarde: statusInvoer, verwachteHuidigeRuweTekst: baselineStatusTekst };
    }

    if (alleenRecord) verzoek.alleenRecord = alleenRecord;
    return verzoek;
  }

  async function verstuur(verzoek: Record<string, unknown>) {
    if (Object.keys(verzoek).length === 0) {
      setAlgemeneFout("Er is niets gewijzigd.");
      return;
    }
    setBezig(true);
    setAlgemeneFout(null);
    try {
      const response = await fetch(`/api/trainers/trainingen/${training.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Expliciet maken van het bestaande browserdefault voor een
        // root-relatief same-origin fetch()-verzoek — geen gedragswijziging,
        // dus geen verlaging van enige beveiligingsgrens: er wordt geen
        // cross-origin credential-verzending mogelijk gemaakt die vandaag
        // niet al (impliciet) zou gebeuren.
        credentials: "same-origin",
        body: JSON.stringify(verzoek),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setAlgemeneFout(body.error ?? "Bijwerken mislukt. Probeer het opnieuw.");
        return;
      }
      const data = (await response.json()) as WriteBackResultaat;
      setResultaat(data);

      // Baseline bijwerken op basis van wat er nu daadwerkelijk gebeurd is,
      // zodat een eventuele volgende poging (retry/opnieuw wijzigen) tegen
      // de actuele stand vergelijkt.
      for (const kolom of data.kolomResultaten) {
        if (kolom.record !== "centraal") continue; // de UI toont/vergelijkt uitsluitend de centrale waarde, zie writeback.ts se toelichting
        if (kolom.veld === "datum") {
          if (kolom.status === "geschreven") setBaselineDatum(datumVerwijderIntentie ? null : datumInvoer || null);
          else if (kolom.conflict) setBaselineDatum(kolom.conflict.huidigOpMonday);
        }
        if (kolom.veld === "status") {
          if (kolom.status === "geschreven") setBaselineStatusTekst(null); // volgende live read levert de echte ruwe tekst; hier alleen de lokale aanname resetten
          else if (kolom.conflict) setBaselineStatusTekst(kolom.conflict.huidigOpMonday);
        }
      }

      if (data.algeheleStatus === "volledig_geslaagd") {
        router.refresh();
      }
    } catch {
      setAlgemeneFout("Bijwerken mislukt — controleer je verbinding en probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (datumInvoer && !isGeldigeDatum(datumInvoer)) {
      setAlgemeneFout("Ongeldige datum.");
      return;
    }
    void verstuur(bouwVerzoek());
  }

  function probeerRecordOpnieuw(record: "trainerboard" | "centraal") {
    if (!resultaat) return;
    const verzoek: Record<string, unknown> = { alleenRecord: record };
    const nogTeDoen = resultaat.kolomResultaten.filter((k) => k.record === record && k.status !== "geschreven");
    for (const kolom of nogTeDoen) {
      if (kolom.veld === "datum") {
        verzoek.datum = {
          nieuweWaarde: datumVerwijderIntentie ? null : datumInvoer || null,
          verwachteHuidigeWaarde: kolom.conflict ? kolom.conflict.huidigOpMonday : baselineDatum,
        };
      }
      if (kolom.veld === "status") {
        verzoek.status = {
          nieuweWaarde: statusInvoer,
          verwachteHuidigeRuweTekst: kolom.conflict ? kolom.conflict.huidigOpMonday : baselineStatusTekst,
        };
      }
    }
    void verstuur(verzoek);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialoog}
        className="rounded-lg border border-grijs-300 px-2.5 py-1 text-label font-medium text-grijs-700 transition-colors hover:border-teal-600 hover:text-teal-700"
      >
        Bewerken
      </button>

      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          if (bezig) e.preventDefault();
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) sluitDialoog();
        }}
        className="w-full max-w-md rounded-xl border border-grijs-200 p-0 shadow-lg backdrop:bg-grijs-900/40"
      >
        <div className="flex items-center justify-between border-b border-grijs-100 px-4 py-3">
          <h2 className="text-h3 font-semibold text-grijs-900">{training.naam}</h2>
          <button type="button" onClick={sluitDialoog} disabled={bezig} className="rounded-md p-1 text-grijs-500 hover:bg-grijs-100 disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="training-datum" className="text-label font-medium uppercase tracking-wide text-grijs-600">
              Datum
            </label>
            <div className="flex items-center gap-2">
              <input
                id="training-datum"
                type="date"
                value={datumInvoer}
                disabled={bezig || datumVerwijderIntentie}
                onChange={(e) => {
                  setDatumVerwijderIntentie(false);
                  setDatumInvoer(e.target.value);
                }}
                className="flex-1 rounded-lg border border-grijs-300 px-3 py-2 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:bg-grijs-50 disabled:text-grijs-400"
              />
              {baselineDatum && !datumVerwijderIntentie && (
                <button
                  type="button"
                  disabled={bezig}
                  onClick={() => {
                    setDatumVerwijderIntentie(true);
                    setDatumInvoer("");
                  }}
                  title="Datum verwijderen"
                  className="rounded-lg border border-grijs-300 p-2 text-grijs-500 hover:border-rood hover:text-rood disabled:opacity-40"
                >
                  <Trash2 size={16} />
                </button>
              )}
              {datumVerwijderIntentie && (
                <button
                  type="button"
                  disabled={bezig}
                  onClick={() => {
                    setDatumVerwijderIntentie(false);
                    setDatumInvoer(baselineDatum ?? "");
                  }}
                  className="text-label font-medium text-teal-700 hover:underline"
                >
                  Ongedaan maken
                </button>
              )}
            </div>
            {datumVerwijderIntentie && <p className="text-label text-grijs-600">Datum wordt verwijderd bij opslaan.</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="training-status" className="text-label font-medium uppercase tracking-wide text-grijs-600">
              Status
            </label>
            <select
              id="training-status"
              value={statusInvoer}
              disabled={bezig}
              onChange={(e) => setStatusInvoer(e.target.value as TrainingStatus)}
              className="rounded-lg border border-grijs-300 px-3 py-2 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:bg-grijs-50"
            >
              {(Object.keys(TRAINING_STATUS_LABEL) as TrainingStatus[]).map((status) => (
                <option key={status} value={status}>
                  {TRAINING_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </div>

          {algemeneFout && (
            <p role="alert" className="rounded-lg bg-rood/10 px-3 py-2 text-body-sm text-rood">
              {algemeneFout}
            </p>
          )}

          {resultaat && (
            <div className="flex flex-col gap-2 rounded-lg border border-grijs-200 bg-grijs-50 p-3">
              {resultaat.kolomResultaten.map((kolom, i) => (
                <div key={i} className="text-body-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-grijs-900">
                      {RECORD_LABEL[kolom.record]} — {kolom.veld === "datum" ? "Datum" : "Status"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-label font-medium ${
                        kolom.status === "geschreven"
                          ? "bg-green-50 text-green-700"
                          : kolom.status === "conflict"
                            ? "bg-amber-50 text-amber-700"
                            : kolom.status === "niet_geactiveerd"
                              ? "bg-grijs-100 text-grijs-600"
                              : "bg-rood/10 text-rood"
                      }`}
                    >
                      {kolom.status === "geschreven"
                        ? "Opgeslagen"
                        : kolom.status === "conflict"
                          ? "Conflict"
                          : kolom.status === "niet_geactiveerd"
                            ? "Nog niet actief"
                            : "Mislukt"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-label text-grijs-600">{kolom.boodschap}</p>
                  {kolom.conflict && (
                    <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-label text-amber-800">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <div>
                        <p>Laatst gezien: {kolom.conflict.laatstGezienDoorTrainer ?? "(leeg)"}</p>
                        <p>Nu op Monday: {kolom.conflict.huidigOpMonday ?? "(leeg)"}</p>
                        <p>Jouw wijziging: {kolom.conflict.gebruikerWildeZetten ?? "(leeg)"}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {resultaat.dataKwaliteitSignaal && (
                <p className="text-label text-grijs-500">Let op (voor Michel gelogd): {resultaat.dataKwaliteitSignaal.boodschap}</p>
              )}

              {(resultaat.opnieuwProberen.trainerboard || resultaat.opnieuwProberen.centraal) && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {resultaat.opnieuwProberen.trainerboard && (
                    <button
                      type="button"
                      disabled={bezig}
                      onClick={() => probeerRecordOpnieuw("trainerboard")}
                      className="rounded-lg border border-grijs-300 px-3 py-1.5 text-label font-medium text-grijs-700 hover:border-teal-600 hover:text-teal-700 disabled:opacity-40"
                    >
                      Trainerboard opnieuw proberen
                    </button>
                  )}
                  {resultaat.opnieuwProberen.centraal && (
                    <button
                      type="button"
                      disabled={bezig}
                      onClick={() => probeerRecordOpnieuw("centraal")}
                      className="rounded-lg border border-grijs-300 px-3 py-1.5 text-label font-medium text-grijs-700 hover:border-teal-600 hover:text-teal-700 disabled:opacity-40"
                    >
                      Centrale training opnieuw proberen
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={sluitDialoog}
              disabled={bezig}
              className="rounded-lg px-4 py-2 text-body-sm font-medium text-grijs-700 hover:bg-grijs-100 disabled:opacity-40"
            >
              {resultaat?.algeheleStatus === "volledig_geslaagd" ? "Sluiten" : "Annuleren"}
            </button>
            <button
              type="submit"
              disabled={bezig}
              className="rounded-lg bg-teal-600 px-4 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bezig ? "Bezig met opslaan…" : "Opslaan"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
