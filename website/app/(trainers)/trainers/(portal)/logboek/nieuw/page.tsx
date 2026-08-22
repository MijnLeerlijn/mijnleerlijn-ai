import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { bepaalScholenVoorTrainer } from "@/lib/trainers/monday-links";
import { LogboekForm } from "./logboek-form";

export const metadata = { title: "Nieuw logboekitem — Trainerportal" };

interface NieuwLogboekPaginaProps {
  searchParams: Promise<{ school?: string; training?: string }>;
}

// Traineromgeving V2, Fase 1 (2026-08-28) — "+ Logboekitem"-flow (opdrachtseis:
// "de trainer kiest een school, type contact, datum/tijd en schrijft een
// notitie"). Server component: auth-gate + de scholenlijst voor de dropdown
// (dezelfde bevestigde lijst als /scholen, geen nieuwe resolutieladder).
// ?school=/&training= zijn puur UI-voorinvulling (spec: "vanaf een school/
// training... zodat de trainer niet opnieuw de school hoeft te zoeken") — de
// daadwerkelijke autorisatie gebeurt hoe dan ook opnieuw server-side in
// lib/trainers/logboek.ts se maakLogboekItem, dus een ongeldige/vervalste
// queryparameter hier is onschadelijk (leidt hooguit tot een 404 bij
// verzenden, nooit tot een stille misgreep).
export default async function NieuwLogboekitemPagina({ searchParams }: NieuwLogboekPaginaProps) {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const { school: vooringevuldeSchoolId, training: vooringevuldeTrainingId } = await searchParams;
  const { bevestigd } = await bepaalScholenVoorTrainer(trainer);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/logboek" className="inline-flex items-center gap-1.5 text-body-sm text-grijs-600 hover:text-teal-700">
          <ArrowLeft size={15} />
          Logboek
        </Link>
        <h1 className="mt-2 font-display text-h1 font-bold text-donkerblauw">Nieuw logboekitem</h1>
        <p className="mt-1 text-body-lg text-grijs-600">Leg een contactmoment of aantekening vast, los van een trainingsverslag.</p>
      </div>

      {bevestigd.length === 0 ? (
        <div className="rounded-xl border border-grijs-200 bg-white p-6 text-body-sm text-grijs-600 shadow-sm">
          Er zijn nog geen scholen aan je account gekoppeld — een logboekitem heeft altijd een school nodig.
        </div>
      ) : (
        <section className="rounded-xl border border-grijs-200 bg-white p-4 shadow-sm sm:p-6">
          <LogboekForm scholen={bevestigd.map((s) => ({ id: s.id, naam: s.naam }))} vooringevuldeSchoolId={vooringevuldeSchoolId} vooringevuldeTrainingId={vooringevuldeTrainingId} />
        </section>
      )}
    </div>
  );
}
