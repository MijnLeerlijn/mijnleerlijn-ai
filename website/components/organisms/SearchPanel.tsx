"use client";

import { useEffect, useState } from "react";
import Link from "@/components/atoms/Link";
import Chip from "@/components/atoms/Chip";
import SearchInput from "@/components/molecules/SearchInput";
import AnswerPanel from "@/components/organisms/AnswerPanel";
import NoAnswerState from "@/components/organisms/NoAnswerState";
import ErrorMessage from "@/components/molecules/ErrorMessage";
import { simuleerZoekopdracht, type ZoekResultaat } from "@/lib/search/simulate";
import { voorbeeldvragen } from "@/lib/data/popular-questions";
import { formatDatumNL } from "@/lib/format/date";

type Status = "stil" | "laden" | "resultaat";

interface SearchPanelProps {
  /** Vult het veld direct en start de simulatie — gebruikt door /zoeken (?q=…). */
  initieleVraag?: string;
  /** Laat Hero de rest van de sectie (welkomsttekst, tagline) inschikken zodra er een resultaat getoond wordt. */
  onStatusChange?: (status: "stil" | "laden" | "resultaat") => void;
}

// Zoekveld + voorbeeldvragen + het resulterende antwoord/geen-antwoord — de
// in-place antwoordervaring uit docs/HOMEPAGE-SPEC.md. Draait op de lokale
// zoeksimulatie (lib/search/simulate.ts): geen echte zoekmachine, wel een
// echte invoer → laden → resultaat-cyclus.
export default function SearchPanel({ initieleVraag, onStatusChange }: SearchPanelProps) {
  const [status, setStatus] = useState<Status>(initieleVraag ? "laden" : "stil");
  const [vraag, setVraag] = useState(initieleVraag ?? "");
  const [resultaat, setResultaat] = useState<ZoekResultaat | null>(null);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    if (status !== "laden") return;
    const timer = setTimeout(() => {
      setResultaat(simuleerZoekopdracht(vraag));
      setStatus("resultaat");
    }, 550);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vraag verandert alleen via zoek(), niet tijdens het laden
  }, [status]);

  function zoek(waarde: string) {
    if (!waarde.trim()) return;
    setVraag(waarde);
    setResultaat(null);
    setStatus("laden");
  }

  function nieuweVraag() {
    setVraag("");
    setResultaat(null);
    setStatus("stil");
  }

  const loading = status === "laden";

  return (
    <div className="mt-8">
      <SearchInput
        placeholder="Bijvoorbeeld: hoe koppel ik een doelenset aan een groep?"
        defaultValue={vraag}
        loading={loading}
        onSubmit={zoek}
      />

      {status === "stil" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {voorbeeldvragen.map((v) => (
            <Chip key={v} onDark onClick={() => zoek(v)}>
              {v}
            </Chip>
          ))}
        </div>
      )}

      {status === "resultaat" && resultaat && (
        <>
          {resultaat.type === "fout" && (
            <div className="mt-6 max-w-[560px] rounded-xl bg-white p-2 shadow-lg">
              <ErrorMessage
                beschrijving="Zoeken lukt nu niet. Probeer het opnieuw, of stel je vraag via het contactformulier."
                onRetry={() => zoek(vraag)}
              />
            </div>
          )}
          {resultaat.type === "geen-antwoord" && (
            <NoAnswerState
              gerelateerd={resultaat.gerelateerd}
              contactHref={`/contact?onderwerp=${encodeURIComponent(resultaat.vraag)}`}
            />
          )}
          {resultaat.type === "antwoord" && (
            <AnswerPanel
              tekst={resultaat.antwoord}
              bronnen={resultaat.bronnen.map((b) => ({
                titel: b.titel,
                sectie: b.sectie,
                datum: formatDatumNL(b.datum),
                href: `/artikel/${b.artikelSlug}`,
              }))}
              suggesties={resultaat.suggesties}
              vraag={resultaat.vraag}
            />
          )}
          <button
            type="button"
            onClick={nieuweVraag}
            className="mt-4 text-sm text-white/70 underline decoration-white/40 underline-offset-2 hover:text-white"
          >
            Stel een nieuwe vraag
          </button>
        </>
      )}

      {status === "stil" && (
        <Link href="#ontdek" onDark underline="always" className="mt-6 inline-block">
          Of ontdek een onderwerp
        </Link>
      )}
    </div>
  );
}
