import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPayload } from "payload";
import { ArrowLeft } from "lucide-react";
import config from "@/payload.config";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalVerslagVoorTraining, bouwVerslagWeergaveTekst, resolveerTrainingVoorMutatie } from "@/lib/trainers/verslag";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import { VerslagEditor } from "./verslag-editor";

export const metadata = { title: "Trainingsverslag — Trainerportal" };

interface VerslagPaginaProps {
  params: Promise<{ school: string; trainingId: string }>;
}

// Traineromgeving V1, Ronde 3 (2026-08-24) — nieuwe, geneste pagina i.p.v.
// een modal/drawer op schooldetail: het verslag is een multi-stap-flow
// (aantekeningen -> AI-voorstel -> controleren -> definitief opslaan, spec
// §26) die een eigen, ruime pagina beter verdient dan een popover — "kies de
// rustigste UX" (opdrachtseis). Blijft server-side puur een auth-/
// ownership-gate + één-keer-lezen; alle interactiviteit zit in
// VerslagEditor (client component) eronder, zelfde scheiding als
// scholen/[school]/page.tsx <-> training-rij.tsx.
//
// haalTrainingVoorMutatie() (niet haalSchoolDetail) is hier de juiste
// leesfunctie: die doet precies de object-level-autorisatie die deze pagina
// nodig heeft (trainingId moet in de resolutieladder van déze trainer
// voorkomen) zonder de rest van het schooldossier (logboek/andere
// trainingen) mee te moeten laden — dezelfde functie die
// lib/trainers/writeback.ts/verslag.ts server-side al gebruiken. Het
// [school]-segment in de URL is puur voor de "Terug naar school"-link;
// nooit een bron van autorisatie (die komt uitsluitend uit de vers
// opgehaalde resolutieladder van déze trainer, zie hierboven).
export default async function VerslagPagina({ params }: VerslagPaginaProps) {
  const { school: schoolIdUitUrl, trainingId } = await params;

  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  // Upsell-ronde (2026-09-02, spec §A4) — resolveerTrainingVoorMutatie
  // (lib/trainers/verslag.ts) verzorgt hier dezelfde tweeledige resolutie
  // (Monday-training via haalTrainingVoorMutatie ÓF lokale aanvullende
  // training) als de verslag-mutatiefuncties zelf: "geen tweede
  // verslagflow" betekent ook dat deze pagina niet los een eigen,
  // Monday-only resolutie mag blijven doen.
  const payload = await getPayload({ config });
  const gevonden = await resolveerTrainingVoorMutatie(payload, trainer, trainingId);
  if (!gevonden) notFound();
  const { training, schoolId, schoolNaam } = gevonden;

  const verslag = await haalVerslagVoorTraining(payload, trainer, trainingId);

  const terugHref = `/scholen/${schoolIdUitUrl || schoolId}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={terugHref} className="inline-flex items-center gap-1.5 text-body-sm text-grijs-600 hover:text-teal-700">
          <ArrowLeft size={15} />
          {schoolNaam}
        </Link>
        <h1 className="mt-2 font-display text-h1 font-bold text-donkerblauw">Trainingsverslag</h1>
        <p className="mt-1 text-body-sm text-grijs-600">
          {training.naam}
          {training.datum && <> — {formatKorteDatum(training.datum)}</>}
        </p>
      </div>

      {training.bron === "mijnleerlijn" && training.trainerboardItemId === null ? (
        <div className="rounded-xl border border-grijs-200 bg-white p-4 text-body-sm text-grijs-600 shadow-sm">
          Deze training heeft geen eigen trainerboard-item en kan (nog) niet vanuit de portal bewerkt worden.
        </div>
      ) : (
        <VerslagEditor
          trainingId={trainingId}
          schoolId={schoolId}
          trainingNaam={training.naam}
          mondayLogboekIngevuldZonderLokaalVerslag={verslag === null && training.logboekIngevuld}
          verslagInitieel={
            verslag
              ? {
                  status: verslag.status,
                  trainerInvoer: verslag.trainerInvoer ?? null,
                  definitieveTekst: verslag.definitieveTekst ?? null,
                  aiGegenereerd: Boolean(verslag.aiGegenereerd),
                  trainingUpdateStatus: verslag.trainingUpdateStatus,
                  schoolUpdateStatus: verslag.schoolUpdateStatus,
                  // Zelfde functie als de Monday-schrijving (bevestigVerslag,
                  // lib/trainers/verslag.ts) — "identiek in Update, school-
                  // logboek én portal" is hierdoor een architecturele
                  // garantie, geen toevallige gelijkenis. null zolang nog niet
                  // definitief bevestigd (dan toont de editor sowieso nog
                  // geen read-only weergave).
                  weergaveTekst:
                    bouwVerslagWeergaveTekst({
                      bevestigdOp: verslag.bevestigdOp,
                      bevestigdDoorTrainerNaam: verslag.bevestigdDoorTrainerNaam,
                      schoolNaam: verslag.schoolNaam ?? schoolNaam,
                      trainingNaam: verslag.trainingNaam ?? training.naam,
                      definitieveTekst: verslag.definitieveTekst,
                    }) ?? undefined,
                  bron: verslag.bron ?? null,
                  mogelijkOnvolledig: verslag.mogelijkOnvolledig ?? false,
                }
              : null
          }
        />
      )}
    </div>
  );
}
