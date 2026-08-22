import Link from "next/link";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import { CalendarClock, School, GraduationCap, Sparkles, PhoneIncoming, RotateCcw, ArrowRight, Plus, NotebookText } from "lucide-react";
import config from "@/payload.config";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalDashboardV2Data, type AandachtItem } from "@/lib/trainers/dashboard";
import { haalVerslagenPerTraining, type VerslagRecord } from "@/lib/trainers/verslag";
import type { TrainingMetSchool } from "@/lib/trainers/monday-links";
import { formatKorteDatum, formatKorteDatumTijd } from "@/lib/sales/format-datum";
import { ACTIVITEIT_ICOON, ACTIVITEIT_LABEL, ACTIVITEIT_KLEUR } from "@/lib/trainers/activiteit-styles";
import { TrainerVraagBlok } from "./trainer-vraag-blok";

export const metadata = { title: "Dashboard — Trainerportal" };

// Traineromgeving V2, Fase 1 (2026-08-28) — Dashboard V2, herbouwd vanuit
// "Wat moet ik vandaag doen en wat komt eraan?" (opdrachtseis) i.p.v. het
// cijfermatige V1-dashboard (git-historie: drie statistiek-tegels bovenaan).
// Vaste hiërarchie, IDENTIEK op mobiel en desktop (spec: "op mobiel moet de
// volgorde simpelweg zijn Aandacht nodig → Vandaag → Komende trainingen →
// Recente activiteit → Statistieken") — bewust ÉÉN kolom op alle
// breakpoints (net als de V1-pagina al deed), dus geen aparte
// responsive-herordening nodig: er is maar één volgorde. Geen brede tabellen
// (spec) — overal kaarten/lijsten, zelfde stijltaal als de rest van de
// traineromgeving (rounded-xl/border-grijs-200/shadow-sm).
//
// Statistieken bevat BEWUST GEEN "uren" (opdrachtseis noemt dit als
// voorbeeld) — trainingsduur zit nergens in het huidige datamodel (zie
// lib/trainers/dashboard.ts se toelichting bij DashboardV2Statistieken) en
// "gebruik alleen data die werkelijk beschikbaar is" (opdrachtseis) verbiedt
// dat hier te verzinnen; "Verslagen afgerond" vervangt die tegel met een
// vergelijkbaar betekenisvolle, wél eerlijk beschikbare statistiek.
function bepaalGroet(): string {
  const uur = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "numeric", hour12: false }).format(new Date()));
  if (uur < 12) return "Goedemorgen";
  if (uur < 18) return "Goedemiddag";
  return "Goedenavond";
}

function LegeSectie({ tekst }: { tekst: string }) {
  return <p className="px-3 py-4 text-body-sm text-grijs-600">{tekst}</p>;
}

function AandachtRij({ item }: { item: AandachtItem }) {
  const telefonisch = item.soort === "telefonisch_concept";
  const tijdLabel = telefonisch ? `Ingesproken op ${formatKorteDatumTijd(item.wanneer)}` : "Nog niet volledig verwerkt naar Monday";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg px-3 py-2.5">
      <Link href={`/scholen/${item.schoolId}`} className="min-w-[10rem] flex-1 hover:underline">
        <p className="text-body-sm font-medium text-grijs-900">{item.schoolNaam}</p>
        <p className="text-label text-grijs-600">
          {item.trainingNaam} · {tijdLabel}
        </p>
      </Link>
      <Link
        href={`/scholen/${item.schoolId}/trainingen/${item.trainingId}/verslag`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-label font-semibold text-white transition-colors hover:bg-teal-700"
      >
        {telefonisch ? <PhoneIncoming size={12} /> : <RotateCcw size={12} />}
        {telefonisch ? "Controleren" : "Verslag afronden"}
      </Link>
    </div>
  );
}

