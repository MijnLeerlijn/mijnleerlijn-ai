"use client";

export type Keuze<T extends string | number> = {
  id: T;
  label: string;
  beschrijving?: string;
};

type KeuzeKaartenProps<T extends string | number> = {
  naam: string;
  opties: Keuze<T>[];
  waarde: T;
  onChange: (waarde: T) => void;
  kolommen?: 2 | 3;
};

/** Selecteerbare kaarten; gebouwd op native radio-inputs voor toetsenbord en screenreaders. */
export function KeuzeKaarten<T extends string | number>({
  naam,
  opties,
  waarde,
  onChange,
  kolommen = 2,
}: KeuzeKaartenProps<T>) {
  return (
    <div
      className={`grid gap-3 ${kolommen === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
    >
      {opties.map((optie) => (
        <label key={String(optie.id)} className="block cursor-pointer">
          <input
            type="radio"
            name={naam}
            value={String(optie.id)}
            checked={waarde === optie.id}
            onChange={() => onChange(optie.id)}
            className="peer sr-only"
          />
          <span
            className="flex h-full flex-col justify-center rounded-2xl border border-line bg-white px-4 py-3.5 transition-colors hover:border-accent/50 peer-checked:border-accent peer-checked:bg-accent-soft peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
          >
            <span className="text-sm font-semibold text-ink">{optie.label}</span>
            {optie.beschrijving ? (
              <span className="mt-0.5 text-sm text-ink-muted">{optie.beschrijving}</span>
            ) : null}
          </span>
        </label>
      ))}
    </div>
  );
}
