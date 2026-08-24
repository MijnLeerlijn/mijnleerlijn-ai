"use client";

import { Knop } from "./ui/Knop";
import {
  bevatTekeningen,
  eilandLabel,
  leerjaarLabel,
  opgaveTypeLabel,
  taalLabel,
  type WerkbladInstellingen,
} from "@/lib/werkblad";

type WerkbladPreviewProps = {
  instellingen: WerkbladInstellingen;
  onTerug: () => void;
};

export function WerkbladPreview({ instellingen, onTerug }: WerkbladPreviewProps) {
  const regels: { label: string; waarde: string }[] = [
    { label: "Eiland", waarde: eilandLabel(instellingen.eiland) },
    { label: "Taal", waarde: taalLabel(instellingen.eiland, instellingen.taal) },
    { label: "Rekendoel", waarde: instellingen.rekendoel.trim() },
    { label: "Leerjaar", waarde: leerjaarLabel(instellingen.leerjaar) },
    { label: "Type opgaven", waarde: opgaveTypeLabel(instellingen.opgaveType) },
    { label: "Aantal opgaven", waarde: String(instellingen.aantalOpgaven) },
    {
      label: "Tekeningen",
      waarde: bevatTekeningen(instellingen.opgaveType)
        ? "Automatisch bij verhaalsommen"
        : "Niet van toepassing bij kale sommen",
    },
    {
      label: "Extra tekenwens",
      waarde:
        instellingen.tekenwens.trim().length > 0
          ? instellingen.tekenwens.trim()
          : "Geen — wij kiezen zelf een passende situatie",
    },
    { label: "Antwoordenblad", waarde: instellingen.antwoordenblad ? "Ja" : "Nee" },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-card border border-line bg-white/80 p-6 shadow-sm sm:p-8">
        <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Jouw werkblad
        </h2>
        <p className="mt-2 text-ink-muted">
          Dit zijn de keuzes die we gebruiken om het materiaal samen te stellen.
        </p>

        <dl className="mt-6 divide-y divide-line border-t border-line">
          {regels.map((regel) => (
            <div
              key={regel.label}
              className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr] sm:gap-6"
            >
              <dt className="text-sm font-semibold text-ink-muted">{regel.label}</dt>
              <dd className="text-base whitespace-pre-line text-ink">{regel.waarde}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-card border border-dashed border-accent/40 bg-accent-soft/60 p-6 sm:p-8">
        <h3 className="text-lg font-semibold text-ink">
          Genereren volgt in een volgende fase
        </h3>
        <p className="mt-2 max-w-2xl text-ink-muted">
          In deze demo tonen we alleen je keuzes. Het automatisch genereren van de
          opgaven, de bijbehorende tekeningen en het werkblad als PDF wordt in een
          volgende fase toegevoegd.
        </p>
      </section>

      <Knop type="button" variant="secundair" onClick={onTerug}>
        Keuzes aanpassen
      </Knop>
    </div>
  );
}
