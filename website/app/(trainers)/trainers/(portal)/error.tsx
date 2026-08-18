"use client";

import { TriangleAlert } from "lucide-react";

// Error boundary voor alle portalpagina's (Dashboard/Mijn scholen/
// Schooldetail/Profiel) — vangt o.a. een onbereikbare Monday-API op (elke
// pagina in deze route-groep haalt live Monday-data op, zie lib/trainers/
// monday-links.ts). Zonder dit bestand toont Next.js hier zijn kale,
// technische standaard-foutpagina — dit vervangt die door een rustige,
// merkherkenbare melding, in lijn met "nooit een kapot schooldossier tonen"
// (architectuurrapport §11) nu ook toegepast op een volledige Monday-storing,
// niet alleen op een ontbrekende relatie. `unstable_retry` (Next.js 16.2+,
// node_modules/next/dist/docs/.../error.md) i.p.v. het oudere `reset` —
// probeert de route opnieuw te renderen zonder een volledige paginaherlaad.
export default function TrainerPortalError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-grijs-200 bg-white px-4 py-16 text-center shadow-sm">
      <TriangleAlert size={28} className="text-amber-600" />
      <h1 className="font-display text-h2 font-bold text-donkerblauw">Er ging iets mis</h1>
      <p className="max-w-sm text-body-sm text-grijs-600">
        De gegevens konden niet worden opgehaald. Dit kan komen door een tijdelijk probleem met de verbinding. Probeer
        het opnieuw.
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mt-2 rounded-lg bg-teal-600 px-4 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-teal-700"
      >
        Probeer opnieuw
      </button>
    </div>
  );
}
