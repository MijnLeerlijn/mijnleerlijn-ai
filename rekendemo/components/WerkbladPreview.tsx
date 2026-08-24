"use client";

import { Knop } from "./ui/Knop";
import type { Opgave, WerkbladResultaat } from "@/lib/resultaat";
import { eilandLabel, leerjaarLabel, type WerkbladInstellingen } from "@/lib/werkblad";

const ONTWIKKELMODUS = process.env.NODE_ENV !== "production";

type WerkbladPreviewProps = {
  resultaat: WerkbladResultaat;
  instellingen: WerkbladInstellingen;
  onTerug: () => void;
};

export function WerkbladPreview({
  resultaat,
  instellingen,
  onTerug,
}: WerkbladPreviewProps) {
  const kenmerken = [
    { label: "Eiland", waarde: eilandLabel(resultaat.eiland) },
    { label: "Taal", waarde: resultaat.taal },
    { label: "Leerjaar", waarde: leerjaarLabel(instellingen.leerjaar) },
    { label: "Opgaven", waarde: String(resultaat.opgaven.length) },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-card border border-line bg-white/80 p-6 shadow-sm sm:p-8">
        <h2 className="text-sm font-semibold tracking-wide text-accent uppercase">
          Jouw werkblad
        </h2>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {resultaat.titel}
        </p>
        <p className="mt-2 text-ink-muted">{resultaat.doel}</p>

        <dl className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-4">
          {kenmerken.map((kenmerk) => (
            <div key={kenmerk.label}>
              <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {kenmerk.label}
              </dt>
              <dd className="mt-1 text-base text-ink">{kenmerk.waarde}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-card border border-line bg-white/80 p-6 shadow-sm sm:p-8">
        <ol className="divide-y divide-line">
          {resultaat.opgaven.map((opgave, index) => (
            <li key={opgave.id} className="py-6 first:pt-0 last:pb-0">
              <OpgaveWeergave opgave={opgave} nummer={index + 1} />
            </li>
          ))}
        </ol>
      </section>

      {instellingen.antwoordenblad ? (
        <section className="rounded-card border border-line bg-white/80 p-6 shadow-sm sm:p-8">
          <h3 className="text-lg font-semibold text-ink">Antwoorden</h3>
          <ol className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {resultaat.opgaven.map((opgave, index) => (
              <li key={opgave.id} className="flex gap-3 text-ink">
                <span className="w-6 shrink-0 text-ink-muted tabular-nums">
                  {index + 1}.
                </span>
                <span className="font-medium">{opgave.antwoord}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {ONTWIKKELMODUS ? <TechnischeDetails opgaven={resultaat.opgaven} /> : null}

      <Knop type="button" variant="secundair" onClick={onTerug}>
        Nieuw werkblad maken
      </Knop>
    </div>
  );
}

function OpgaveWeergave({ opgave, nummer }: { opgave: Opgave; nummer: number }) {
  return (
    <div className="flex gap-4">
      <span className="w-7 shrink-0 pt-0.5 text-base font-semibold text-ink-muted tabular-nums">
        {nummer}.
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base leading-relaxed text-ink">
          {opgave.vraag}
          {opgave.type === "kaal" ? (
            <span className="ml-2 text-ink-muted">______</span>
          ) : null}
        </p>

        {opgave.type === "verhaal" ? (
          <div className="mt-3 rounded-2xl border border-dashed border-line bg-canvas px-4 py-5">
            <p className="text-sm text-ink-muted">
              Tekening wordt in de volgende fase toegevoegd
            </p>
            {opgave.illustrationDescription ? (
              <p className="mt-2 text-sm text-ink-muted/80 italic">
                {opgave.illustrationDescription}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Alleen in development: laat zien wat de AI precies bedacht heeft. */
function TechnischeDetails({ opgaven }: { opgaven: Opgave[] }) {
  return (
    <details className="rounded-card border border-line bg-white/60 px-6 py-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink-muted">
        Technische details (alleen in development)
      </summary>
      <ul className="mt-4 space-y-4">
        {opgaven.map((opgave, index) => (
          <li key={opgave.id} className="text-sm text-ink-muted">
            <p className="font-semibold text-ink">
              {index + 1}. {opgave.id} — {opgave.type}
            </p>
            <p>berekening: {opgave.berekening ?? "—"}</p>
            <p>context: {opgave.context ?? "—"}</p>
            <p>illustrationDescription: {opgave.illustrationDescription ?? "—"}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
