import Link from "next/link";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import { NotebookText, Plus } from "lucide-react";
import config from "@/payload.config";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalActiviteitVoorTrainer } from "@/lib/trainers/activiteit";
import { formatKorteDatumTijd } from "@/lib/sales/format-datum";
import { ACTIVITEIT_ICOON, ACTIVITEIT_LABEL, ACTIVITEIT_KLEUR } from "@/lib/trainers/activiteit-styles";

export const metadata = { title: "Logboek — Trainerportal" };

// Traineromgeving V2, Fase 1 (2026-08-28) — /logboek: ÉÉN chronologische
// tijdlijn van de eigen activiteiten (opdrachtseis: "trainingsverslagen;
// handmatige logboekitems... maak duidelijk visueel onderscheid"). Zelfde
// databron/mergefunctie als de dashboard-sectie "Recente activiteit"
// (lib/trainers/activiteit.ts) — hier met een ruimere limiet, geen tweede
// interpretatie van "wat is activiteit".
const TIJDLIJN_LIMIET = 100;

export default async function TrainerLogboekPage() {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const payload = await getPayload({ config });
  const activiteit = await haalActiviteitVoorTrainer(payload, trainer, TIJDLIJN_LIMIET);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-h1 font-bold text-donkerblauw">Logboek</h1>
          <p className="mt-1 text-body-lg text-grijs-600">Trainingsverslagen en handmatige contactmomenten, chronologisch.</p>
        </div>
        <Link href="/logboek/nieuw" className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-label font-semibold text-white transition-colors hover:bg-teal-700">
          <Plus size={14} />
          Logboekitem
        </Link>
      </div>

      <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-grijs-100 px-4 py-3">
          <NotebookText size={16} className="text-grijs-600" />
          <h2 className="text-h3 font-semibold text-grijs-900">Tijdlijn</h2>
        </div>
        {activiteit.length === 0 ? (
          <p className="px-4 py-6 text-body-sm text-grijs-600">Nog geen activiteit — trainingsverslagen en logboekitems verschijnen hier.</p>
        ) : (
          <div className="flex flex-col divide-y divide-grijs-100 px-1 py-1">
            {activiteit.map((item, i) => {
              const Icoon = ACTIVITEIT_ICOON[item.soort];
              return (
                <Link key={`${item.href}-${i}`} href={item.href} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-grijs-50">
                  <div className="flex min-w-[10rem] flex-1 items-start gap-3">
                    <span className={`mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full p-1.5 ${ACTIVITEIT_KLEUR[item.soort]}`}>
                      <Icoon size={13} />
                    </span>
                    <div>
                      <p className="text-body-sm font-medium text-grijs-900">{item.schoolNaam}</p>
                      <p className="text-label text-grijs-600">
                        {ACTIVITEIT_LABEL[item.soort]} · {item.titel}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-label text-grijs-500">{formatKorteDatumTijd(item.wanneer)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
