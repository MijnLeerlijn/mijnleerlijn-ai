import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CalendarClock, School, NotebookPen } from "lucide-react";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalDashboardData, type TrainingMetSchool } from "@/lib/trainers/monday-links";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import { TrainerVraagBlok } from "./trainer-vraag-blok";

export const metadata = { title: "Dashboard — Trainerportal" };

function TrainingRij({ training, toonLogboekTag = false }: { training: TrainingMetSchool; toonLogboekTag?: boolean }) {
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
        {toonLogboekTag && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-label font-medium text-amber-700">
            Logboek niet ingevuld
          </span>
        )}
        <span className="text-body-sm text-grijs-600">{formatKorteDatum(training.datum)}</span>
      </div>
    </Link>
  );
}

function LegeSectie({ tekst }: { tekst: string }) {
  return <p className="px-3 py-4 text-body-sm text-grijs-600">{tekst}</p>;
}

// Architectuurrapport §16 Ronde 1 — uitsluitend read-only afgeleide
// informatie, geen enkele Monday-mutatie. Trainingen zonder datum worden
// nergens getoond (haalDashboardData() filtert dit al af, zie monday-
// links.ts) — expliciete opdrachtseis.
export default async function TrainerDashboardPage() {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const data = await haalDashboardData(trainer);
  const voornaam = trainer.name.split(" ")[0] || trainer.name;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-h1 font-bold text-donkerblauw">Welkom, {voornaam}</h1>
        <p className="mt-1 text-body-lg text-grijs-600">Hier is je overzicht voor vandaag.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-grijs-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-grijs-600">
            <CalendarDays size={18} className="text-teal-600" />
            <span className="text-label font-medium uppercase tracking-wide">Vandaag</span>
          </div>
          <p className="mt-2 text-h1 font-bold text-grijs-900">{data.trainingenVandaag.length}</p>
        </div>
        <Link
          href="/scholen"
          className="rounded-xl border border-grijs-200 bg-white p-4 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/40"
        >
          <div className="flex items-center gap-2 text-grijs-600">
            <School size={18} className="text-teal-600" />
            <span className="text-label font-medium uppercase tracking-wide">Mijn scholen</span>
          </div>
          <p className="mt-2 text-h1 font-bold text-grijs-900">{data.aantalScholen}</p>
        </Link>
        <div className="rounded-xl border border-grijs-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-grijs-600">
            <NotebookPen size={18} className={data.logboekOpenstaand.length > 0 ? "text-amber-600" : "text-teal-600"} />
            <span className="text-label font-medium uppercase tracking-wide">Verslag nog invullen</span>
          </div>
          <p className={`mt-2 text-h1 font-bold ${data.logboekOpenstaand.length > 0 ? "text-amber-600" : "text-grijs-900"}`}>
            {data.logboekOpenstaand.length}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-grijs-100 px-4 py-3">
          <CalendarDays size={16} className="text-grijs-600" />
          <h2 className="text-h3 font-semibold text-grijs-900">Vandaag</h2>
        </div>
        <div className="flex flex-col divide-y divide-grijs-100 px-1 py-1">
          {data.trainingenVandaag.length === 0 ? (
            <LegeSectie tekst="Geen trainingen gepland voor vandaag." />
          ) : (
            data.trainingenVandaag.map((training) => <TrainingRij key={training.id} training={training} />)
          )}
        </div>
      </section>

      <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-grijs-100 px-4 py-3">
          <CalendarClock size={16} className="text-grijs-600" />
          <h2 className="text-h3 font-semibold text-grijs-900">Komend</h2>
        </div>
        <div className="flex flex-col divide-y divide-grijs-100 px-1 py-1">
          {data.komendeTrainingen.length === 0 ? (
            <LegeSectie tekst="Geen aankomende trainingen gepland." />
          ) : (
            data.komendeTrainingen.map((training) => <TrainingRij key={training.id} training={training} />)
          )}
        </div>
      </section>

      {data.logboekOpenstaand.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/40 shadow-sm">
          <div className="flex items-center gap-2 border-b border-amber-100 px-4 py-3">
            <NotebookPen size={16} className="text-amber-700" />
            <h2 className="text-h3 font-semibold text-grijs-900">Verslag nog invullen</h2>
          </div>
          <div className="flex flex-col divide-y divide-amber-100 px-1 py-1">
            {data.logboekOpenstaand.map((training) => (
              <TrainingRij key={training.id} training={training} toonLogboekTag />
            ))}
          </div>
        </section>
      )}

      {/* Ronde 2 afronding, Trainer-AI (2026-08-19) — expliciet ONDER de drie
          operationele secties (Vandaag/Komend/Verslag nog invullen), nooit
          ervoor: het Vraag-blok mag de operationele aandachtspunten nooit
          verdringen (opdrachtseis). */}
      <TrainerVraagBlok soort="dashboard" scholen={data.bevestigdeScholen} />
    </div>
  );
}
