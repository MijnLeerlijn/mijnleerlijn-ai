"use client";

import { useEffect, useMemo, useState } from "react";
import type { WerkbladResultaat } from "@/lib/resultaat";
import type { WerkbladInstellingen } from "@/lib/werkblad";
import {
  vraagIllustratieAan,
  type Illustratie,
  type IllustratieVerzoekBody,
} from "./illustratieApi";

export type IllustratieStatus = "idle" | "loading" | "ready" | "error" | "exact-count";

export type IllustratieState = {
  status: IllustratieStatus;
  dataUrl?: string;
  prompt?: string;
};

export type IllustratieMap = Record<string, IllustratieState>;

/** Hoeveel tekeningen we tegelijk laten maken; laag genoeg voor rate limits. */
const MAX_PARALLEL = 2;

/**
 * Sessiecache op de inhoud van het verzoek. Zo maakt een re-render, een
 * remount of een tweede effect-run (React StrictMode in development) nooit een
 * tweede API-call voor dezelfde tekening. De cache leeft alleen in het geheugen
 * van deze pagina: verversen betekent opnieuw genereren.
 */
const CACHE = new Map<string, Promise<Illustratie>>();

function cacheSleutel(body: IllustratieVerzoekBody): string {
  return JSON.stringify([
    body.eiland,
    body.leerjaar,
    body.illustrationDescription,
    body.tekenwens,
  ]);
}

function haalIllustratie(body: IllustratieVerzoekBody): Promise<Illustratie> {
  const sleutel = cacheSleutel(body);
  const bestaand = CACHE.get(sleutel);
  if (bestaand) return bestaand;

  const belofte = vraagIllustratieAan(body).catch((fout) => {
    // Mislukte pogingen niet bewaren, anders blijft de fout aan het werkblad plakken.
    CACHE.delete(sleutel);
    throw fout;
  });

  CACHE.set(sleutel, belofte);
  return belofte;
}

/**
 * Maakt tekeningen bij de verhaalsommen van één werkblad. Het werkblad is al
 * zichtbaar terwijl dit loopt; een mislukte tekening raakt alleen die ene opgave.
 */
/** Beginstatus per opgave, puur afgeleid van het werkblad. */
function bouwBegintoestand(resultaat: WerkbladResultaat | null): IllustratieMap {
  const begintoestand: IllustratieMap = {};
  if (!resultaat) return begintoestand;

  for (const opgave of resultaat.opgaven) {
    if (opgave.type !== "verhaal" || !opgave.illustrationDescription) continue;
    // Telplaatjes bouwen we later programmatisch op; geen beeldmodel.
    begintoestand[opgave.id] =
      opgave.illustrationType === "exact-count"
        ? { status: "exact-count" }
        : { status: "idle" };
  }

  return begintoestand;
}

/**
 * Maakt tekeningen bij de verhaalsommen van één werkblad. Het werkblad is al
 * zichtbaar terwijl dit loopt; een mislukte tekening raakt alleen die ene opgave.
 */
export function useIllustraties(
  resultaat: WerkbladResultaat | null,
  instellingen: WerkbladInstellingen,
): IllustratieMap {
  const { eiland, leerjaar, tekenwens } = instellingen;
  const begintoestand = useMemo(() => bouwBegintoestand(resultaat), [resultaat]);
  // De voortgang hoort bij één werkblad; bij een nieuw werkblad tellen oude
  // statussen niet meer mee.
  const [voortgang, setVoortgang] = useState<{
    werkblad: WerkbladResultaat | null;
    map: IllustratieMap;
  }>({ werkblad: null, map: {} });

  useEffect(() => {
    if (!resultaat) return;

    const wachtrij = resultaat.opgaven
      .filter(
        (opgave) =>
          opgave.type === "verhaal" &&
          opgave.illustrationType === "context" &&
          opgave.illustrationDescription,
      )
      .map((opgave) => ({
        id: opgave.id,
        beschrijving: opgave.illustrationDescription as string,
      }));

    let actief = true;

    const zet = (id: string, state: IllustratieState) => {
      if (!actief) return;
      setVoortgang((huidig) =>
        huidig.werkblad === resultaat
          ? { werkblad: resultaat, map: { ...huidig.map, [id]: state } }
          : { werkblad: resultaat, map: { [id]: state } },
      );
    };

    async function werker() {
      while (actief) {
        const taak = wachtrij.shift();
        if (!taak) return;

        zet(taak.id, { status: "loading" });

        try {
          const illustratie = await haalIllustratie({
            eiland,
            leerjaar,
            illustrationDescription: taak.beschrijving,
            tekenwens,
          });
          zet(taak.id, {
            status: "ready",
            dataUrl: illustratie.dataUrl,
            prompt: illustratie.prompt,
          });
        } catch {
          zet(taak.id, { status: "error" });
        }
      }
    }

    void Promise.all(Array.from({ length: MAX_PARALLEL }, () => werker()));

    return () => {
      actief = false;
    };
  }, [resultaat, eiland, leerjaar, tekenwens]);

  return voortgang.werkblad === resultaat
    ? { ...begintoestand, ...voortgang.map }
    : begintoestand;
}
