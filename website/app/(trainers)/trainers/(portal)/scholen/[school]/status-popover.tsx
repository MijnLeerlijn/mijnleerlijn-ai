"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { TrainingStatus } from "@/lib/trainers/monday-links";
import { TRAINING_STATUS_LABEL, TRAINING_STATUS_BADGE, TRAINING_STATUS_SOLID, TRAINING_STATUS_SELECTED_RING } from "@/lib/trainers/status-styles";
import { usePopover } from "./use-popover";
import { SchrijfFeedback, type WriteBackResultaat } from "./schrijf-feedback";

const STATUSSEN: readonly TrainingStatus[] = ["open", "gepland", "gedaan", "geannuleerd"];

// Hoelang de popover na een volledig geslaagde schrijving nog even de
// bevestiging toont vóór hij zelf sluit — lang genoeg om te lezen, kort
// genoeg om niet in de weg te zitten ("compacte ... success-feedback").
const AUTOSLUIT_NA_SUCCES_MS = 1400;

/**
 * Traineromgeving V1, Ronde 2 vervolg (2026-08-19) — vervangt de statuskeuze
 * uit de grote modal. Klik op de statusbadge -> compacte popover met 4
 * grote gekleurde keuzes (Monday-stijl bediening, eigen MijnLeerlijn-
 * uitstraling: zelfde kleuren/afronding als de rest van de portal, geen
 * pixel-perfecte kopie). Kleur is nooit de enige betekenisdrager — de
 * statustekst blijft altijd zichtbaar, zowel op de trigger als op elke
 * keuze in de popover.
 */
export function StatusPopover({
  huidigeStatus,
  bezig,
  resultaat,
  fout,
  onKiezen,
  onOpnieuwProberen,
  onGesloten,
}: {
  huidigeStatus: TrainingStatus;
  bezig: boolean;
  resultaat: WriteBackResultaat | null;
  fout: string | null;
  onKiezen: (status: TrainingStatus) => void;
  onOpnieuwProberen: (record: "trainerboard" | "centraal") => void;
  onGesloten: () => void;
}) {
  const { open, toggle, close, triggerRef, panelRef, positie } = usePopover();
  const [toontFeedback, setToontFeedback] = useState(false);

  // "Aanpassen tijdens render"-patroon (react.dev/reference/react/useState
  // #storing-information-from-previous-renders) i.p.v. een effect die
  // synchroon setState aanroept — voorkomt een overbodige extra renderronde
  // én dekt nu ook "bezig" (voorheen zette alleen resultaat/fout dit aan, dus
  // de 4-keuzepicker bleef tijdens een lopend verzoek zichtbaar i.p.v. de
  // "Bezig met opslaan…"-tekst). Bij het sluiten van de popover herstelt de
  // ouder (onGesloten) bezig/resultaat/fout altijd naar de lege staat, dus
  // dezelfde vergelijking dekt ook het weer-verbergen bij het sluiten — geen
  // aparte, op "open" gesleutelde reset nodig.
  const [vorigSignaal, setVorigSignaal] = useState({ bezig, resultaat, fout });
  if (vorigSignaal.bezig !== bezig || vorigSignaal.resultaat !== resultaat || vorigSignaal.fout !== fout) {
    setVorigSignaal({ bezig, resultaat, fout });
    setToontFeedback(bezig || resultaat !== null || fout !== null);
  }

  useEffect(() => {
    if (resultaat?.algeheleStatus !== "volledig_geslaagd") return;
    const timer = setTimeout(close, AUTOSLUIT_NA_SUCCES_MS);
    return () => clearTimeout(timer);
  }, [resultaat, close]);

  useEffect(() => {
    if (!open) onGesloten();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        className={`rounded-full px-2.5 py-1 text-label font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-donkerblauw ${TRAINING_STATUS_BADGE[huidigeStatus]}`}
      >
        {TRAINING_STATUS_LABEL[huidigeStatus]}
      </button>

      <div
        ref={panelRef}
        popover="auto"
        style={positie ? { position: "fixed", top: positie.top, left: positie.left, margin: 0 } : { position: "fixed" }}
        className="w-60 rounded-xl border border-grijs-200 bg-white p-2.5 shadow-lg"
      >
        {toontFeedback ? (
          <div className="flex flex-col gap-2">
            {bezig ? (
              <p className="flex items-center gap-2 px-1 py-1 text-label font-medium text-grijs-600">
                <Loader2 size={14} className="animate-spin" />
                Bezig met opslaan…
              </p>
            ) : fout ? (
              <p role="alert" className="rounded-md bg-red-50 px-2 py-1.5 text-label text-red-700">
                {fout}
              </p>
            ) : resultaat ? (
              <SchrijfFeedback resultaat={resultaat} onOpnieuwProberen={onOpnieuwProberen} bezigMetOpnieuwProberen={bezig} />
            ) : null}
            {!bezig && (
              <button
                type="button"
                onClick={() => setToontFeedback(false)}
                className="self-start text-label font-medium text-teal-700 hover:underline"
              >
                Andere status kiezen
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="px-1 pb-1.5 text-label font-medium uppercase tracking-wide text-grijs-500">Status kiezen</p>
            <div className="flex flex-col gap-1.5">
              {STATUSSEN.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => onKiezen(status)}
                  disabled={bezig}
                  className={`rounded-lg px-3 py-2.5 text-left text-body-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-donkerblauw disabled:cursor-wait disabled:opacity-60 ${TRAINING_STATUS_SOLID[status]} ${
                    status === huidigeStatus ? TRAINING_STATUS_SELECTED_RING[status] : ""
                  }`}
                >
                  {TRAINING_STATUS_LABEL[status]}
                  {status === huidigeStatus && <span className="ml-1.5 font-normal text-white/80">(huidig)</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
