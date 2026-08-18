import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MapPin, User, NotebookText } from "lucide-react";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalSchoolDetail, type TrainingSamenvatting } from "@/lib/trainers/monday-links";
import { formatKorteDatum, formatKorteDatumTijd } from "@/lib/sales/format-datum";

interface SchooldetailProps {
  params: Promise<{ school: string }>;
}

const STATUS_LABEL: Record<TrainingSamenvatting["status"], string> = {
  open: "Open",
  gepland: "Gepland",
  gedaan: "Gedaan",
  geannuleerd: "Geannuleerd",
};

const STATUS_KLEUR: Record<TrainingSamenvatting["status"], string> = {
  open: "bg-amber-50 text-amber-700",
  gepland: "bg-blue-50 text-blue-700",
  gedaan: "bg-green-50 text-green-700",
  geannuleerd: "bg-grijs-100 text-grijs-600",
};

function TrainingRij({ training, toonLogboekStatus = false }: { training: TrainingSamenvatting; toonLogboekStatus?: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5">
      <p className="min-w-[10rem] flex-1 text-body-sm font-medium text-grijs-900">{training.naam}</p>
      <div className="flex shrink-0 items-center gap-2">
        {toonLogboekStatus && (
          <span
            className={`rounded-full px-2 py-0.5 text-label font-medium ${
              training.logboekIngevuld ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {training.logboekIngevuld ? "Logboek ingevuld" : "Logboek niet ingevuld"}
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-label font-medium ${STATUS_KLEUR[training.status]}`}>
          {STATUS_LABEL[training.status]}
        </span>
        <span className="w-20 text-right text-body-sm text-grijs-600">{formatKorteDatum(training.datum)}</span>
      </div>
    </li>
  );
}

function TrainingenGroep({
  titel,
  trainingen,
  toonLogboekStatus = false,
}: {
  titel: string;
  trainingen: TrainingSamenvatting[];
  toonLogboekStatus?: boolean;
}) {
  if (trainingen.length === 0) return null;
  return (
    <div>
      <h3 className="px-3 pb-1 text-label font-medium uppercase tracking-wide text-grijs-500">{titel}</h3>
      <ul className="flex flex-col divide-y divide-grijs-100">
        {trainingen.map((training) => (
          <TrainingRij key={training.id} training={training} toonLogboekStatus={toonLogboekStatus} />
        ))}
      </ul>
    </div>
  );
}

// Architectuurrapport §6 — read-only schooldossier, ontworpen om later de
// centrale trainer-werkruimte te worden. Secties Overzicht/Trainingen/
// Logboek/Contactpersoon staan bewust sequentieel op één pagina i.p.v. als
// JS-tabs: dit is puur read-only informatie, dus geen interactiviteitswinst,
// en werkt zo vanzelf goed op mobiel (geen aparte mobiele tab-variant nodig).
export default async function SchooldetailPagina({ params }: SchooldetailProps) {
  const { school: schoolId } = await params;

  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const school = await haalSchoolDetail(trainer, schoolId);
  if (!school) notFound();

  const { trainingen } = school;
  const heeftTrainingen =
    trainingen.open.length + trainingen.gepland.length + trainingen.gedaan.length + trainingen.geannuleerd.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/scholen" className="inline-flex items-center gap-1.5 text-body-sm text-grijs-600 hover:text-teal-700">
          <ArrowLeft size={15} />
          Mijn scholen
        </Link>
        <h1 className="mt-2 font-display text-h1 font-bold text-donkerblauw">{school.naam}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-grijs-600">
          {school.onderwijstype && <span>{school.onderwijstype}</span>}
          {school.locatie && (
            <span className="flex items-center gap-1">
              <MapPin size={13} />
              {school.locatie}
            </span>
          )}
          {school.implementatiefase && (
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-label font-medium text-teal-700">
              {school.implementatiefase}
            </span>
          )}
        </p>
      </div>

      <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
        <div className="border-b border-grijs-100 px-4 py-3">
          <h2 className="text-h3 font-semibold text-grijs-900">Trainingen</h2>
        </div>
        {heeftTrainingen ? (
          <div className="flex flex-col gap-4 py-3">
            <TrainingenGroep titel="Open" trainingen={trainingen.open} />
            <TrainingenGroep titel="Gepland" trainingen={trainingen.gepland} />
            <TrainingenGroep titel="Gedaan" trainingen={trainingen.gedaan} toonLogboekStatus />
            <TrainingenGroep titel="Geannuleerd" trainingen={trainingen.geannuleerd} />
          </div>
        ) : (
          <p className="px-4 py-4 text-body-sm text-grijs-600">Geen trainingen bekend voor deze school.</p>
        )}
      </section>

      <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-grijs-100 px-4 py-3">
          <NotebookText size={16} className="text-grijs-600" />
          <h2 className="text-h3 font-semibold text-grijs-900">Logboek</h2>
        </div>
        {school.logboek.length === 0 ? (
          <p className="px-4 py-4 text-body-sm text-grijs-600">Nog geen logboekvermeldingen voor deze school.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-grijs-100">
            {school.logboek.map((update) => (
              <li key={update.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2 text-label text-grijs-500">
                  <span>{update.creator?.name ?? "Onbekend"}</span>
                  <span>{formatKorteDatumTijd(update.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-body-sm text-grijs-900">{update.text_body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-grijs-100 px-4 py-3">
          <User size={16} className="text-grijs-600" />
          <h2 className="text-h3 font-semibold text-grijs-900">Contactpersoon</h2>
        </div>
        <p className="px-4 py-4 text-body-sm text-grijs-900">
          {school.contactpersoonNaam ?? <span className="text-grijs-600">Geen contactpersoon gekoppeld.</span>}
        </p>
      </section>
    </div>
  );
}
