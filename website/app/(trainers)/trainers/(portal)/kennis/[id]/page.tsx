import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getPayload } from "payload";
import { ArrowLeft } from "lucide-react";
import config from "@/payload.config";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalGepubliceerdeKennisversie } from "@/lib/trainers/kennis";

export const metadata = { title: "Kennis — Trainerportal" };

// Vervolgronde (2026-08-22) — leesweergave van één gepubliceerde
// trainer-kennisversie. haalGepubliceerdeKennisversie geeft null terug voor
// een concept (nog niet gepubliceerd) of een niet-bestaand ID — 404, geen
// onderscheid, zelfde privacy-/eenvoudsprincipe als elders in de
// traineromgeving ("bestaat dit wel/hoort dit bij mij" nooit lekken via het
// verschil tussen 403/404). Platte tekst gerenderd als gewone JSX-tekstchild
// (whitespace-pre-line) — geen dangerouslySetInnerHTML, geen markdown-
// parsing, zelfde veilige patroon als elders in de traineromgeving (zie
// lib/trainers/activiteit.ts se kortePreview-toelichting).
export default async function TrainerKennisversieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const { id } = await params;
  const kennisversieId = Number(id);
  if (!Number.isInteger(kennisversieId)) notFound();

  const payload = await getPayload({ config });
  const kennisversie = await haalGepubliceerdeKennisversie(payload, kennisversieId);
  if (!kennisversie) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/kennis" className="inline-flex w-fit items-center gap-1.5 text-body-sm font-medium text-teal-700 hover:underline">
        <ArrowLeft size={14} />
        Terug naar Kennis
      </Link>

      <div className="rounded-xl border border-grijs-200 bg-white p-6 shadow-sm">
        <h1 className="font-display text-h2 font-bold text-donkerblauw">{kennisversie.titel}</h1>
        <p className="mt-4 whitespace-pre-line text-body-md text-grijs-800">{kennisversie.tekst}</p>
      </div>
    </div>
  );
}
