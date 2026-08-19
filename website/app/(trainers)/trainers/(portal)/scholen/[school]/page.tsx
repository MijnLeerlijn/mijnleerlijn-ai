import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MapPin, User, NotebookText } from "lucide-react";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalSchoolDetail, type TrainingSamenvatting } from "@/lib/trainers/monday-links";
import type { TrainingWeergaveStatus } from "@/lib/trainers/training-weergave";
import { formatKorteDatumTijd } from "@/lib/sales/format-datum";
import { TrainingRij } from "./training-rij";
import { TrainerVraagBlok } from "../../trainer-vraag-blok";

interface SchooldetailProps {
  params: Promise<{ school: string }>;
}

const SECTIE_VOLGORDE: readonly TrainingWeergaveStatus[] = ["verslag_nog_invullen", "vandaag", "komend", "open", "gedaan", "geannuleerd"];
const SECTIE_TITEL: Record<TrainingWeergaveStatus, string> = {
  verslag_nog_invullen: "Verslag nog invullen",
  vandaag: "Vandaag",
  komend: "Komend",
  open: "Nieuw",
  gedaan: "Gedaan",
  geannuleerd: "Geannuleerd",
};

function TrainingenGroep({ titel, trainingen, toonLogboekStatus = false }: { titel: string; trainingen: TrainingSamenvatting[]; toonLogboekStatus?: boolean }) {
  if (trainingen.length === 0) return null;
  return (
    <div>
      <h3 className="px-3 pb-1 text-label font-medium uppercase tracking-wide text-grijs-500">{titel}</h3>
      <ul className="flex flex-col divide-y divide-grijs-100">
        {trainingen.map((training) => (
          <TrainingRij key={training.id} training={training} toonLogboekStatus={toonLogboekStatus} logboekIngevuld={training.logboekIngevuld} />
        ))}
      </ul>
    </div>
  );
}

// Architectuurrapport §6 — schooldossier, ontworpen om later de centrale
// trainer-werkruimte te worden. Secties Overzicht/Trainingen/Logboek/
// Contactpersoon staan bewust sequentieel op één pagina i.p.v. als JS-tabs.
//
// Ronde 2 vervolg (2026-08-19) — trainingen zijn nu de eerste schrijfbare
// gegevens in deze portal: status/datum wijzigen via de compacte popovers in
// TrainingRij (vervangt de grote modal), gebouwd bovenop de bewezen veilige
// writeback-laag (lib/trainers/writeback.ts, ongewijzigd qua
// veiligheidsarchitectuur). Secties volgen nu dezelfde centrale bucket-
// indeling als het dashboard (training-weergave.ts) — geen eigen
// interpretatie meer. Deze pagina zelf blijft verder puur server-side
// (auth-gate + één live Monday-fetch); alle interactiviteit zit in
// TrainingRij en de popovers eronder.
export default async function SchooldetailPagina({ params }: SchooldetailProps) {
  const { school: schoolId } = await params;

  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const school = await haalSchoolDetail(trainer, schoolId);
  if (!school) notFound();

  const { trainingen } = school;
  const heeftTrainingen = SECTIE_VOLGORDE.some((sectie) => trainingen[sectie].length > 0);

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
            {SECTIE_VOLGORDE.map((sectie) => (
              <TrainingenGroep
                key={sectie}
                titel={SECTIE_TITEL[sectie]}
                trainingen={trainingen[sectie]}
                toonLogboekStatus={sectie === "verslag_nog_invullen" || sectie === "gedaan"}
              />
            ))}
          </div>
        ) : (
          <p className="px-4 py-4 text-body-sm text-grijs-600">Geen trainingen bekend voor deze school.</p>
        )}
      </section>

      {/* Ronde 2 afronding, Trainer-AI (2026-08-19) — bewust tussen Trainingen
          en Logboek: "de plek waar een trainer zich vóór een training snel
          kan voorbereiden" (opdrachtseis) — direct na wat er gepland staat,
          nog vóór de trainer het volledige logboek in hoeft te duiken. Geen
          dropdown nodig: schoolId ligt al vast vanuit de route. */}
      <TrainerVraagBlok soort="schooldetail" school={{ id: school.id, naam: school.naam }} />

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
