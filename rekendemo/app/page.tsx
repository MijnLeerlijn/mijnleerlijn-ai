"use client";

import { useState } from "react";
import { WerkbladFormulier } from "@/components/WerkbladFormulier";
import { WerkbladPreview } from "@/components/WerkbladPreview";
import { ALGEMENE_FOUTMELDING, vraagWerkbladAan } from "@/lib/client/werkbladApi";
import type { WerkbladResultaat } from "@/lib/resultaat";
import { STANDAARD_INSTELLINGEN, type WerkbladInstellingen } from "@/lib/werkblad";

type Status = "formulier" | "bezig" | "resultaat";

export default function WerkbladMakenPagina() {
  const [instellingen, setInstellingen] = useState<WerkbladInstellingen>(
    STANDAARD_INSTELLINGEN,
  );
  const [status, setStatus] = useState<Status>("formulier");
  const [resultaat, setResultaat] = useState<WerkbladResultaat | null>(null);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  function wijzig(wijziging: Partial<WerkbladInstellingen>) {
    setInstellingen((huidig) => ({ ...huidig, ...wijziging }));
  }

  // Het formulier is langer dan één scherm; zonder scroll naar boven zou de
  // preview onder de vouw beginnen.
  function scrollNaarBoven() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function genereer() {
    if (status === "bezig") return;

    setStatus("bezig");
    setFoutmelding(null);

    try {
      const nieuwResultaat = await vraagWerkbladAan(instellingen);
      setResultaat(nieuwResultaat);
      setStatus("resultaat");
      scrollNaarBoven();
    } catch (fout) {
      setFoutmelding(fout instanceof Error ? fout.message : ALGEMENE_FOUTMELDING);
      setStatus("formulier");
    }
  }

  function terugNaarFormulier() {
    setStatus("formulier");
    scrollNaarBoven();
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="mb-10 sm:mb-12">
        <p className="text-sm font-semibold tracking-wide text-accent uppercase">
          Werkblad maken
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-ink sm:text-4xl">
          Maak rekenmateriaal dat past bij jouw leerlingen
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-muted">
          Van leerdoel naar lokaal passend oefenmateriaal voor Aruba en Curaçao.
        </p>
      </header>

      {status === "resultaat" && resultaat ? (
        <WerkbladPreview
          resultaat={resultaat}
          instellingen={instellingen}
          onTerug={terugNaarFormulier}
        />
      ) : (
        <WerkbladFormulier
          waarden={instellingen}
          onWijzig={wijzig}
          onVerstuur={genereer}
          bezig={status === "bezig"}
          foutmelding={foutmelding}
        />
      )}
    </main>
  );
}