/** Zelfde CTA-labellogica als de V1-pagina (verslagCtaLabel) — hier uitgebreid met een statuslabel/-kleur voor de "Vandaag"-kaart, die (i.t.t. V1) per training altijd de verslagstatus toont, niet alleen bij "nog niet ingevuld". */
function verslagStatusEnActie(lokaal: VerslagRecord | undefined): { statusLabel: string; statusKleur: string; ctaLabel: string; telefonisch: boolean } {
  if (!lokaal) return { statusLabel: "Nog geen verslag", statusKleur: "bg-grijs-100 text-grijs-600", ctaLabel: "Maak verslag", telefonisch: false };
  if (lokaal.status === "voltooid") return { statusLabel: "Verslag klaar", statusKleur: "bg-green-50 text-green-700", ctaLabel: "Verslag bekijken", telefonisch: false };
  if (lokaal.status === "gedeeltelijk" || lokaal.status === "bevestigd") {
    return { statusLabel: "Wordt afgerond", statusKleur: "bg-amber-50 text-amber-700", ctaLabel: "Verslag afronden", telefonisch: false };
  }
  if (lokaal.bron === "telefoon") return { statusLabel: "Ingesproken", statusKleur: "bg-teal-50 text-teal-700", ctaLabel: "Controleren", telefonisch: true };
  return { statusLabel: "Concept gestart", statusKleur: "bg-amber-50 text-amber-700", ctaLabel: "Verslag afmaken", telefonisch: false };
}

