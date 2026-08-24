import type { ReactNode } from "react";

type VeldProps = {
  id: string;
  label: string;
  hint?: string;
  verplicht?: boolean;
  fout?: string;
  children: ReactNode;
};

/** Veldwikkel voor één invoerelement (label gekoppeld via htmlFor/id). */
export function Veld({ id, label, hint, verplicht, fout, children }: VeldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
        {verplicht ? <span className="ml-1 text-ink-muted">*</span> : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {fout ? (
        <p id={`${id}-fout`} role="alert" className="text-sm font-medium text-red-600">
          {fout}
        </p>
      ) : null}
    </div>
  );
}

type VeldGroepProps = {
  label: string;
  hint?: string;
  children: ReactNode;
};

/** Veldwikkel voor een groep keuzeknoppen (fieldset/legend). */
export function VeldGroep({ label, hint, children }: VeldGroepProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      {hint ? <p className="text-sm text-ink-muted">{hint}</p> : null}
      <div className="pt-1">{children}</div>
    </fieldset>
  );
}
