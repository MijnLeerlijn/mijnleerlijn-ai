"use client";

import { AlertTriangle } from "lucide-react";

// Traineromgeving V1, Ronde 2 vervolg (2026-08-19) — gedeeld tussen
// StatusPopover/DatumPopover/training-rij.tsx (voorheen was dit uitsluitend
// lokaal in training-bewerken-dialog.tsx gedefinieerd; nu heeft élke plek
// die een schrijfuitkomst toont hetzelfde type en dezelfde compacte weergave
// nodig). Vorm 1-op-1 overgenomen van lib/trainers/writeback.ts se
// TrainingKolomResultaat/TrainingWriteBackResultaat — hier bewust als eigen,
// losse frontend-types (geen import van server-only code in een
// "use client"-bestand).
export interface KolomResultaat {
  record: "trainerboard" | "centraal";
  veld: "datum" | "status";
  status: "geschreven" | "conflict" | "mislukt" | "niet_geactiveerd";
  boodschap: string;
  conflict?: { laatstGezienDoorTrainer: string | null; huidigOpMonday: string | null; gebruikerWildeZetten: string | null };
}

export interface WriteBackResultaat {
  kolomResultaten: KolomResultaat[];
  algeheleStatus: "volledig_geslaagd" | "deels_geslaagd" | "geweigerd_conflict" | "volledig_mislukt" | "niet_geactiveerd";
  opnieuwProberen: { trainerboard: boolean; centraal: boolean };
  dataKwaliteitSignaal?: { veld: string; boodschap: string };
}

const RECORD_LABEL: Record<"trainerboard" | "centraal", string> = {
  trainerboard: "Trainerboard",
  centraal: "Centrale training",
};

const VELD_LABEL: Record<"datum" | "status", string> = { datum: "Datum", status: "Status" };

/**
 * Compacte, voor-in-een-popover-passende weergave van een schrijfuitkomst —
 * kleur/tekst zijn NOOIT de enige betekenisdrager (status blijft altijd als
 * tekst zichtbaar naast de kleur, opdrachtseis). Toont automatisch ook een
 * eventuele automatisch-meegeschreven statuskolom (datum -> Gepland-regel,
 * writeback.ts) — de aanroeper hoeft daar niets specifieks voor te doen, de
 * API-respons bevat die kolom gewoon als een extra regel.
 */
export function SchrijfFeedback({
  resultaat,
  onOpnieuwProberen,
  bezigMetOpnieuwProberen,
}: {
  resultaat: WriteBackResultaat;
  onOpnieuwProberen: (record: "trainerboard" | "centraal") => void;
  bezigMetOpnieuwProberen: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {resultaat.kolomResultaten.map((kolom, i) => (
        <div key={i} className="text-label">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-grijs-700">
              {RECORD_LABEL[kolom.record]} — {VELD_LABEL[kolom.veld]}
            </span>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 font-semibold ${
                kolom.status === "geschreven"
                  ? "bg-green-50 text-green-700"
                  : kolom.status === "conflict"
                    ? "bg-amber-50 text-amber-700"
                    : kolom.status === "niet_geactiveerd"
                      ? "bg-grijs-100 text-grijs-600"
                      : "bg-red-50 text-red-700"
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
          {kolom.conflict && (
            <div className="mt-1 flex items-start gap-1.5 rounded-md bg-amber-50 p-1.5 text-label text-amber-800">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <div>
                <p>Laatst gezien: {kolom.conflict.laatstGezienDoorTrainer ?? "(leeg)"}</p>
                <p>Nu op Monday: {kolom.conflict.huidigOpMonday ?? "(leeg)"}</p>
                <p>Jouw wijziging: {kolom.conflict.gebruikerWildeZetten ?? "(leeg)"}</p>
              </div>
            </div>
          )}
          {kolom.status === "mislukt" && <p className="mt-0.5 text-label text-grijs-500">{kolom.boodschap}</p>}
        </div>
      ))}

      {resultaat.dataKwaliteitSignaal && (
        <p className="text-label text-grijs-500">Let op (voor Michel gelogd): {resultaat.dataKwaliteitSignaal.boodschap}</p>
      )}

      {(resultaat.opnieuwProberen.trainerboard || resultaat.opnieuwProberen.centraal) && (
        <div className="mt-0.5 flex flex-wrap gap-1.5">
          {resultaat.opnieuwProberen.trainerboard && (
            <button
              type="button"
              disabled={bezigMetOpnieuwProberen}
              onClick={() => onOpnieuwProberen("trainerboard")}
              className="rounded-md border border-grijs-300 px-2 py-1 text-label font-medium text-grijs-700 transition-colors hover:border-teal-600 hover:text-teal-700 disabled:opacity-40"
            >
              Trainerboard opnieuw proberen
            </button>
          )}
          {resultaat.opnieuwProberen.centraal && (
            <button
              type="button"
              disabled={bezigMetOpnieuwProberen}
              onClick={() => onOpnieuwProberen("centraal")}
              className="rounded-md border border-grijs-300 px-2 py-1 text-label font-medium text-grijs-700 transition-colors hover:border-teal-600 hover:text-teal-700 disabled:opacity-40"
            >
              Centrale training opnieuw proberen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
