"use client";

import { useEffect, useId, useState } from "react";
import { CalendarPlus, Loader2, Trash2 } from "lucide-react";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import { usePopover } from "./use-popover";
import { SchrijfFeedback, type WriteBackResultaat } from "./schrijf-feedback";

const AUTOSLUIT_NA_SUCCES_MS = 1400;

/**
 * Traineromgeving V1, Ronde 2 vervolg (2026-08-19) — vervangt de datumkeuze
 * uit de grote modal. Klik op de datum (of "Datum plannen" als er nog geen
 * datum is) -> compacte popover met een native datumkiezer. Een datum
 * kiezen/wijzigen zet server-side altijd automatisch de status op Gepland
 * (writeback.ts se bepaalAutomatischeStatusBijDatumwijziging — dit is de
 * daadwerkelijke afdwinging; hier alleen de vóóraf zichtbare aankondiging,
 * opdrachtseis). Verwijderen is bewust een kleine, secundaire actie, nooit
 * een even grote knop als "een datum kiezen".
 */
export function DatumPopover({
  huidigeDatum,
  bezig,
  resultaat,
  fout,
  onKiezen,
  onVerwijderen,
  onOpnieuwProberen,
  onGesloten,
}: {
  huidigeDatum: string | null;
  bezig: boolean;
  resultaat: WriteBackResultaat | null;
  fout: string | null;
  onKiezen: (nieuweDatum: string) => void;
  onVerwijderen: () => void;
  onOpnieuwProberen: (record: "trainerboard" | "centraal") => void;
  onGesloten: () => void;
}) {
  const { open, toggle, close, triggerRef, panelRef, positie } = usePopover();
  const [toontFeedback, setToontFeedback] = useState(false);
  const [invoer, setInvoer] = useState(huidigeDatum ?? "");
  // Schooldetail rendert meerdere DatumPopover-instanties tegelijk (één per
  // trainingsrij) — een statische id zou een dubbel DOM-id opleveren
  // (ongeldige HTML, en <label htmlFor> zou via getElementById altijd naar
  // de EERSTE rij wijzen i.p.v. de eigen input).
  const invoerId = useId();

  // "Aanpassen tijdens render"-patroon (react.dev/reference/react/useState
  // #storing-information-from-previous-renders) i.p.v. een effect die
  // synchroon setState aanroept, voor zowel invoer (heropenen/huidigeDatum-
  // wijziging) als toontFeedback (nu ook op "bezig" — voorheen zette alleen
  // resultaat/fout dit aan, dus de datumkiezer bleef tijdens een lopend
  // verzoek zichtbaar i.p.v. de "Bezig met opslaan…"-tekst).
  const [vorigeInvoerSleutel, setVorigeInvoerSleutel] = useState({ open, huidigeDatum });
  if (vorigeInvoerSleutel.open !== open || vorigeInvoerSleutel.huidigeDatum !== huidigeDatum) {
    setVorigeInvoerSleutel({ open, huidigeDatum });
    if (open) setInvoer(huidigeDatum ?? "");
  }

  // Bij het sluiten van de popover herstelt de ouder (onGesloten)
  // bezig/resultaat/fout altijd naar de lege staat, dus dezelfde
  // vergelijking dekt ook het weer-verbergen bij het sluiten — geen aparte,
  // op "open" gesleutelde reset nodig.
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
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-body-sm font-medium transition-colors hover:bg-grijs-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-donkerblauw ${
          huidigeDatum ? "text-grijs-900" : "text-teal-700"
        }`}
      >
        {huidigeDatum ? (
          formatKorteDatum(huidigeDatum)
        ) : (
          <>
            <CalendarPlus size={14} />
            Datum plannen
          </>
        )}
      </button>

      <div
        ref={panelRef}
        popover="auto"
        style={positie ? { position: "fixed", top: positie.top, left: positie.left, margin: 0 } : { position: "fixed" }}
        className="w-64 rounded-xl border border-grijs-200 bg-white p-2.5 shadow-lg"
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
              <button type="button" onClick={() => setToontFeedback(false)} className="self-start text-label font-medium text-teal-700 hover:underline">
                Andere datum kiezen
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor={invoerId} className="text-label font-medium uppercase tracking-wide text-grijs-500">
              {huidigeDatum ? "Datum wijzigen" : "Datum plannen"}
            </label>
            <input
              id={invoerId}
              type="date"
              autoFocus
              value={invoer}
              disabled={bezig}
              onChange={(e) => {
                setInvoer(e.target.value);
                if (e.target.value) onKiezen(e.target.value);
              }}
              className="rounded-lg border border-grijs-300 px-2.5 py-1.5 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
            />
            <p className="text-label text-grijs-500">Een datum kiezen zet de status automatisch op Gepland.</p>
            {huidigeDatum && (
              <button
                type="button"
                disabled={bezig}
                onClick={onVerwijderen}
                className="mt-0.5 inline-flex items-center gap-1 self-start text-label font-medium text-grijs-500 hover:text-red-700 disabled:opacity-40"
              >
                <Trash2 size={12} />
                Datum verwijderen
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
