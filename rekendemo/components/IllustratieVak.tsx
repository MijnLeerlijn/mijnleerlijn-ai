"use client";

import type { IllustratieState } from "@/lib/client/useIllustraties";

const KADER = "mt-3 w-full max-w-md overflow-hidden rounded-2xl border border-line bg-canvas";
const PLAATSHOUDER =
  "flex aspect-[3/2] w-full items-center justify-center px-6 text-center text-sm";

type IllustratieVakProps = {
  state: IllustratieState | undefined;
  beschrijving: string | null;
};

/** Toont de tekening bij een verhaalsom, of wat er in plaats daarvan te melden is. */
export function IllustratieVak({ state, beschrijving }: IllustratieVakProps) {
  const status = state?.status ?? "idle";

  if (status === "ready" && state?.dataUrl) {
    return (
      <figure className={KADER}>
        {/* Data-URL: next/image voegt hier niets toe en zou de export bemoeilijken. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.dataUrl}
          alt={beschrijving ?? "Tekening bij de opgave"}
          className="block w-full"
        />
      </figure>
    );
  }

  if (status === "exact-count") {
    return (
      <div className={`${KADER} border-dashed`}>
        <p className={`${PLAATSHOUDER} text-ink-muted`}>
          Exacte rekentekening volgt in volgende fase
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={`${KADER} border-dashed`}>
        <p className={`${PLAATSHOUDER} text-ink-muted/80`}>
          Tekening kon niet worden gemaakt
        </p>
      </div>
    );
  }

  return (
    <div className={`${KADER} animate-pulse`} aria-busy="true">
      <p className={`${PLAATSHOUDER} text-ink-muted`}>Tekening wordt gemaakt…</p>
    </div>
  );
}
