"use client";

type ToggleProps = {
  id: string;
  label: string;
  hint?: string;
  aan: boolean;
  onChange: (aan: boolean) => void;
};

export function Toggle({ id, label, hint, aan, onChange }: ToggleProps) {
  return (
    <div className="flex items-start justify-between gap-6 rounded-2xl border border-line bg-white px-4 py-4">
      <div>
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="mt-1 text-sm text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={aan}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onClick={() => onChange(!aan)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
          aan ? "bg-accent" : "bg-line"
        }`}
      >
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            aan ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
