"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium tracking-[0.04em] text-grijs-400 uppercase">Fout</p>
      <h1 className="text-h2 font-semibold text-grijs-900">Er ging iets mis</h1>
      <button onClick={() => reset()} className="text-sm text-blauw hover:underline">
        Probeer opnieuw
      </button>
    </div>
  );
}
