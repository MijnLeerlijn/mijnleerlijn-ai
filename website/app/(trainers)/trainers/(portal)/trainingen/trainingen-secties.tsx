"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, GraduationCap } from "lucide-react";
import type { TrainingMetSchool } from "@/lib/trainers/monday-links";
import type { TrainingWeergaveStatus } from "@/lib/trainers/training-weergave";
import { TRAINING_STATUS_BADGE, TRAINING_STATUS_LABEL } from "@/lib/trainers/status-styles";
import { formatKorteDatum } from "@/lib/sales/format-datum";

export interface TrainingenSectie {
  status: TrainingWeergaveStatus;
  titel: string;
  trainingen: TrainingMetSchool[];
}

// Vervolgronde (2026-08-22) — inklapbare sectiekoppen op /trainingen.
// Urgente/nabije secties staan standaard open (direct zichtbaar), grote
// secundaire bakken staan standaard dicht zodat de pagina rustiger oogt —
// de trainer klapt ze zelf open wanneer nodig. Puur client-side, geen server
// roundtrip en geen wijziging aan de databron/rechten (die blijven in
// page.tsx, dit component ontvangt alleen al-gegroepeerde, al-gefilterde data).
const STANDAARD_OPEN: Record<TrainingWeergaveStatus, boolean> = {
  verslag_nog_invullen: true,
  vandaag: true,
  komend: true,
  open: false,
  gedaan: false,
  geannuleerd: false,
};

function TrainingRij({ training }: { training: TrainingMetSchool }) {
  return (
    <Link
      href={`/scholen/${training.schoolId}`}
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 transition-colors hover:bg-grijs-50"
    >
      <div className="min-w-[10rem] flex-1">
        <p className="text-body-sm font-medium text-grijs-900">{training.schoolNaam}</p>
        <p className="text-label text-grijs-600">{training.naam}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-body-sm text-grijs-600">{formatKorteDatum(training.datum)}</span>
        <span className={`rounded-full px-2 py-0.5 text-label font-semibold ${TRAINING_STATUS_BADGE[training.status]}`}>{TRAINING_STATUS_LABEL[training.status]}</span>
      </div>
    </Link>
  );
}

export function TrainingenSecties({ secties }: { secties: TrainingenSectie[] }) {
  const [open, setOpen] = useState<Partial<Record<TrainingWeergaveStatus, boolean>>>(() => {
    const init: Partial<Record<TrainingWeergaveStatus, boolean>> = {};
    for (const { status } of secties) init[status] = STANDAARD_OPEN[status];
    return init;
  });

  function toggle(status: TrainingWeergaveStatus) {
    setOpen((huidig) => ({ ...huidig, [status]: !(huidig[status] ?? STANDAARD_OPEN[status]) }));
  }

  return (
    <>
      {secties.map(({ status, titel, trainingen }) => {
        const isOpen = open[status] ?? STANDAARD_OPEN[status];
        return (
          <section key={status} className="overflow-hidden rounded-xl border border-grijs-200 bg-white shadow-sm">
            <h2 className="text-h3 font-semibold text-grijs-900">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(status)}
                className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-grijs-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-donkerblauw ${isOpen ? "border-b border-grijs-100" : ""}`}
              >
                <GraduationCap size={16} className="shrink-0 text-grijs-600" aria-hidden="true" />
                <span className="flex-1">
                  {titel} <span className="font-normal text-grijs-500">({trainingen.length})</span>
                </span>
                <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-grijs-400 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} />
              </button>
            </h2>
            {isOpen && (
              <div className="flex flex-col divide-y divide-grijs-100 px-1 py-1">
                {trainingen.map((training) => (
                  <TrainingRij key={training.id} training={training} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