function VandaagKaart({ training, lokaal }: { training: TrainingMetSchool; lokaal: VerslagRecord | undefined }) {
  const { statusLabel, statusKleur, ctaLabel, telefonisch } = verslagStatusEnActie(lokaal);
  return (
    <div className="flex flex-col gap-2 rounded-lg px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-[10rem] flex-1">
        <p className="text-body-sm font-medium text-grijs-900">{training.schoolNaam}</p>
        <p className="text-label text-grijs-600">{training.naam}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-label font-medium ${statusKleur}`}>{statusLabel}</span>
        <Link
          href={`/scholen/${training.schoolId}/trainingen/${training.id}/verslag`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-label font-semibold text-white transition-colors hover:bg-teal-700"
        >
          {telefonisch ? <PhoneIncoming size={12} /> : <Sparkles size={12} />}
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}

function KomendRij({ training }: { training: TrainingMetSchool }) {
  return (
    <Link
      href={`/scholen/${training.schoolId}`}
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 transition-colors hover:bg-grijs-50"
    >
      <div className="min-w-[10rem] flex-1">
        <p className="text-body-sm font-medium text-grijs-900">{training.schoolNaam}</p>
        <p className="text-label text-grijs-600">{training.naam}</p>
      </div>
      <span className="text-body-sm text-grijs-600">{formatKorteDatum(training.datum)}</span>
    </Link>
  );
}

export default async function TrainerDashboardPage() {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const payload = await getPayload({ config });
  const data = await haalDashboardV2Data(payload, trainer);
  const voornaam = trainer.name.split(" ")[0] || trainer.name;

  // Verslagstatus voor ELKE training van vandaag (niet alleen de nog-niet-
  // ingevulde) — de "Vandaag"-kaart toont per training altijd een status,
  // zie VandaagKaart hierboven. Gebatcht, zelfde reden als elders (geen N+1).
  const verslagenPerTraining = await haalVerslagenPerTraining(
    payload,
    trainer,
    data.vandaag.map((t) => t.id)
  );

  return (
    <div className="flex flex-col gap-8">
      {/* 1. Welkom + Aandacht nodig */}
      <div>
        <h1 className="font-display text-h1 font-bold text-donkerblauw">
          {bepaalGroet()}, {voornaam}
        </h1>
      </div>

      {data.aandachtNodig.length > 0 && (
        <section className="rounded-xl border border-teal-200 bg-teal-50/40 shadow-sm">
          <div className="flex items-center gap-2 border-b border-teal-100 px-4 py-3">
            <PhoneIncoming size={16} className="text-teal-700" />
            <h2 className="text-h3 font-semibold text-grijs-900">Aandacht nodig</h2>
          </div>
          <div className="flex flex-col divide-y divide-teal-100 px-1 py-1">
            {data.aandachtNodig.map((item) => (
              <AandachtRij key={`${item.soort}-${item.trainingId}`} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* 2. Vandaag */}
      <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-grijs-100 px-4 py-3">
          <CalendarClock size={16} className="text-grijs-600" />
          <h2 className="text-h3 font-semibold text-grijs-900">Vandaag</h2>
        </div>
        <div className="flex flex-col divide-y divide-grijs-100 px-1 py-1">
          {data.vandaag.length === 0 ? (
            <LegeSectie tekst="Geen trainingen gepland voor vandaag." />
          ) : (
            data.vandaag.map((training) => <VandaagKaart key={training.id} training={training} lokaal={verslagenPerTraining.get(training.id)} />)
          )}
        </div>
      </section>

      {/* 3. Komende trainingen */}
      <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-grijs-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <GraduationCap size={16} className="text-grijs-600" />
            <h2 className="text-h3 font-semibold text-grijs-900">Komende trainingen</h2>
          </div>
          {data.komendTotaal > 0 && (
            <Link href="/trainingen" className="inline-flex items-center gap-1 text-label font-medium text-teal-700 hover:underline">
              Bekijk alle trainingen
              <ArrowRight size={12} />
            </Link>
          )}
        </div>
        <div className="flex flex-col divide-y divide-grijs-100 px-1 py-1">
          {data.komendVolgende.length === 0 ? (
            <LegeSectie tekst="Geen aankomende trainingen gepland." />
          ) : (
            data.komendVolgende.map((training) => <KomendRij key={training.id} training={training} />)
          )}
        </div>
      </section>

      {/* 4. Recente activiteit */}
      <section className="rounded-xl border border-grijs-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-grijs-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <NotebookText size={16} className="text-grijs-600" />
            <h2 className="text-h3 font-semibold text-grijs-900">Recente activiteit</h2>
          </div>
          <Link href="/logboek/nieuw" className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 py-1 text-label font-semibold text-white transition-colors hover:bg-teal-700">
            <Plus size={12} />
            Logboekitem
          </Link>
        </div>
        <div className="flex flex-col divide-y divide-grijs-100 px-1 py-1">
          {data.recenteActiviteit.length === 0 ? (
            <LegeSectie tekst="Nog geen activiteit — trainingsverslagen en logboekitems verschijnen hier." />
          ) : (
            data.recenteActiviteit.map((item, i) => {
              const Icoon = ACTIVITEIT_ICOON[item.soort];
              return (
                <Link key={`${item.href}-${i}`} href={item.href} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-grijs-50">
                  <div className="min-w-[10rem] flex-1">
                    <p className="text-body-sm font-medium text-grijs-900">{item.schoolNaam}</p>
                    <p className="text-label text-grijs-600">{item.titel}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-medium ${ACTIVITEIT_KLEUR[item.soort]}`}>
                      <Icoon size={11} />
                      {ACTIVITEIT_LABEL[item.soort]}
                    </span>
                    <span className="text-label text-grijs-500">{formatKorteDatum(item.wanneer)}</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>

      {/* 5. Statistieken — bewust klein/onderaan, secundair (opdrachtseis) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-grijs-200 bg-white p-3 text-center">
          <p className="text-h3 font-bold text-grijs-900">{data.statistieken.totaalTrainingen}</p>
          <p className="mt-0.5 text-label text-grijs-500">Trainingen</p>
        </div>
        <Link href="/scholen" className="rounded-lg border border-grijs-200 bg-white p-3 text-center transition-colors hover:border-teal-200 hover:bg-teal-50/40">
          <p className="text-h3 font-bold text-grijs-900">{data.statistieken.aantalScholen}</p>
          <p className="mt-0.5 flex items-center justify-center gap-1 text-label text-grijs-500">
            <School size={11} />
            Scholen
          </p>
        </Link>
        <div className="rounded-lg border border-grijs-200 bg-white p-3 text-center">
          <p className="text-h3 font-bold text-grijs-900">{data.statistieken.verslagenAfgerond}</p>
          <p className="mt-0.5 text-label text-grijs-500">Verslagen afgerond</p>
        </div>
      </div>

      {/* Ronde 2 afronding, Trainer-AI (2026-08-19) — expliciet ONDER de
          operationele secties, nooit ervoor: het Vraag-blok mag de
          operationele aandachtspunten nooit verdringen (opdrachtseis,
          ongewijzigd overgenomen uit V1). */}
      <TrainerVraagBlok soort="dashboard" scholen={data.bevestigdeScholen} />
    </div>
  );
}
