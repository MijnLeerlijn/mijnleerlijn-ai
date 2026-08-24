"use client";

import type { Keuze } from "./KeuzeKaarten";

type SegmentKeuzeProps<T extends string | number> = {
  naam: string;
  opties: Keuze<T>[];
  waarde: T;
  onChange: (waarde: T) => void;
};

/** Compacte segmented buttons voor korte keuzelijsten (taal, aantal opgaven). */
export function SegmentKeuze<T extends string | number>({
  naam,
  opties,
  waarde,
  onChange,
}: SegmentKeuzeProps<T>) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-white p-1">
      {opties.map((optie) => (
        <label key={String(optie.id)} className="cursor-pointer">
          <input
            type="radio"
            name={naam}
            value={String(optie.id)}
            checked={waarde === optie.id}
            onChange={() => onChange(optie.id)}
            className="peer sr-only"
          />
          <span className="block rounded-full px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink peer-checked:bg-accent peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
            {optie.label}
          </span>
        </label>
      ))}
    </div>
  );
}
