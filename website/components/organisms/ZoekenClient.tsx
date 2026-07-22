"use client";

import { useEffect, useState } from "react";
import SearchInput from "@/components/molecules/SearchInput";
import Chip from "@/components/atoms/Chip";
import Skeleton from "@/components/atoms/Skeleton";
import AnswerPanel from "@/components/organisms/AnswerPanel";
import NoAnswerState from "@/components/organisms/NoAnswerState";
import ErrorMessage from "@/components/molecules/ErrorMessage";
import { simuleerZoekopdracht, type ZoekResultaat } from "@/lib/search/simulate";
import { voorbeeldvragen } from "@/lib/data/popular-questions";
import { formatDatumNL } from "@/lib/format/date";

type Status = "stil" | "laden" | "resultaat";

interface ZoekenClientProps {
  initieleVraag: string;
  /** Alleen voor demonstratie/QA van de technische-foutstaat, zie /zoeken?q=…&fout=1. */
  forceerFout?: boolean;
}

// Losstaande zoekpagina — dezelfde antwoordervaring als de homepage
// (AnswerPanel/NoAnswerState), maar op een eigen, deelbare URL. Bereikbaar
// via "populaire vraag"-links elders in de app. Zie IMPLEMENTATION-PLAN.md
// Fase 3 §Zoekervaring.
export default function ZoekenClient({ initieleVraag, forceerFout = false }: ZoekenClientProps) {
  const [status, setStatus] = useState<Status>(initieleVraag ? "laden" : "stil");
  const [vraag, setVraag] = useState(initieleVraag);
  const [resultaat, setResultaat] = useState<ZoekResultaat | null>(null);

  useEffect(() => {
    if (status !== "laden") return;
    const timer = setTimeout(() => {
      setResultaat(simuleerZoekopdracht(vraag, { forceerFout: forceerFout && vraag === initieleVraag }));
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

  return (
    <div className="mx-auto max-w-[680px] px-4 py-12 sm:px-8 sm:py-16 lg:px-0">
      <h1 className="text-h2 font-semibold text-grijs-900">Stel je vraag</h1>
      <p className="mt-2 text-base text-grijs-600">
        Typ wat je zoekt — we wijzen je meteen de juiste stap of uitleg.
      </p>

      <div className="mt-6">
        <SearchInput
          placeholder="Bijvoorbeeld: hoe koppel ik een doelenset aan een groep?"
          defaultValue={vraag}
          loading={status === "laden"}
          onSubmit={zoek}
        />
      </div>

      {status === "stil" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {voorbeeldvragen.map((v) => (
            <Chip key={v} onClick={() => zoek(v)}>
              {v}
            </Chip>
          ))}
        </div>
      )}

      {status === "laden" && (
        <div className="mt-6" role="status" aria-label="Bezig met zoeken">
          <Skeleton variant="kaart" className="h-40" />
        </div>
      )}

      {status === "resultaat" && resultaat && (
        <div className="mt-2">
          {resultaat.type === "fout" && (
            <ErrorMessage
              beschrijving="Zoeken lukt nu niet. Probeer het opnieuw, of stel je vraag via het contactformulier."
              onRetry={() => zoek(vraag)}
            />
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
            />
          )}
        </div>
      )}
    </div>
  );
}
