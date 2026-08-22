import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalAlleTrainingenVoorTrainer, vandaagIsoAmsterdam, type TrainingMetSchool } from "@/lib/trainers/monday-links";
import { groepeerOpWeergaveStatus, type TrainingWeergaveStatus } from "@/lib/trainers/training-weergave";
import { TRAINING_STATUS_BADGE, TRAINING_STATUS_LABEL } from "@/lib/trainers/status-styles";
import { formatKorteDatum } from "@/lib/sales/format-datum";

export const metadata = { title: "Trainingen — Trainerportal" };

// Traineromgeving V2, Fase 1 (2026-08-28) — flat, chronologisch overzicht
// van ALLE trainingen van de trainer (opdrachtseis: "Bekijk alle
// trainingen"-CTA vanaf het dashboard + nieuw navigatie-item "Trainingen").
// Hergebruikt de BESTAANDE, al geteste bucket-indeling
// (groepeerOpWeergaveStatus, training-weergave.ts) i.p.v. een eigen, derde
// interpretatie van "wat betekent deze training nu" te bouwen — zelfde
// principe als dashboard/schooldetail. Secties in dezelfde prioriteitsvolgorde
// als die indeling zelf documenteert: verslag nog invullen > vandaag > komend
// > open (nog niet gepland) > gedaan > geannuleerd.
const SECTIE_VOLGORDE: { status: TrainingWeergaveStatus; titel: string }[] = [
  { status: "verslag_nog_invullen", titel: "Verslag nog invullen" },
  { status: "vandaag", titel: "Vandaag" },
  { status: "komend", titel: "Komend" },
  { status: "open", titel: "Nog niet gepland" },
  { status: "gedaan", titel: "Gedaan" },
  { status: "geannuleerd", titel: "Geannuleerd" },
];

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

export default async function TrainerTrainingenPage() {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const alle = await haalAlleTrainingenVoorTrainer(trainer);
  const groepen = groepeerOpWeergaveStatus(alle, vandaagIsoAmsterdam());

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-h1 font-bold text-donkerblauw">Trainingen</h1>
        <p className="mt-1 text-body-lg text-grijs-600">{alle.length === 0 ? "Nog geen trainingen gevonden." : `${alle.length} ${alle.length === 1 ? "training" : "trainingen"}`}</p>
      </div>

      {alle.length === 0 ? (
        <div className="rounded-xl border border-grijs-200 bg-white p-6 text-body-sm text-grijs-600 shadow-sm">
          Er zijn nog geen trainingen aan je scholen gekoppeld.
        </div>
      ) : (
        SECTIE_VOLGORDE.filter(({ status }) => groepen[status].length > 0).map(({ status, titel }) => {
          const trainingen = [...groepen[status]].sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? ""));
          return (
            <section key={status} className="rounded-xl border border-grijs-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-grijs-100 px-4 py-3">
                <GraduationCap size={16} className="text-grijs-600" />
                <h2 className="text-h3 font-semibold text-grijs-900">
                  {titel} <span className="font-normal text-grijs-500">({trainingen.length})</span>
                </h2>
              </div>
              <div className="flex flex-col divide-y divide-grijs-100 px-1 py-1">
                {trainingen.map((training) => (
                  <TrainingRij key={training.id} training={training} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
