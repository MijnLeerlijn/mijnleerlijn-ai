import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPayload } from "payload";
import { ArrowLeft, MapPin, PhoneIncoming, Plus } from "lucide-react";
import config from "@/payload.config";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalSchoolDetail } from "@/lib/trainers/monday-links";
import { haalVerslagenPerTraining, haalTelefonischeConceptenVoorTrainer } from "@/lib/trainers/verslag";
import { haalSchoolBestanden } from "@/lib/trainers/bestanden";
import { formatKorteDatumTijd } from "@/lib/sales/format-datum";
import { TrainingSecties, LegeToestand } from "./training-secties";
import { SchooldetailTabs } from "./schooldetail-tabs";
import { BestandenPaneel } from "./bestanden-paneel";
import { TrainerVraagBlok } from "../../trainer-vraag-blok";

interface SchooldetailProps {
  params: Promise<{ school: string }>;
}

// Architectuurrapport §6 — schooldossier, ontworpen om later de centrale
// trainer-werkruimte te worden.
//
// Schooldetail-UX-ronde (2026-08-25, ná Michels live Ronde-3-hertest) —
// Trainingen/Vraag aan AI/Logboek/Contactpersoon stonden voorheen sequentieel
// onder elkaar; bij veel trainingen werd de pagina daardoor onnodig lang
// (opdrachtseis). Nu Trainingen als hoofdscherm + de overige drie als tabs
// (SchooldetailTabs, ./schooldetail-tabs.tsx) — puur een presentatiewijziging:
// dezelfde vier onderdelen, dezelfde databronnen, geen nieuwe fetch en geen
// gedupliceerde component. Deze pagina zelf blijft verder puur server-side
// (auth-/ownership-gate + één live Monday-fetch); alle interactiviteit zit in
// TrainingRij/de popovers eronder en in SchooldetailTabs zelf.
export default async function SchooldetailPagina({ params }: SchooldetailProps) {
  const { school: schoolId } = await params;

  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const school = await haalSchoolDetail(trainer, schoolId);
  if (!school) notFound();

  const { trainingen } = school;

  // Uitsluitend voor de secties die toonLogboekStatus (dus ook de
  // verslag-CTA) tonen — zelfde contextminimalisatie-principe als elders in
  // dit bestand, geen opzoeking voor trainingen waar de CTA toch niet
  // verschijnt.
  const payload = await getPayload({ config });
  const verslagRelevanteIds = [...trainingen.verslag_nog_invullen, ...trainingen.gedaan].map((t) => t.id);
  const verslagenPerTraining = await haalVerslagenPerTraining(payload, trainer, verslagRelevanteIds);
  // Ronde 3.5 (telefonie) — spec §13: "Same on Schooldetail." Los van
  // verslagenPerTraining hierboven: een telefonisch ingesproken concept kan
  // bij een training staan die Monday-status-technisch nog niet in
  // "verslag_nog_invullen"/"gedaan" valt (de trainer belde bv. vóór het zelf
  // op "Gedaan" zetten) — een eigen banner boven de tabs is daarom
  // betrouwbaarder dan uitsluitend op de bestaande sectie-CTA's vertrouwen.
  const telefonischeConceptenVoorSchool = (await haalTelefonischeConceptenVoorTrainer(payload, trainer)).filter((c) => c.schoolId === school.id);

  // Fase 3 (2026-08-23) — schoolbestanden-tab. haalSchoolBestanden verifieert
  // de schooltoegang zelf nogmaals (haalSchoolDetail); hier al gegarandeerd
  // niet-null, want deze pagina zelf gaf hierboven al notFound() als de
  // trainer geen toegang tot deze school heeft.
  const schoolBestanden = (await haalSchoolBestanden(payload, trainer, school.id)) ?? [];
  const trainingenVoorUpload = Object.values(trainingen)
    .flat()
    .map((t) => ({ id: t.id, naam: t.naam }));

  const trainingenPaneel = <TrainingSecties trainingen={trainingen} schoolId={school.id} verslagenPerTraining={verslagenPerTraining} />;

  const logboekPaneel =
    school.logboek.length === 0 ? (
      <LegeToestand tekst="Nog geen logboekvermeldingen voor deze school." />
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
    );

  const contactpersoonPaneel = school.contactpersoonNaam ? (
    <p className="px-4 py-4 text-body-sm text-grijs-900">{school.contactpersoonNaam}</p>
  ) : (
    <LegeToestand tekst="Geen contactpersoon gekoppeld." />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/scholen" className="inline-flex items-center gap-1.5 text-body-sm text-grijs-600 hover:text-teal-700">
            <ArrowLeft size={15} />
            Scholen
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
        {/* Traineromgeving V2, Fase 1 (2026-08-28) — spec: "vanaf een school...
            een snelle mogelijkheid om een logboekitem voor die school te
            maken, zodat de trainer niet opnieuw de school hoeft te zoeken."
            Alleen de school wordt voorgevuld (?school=...) — de daadwerkelijke
            eigendomscontrole gebeurt hoe dan ook opnieuw server-side. */}
        <Link
          href={`/logboek/nieuw?school=${school.id}`}
          className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-grijs-300 bg-white px-3 py-1.5 text-label font-semibold text-grijs-700 transition-colors hover:border-teal-300 hover:bg-teal-50/40 hover:text-teal-700"
        >
          <Plus size={13} />
          Logboekitem
        </Link>
      </div>

      {telefonischeConceptenVoorSchool.length > 0 && (
        <section className="rounded-xl border border-teal-200 bg-teal-50/40 shadow-sm">
          <div className="flex items-center gap-2 border-b border-teal-100 px-4 py-3">
            <PhoneIncoming size={16} className="text-teal-700" />
            <h2 className="text-h3 font-semibold text-grijs-900">Ingesproken verslag controleren</h2>
          </div>
          <div className="flex flex-col divide-y divide-teal-100 px-1 py-1">
            {telefonischeConceptenVoorSchool.map((concept) => (
              <div key={concept.mondayTrainingId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg px-3 py-2.5">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-body-sm font-medium text-grijs-900">{concept.trainingNaam}</p>
                  <p className="text-label text-grijs-600">Ingesproken op {formatKorteDatumTijd(concept.ontvangenOp)}</p>
                </div>
                <Link
                  href={`/scholen/${school.id}/trainingen/${concept.mondayTrainingId}/verslag`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-label font-semibold text-white transition-colors hover:bg-teal-700"
                >
                  <PhoneIncoming size={12} />
                  Controleren
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
        <SchooldetailTabs
          trainingenPaneel={trainingenPaneel}
          aiPaneel={<TrainerVraagBlok soort="schooldetail" school={{ id: school.id, naam: school.naam }} />}
          logboekPaneel={logboekPaneel}
          bestandenPaneel={
            <BestandenPaneel schoolId={school.id} huidigeTrainerId={trainer.id} initieleBestanden={schoolBestanden} trainingen={trainingenVoorUpload} />
          }
          contactpersoonPaneel={contactpersoonPaneel}
        />
      </section>
    </div>
  );
}
