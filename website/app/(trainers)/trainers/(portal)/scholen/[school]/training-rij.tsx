"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TrainingStatus } from "@/lib/trainers/monday-links";
import { TRAINING_STATUS_KLEUR, TRAINING_STATUS_LABEL } from "@/lib/trainers/status-styles";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import { StatusPopover } from "./status-popover";
import { DatumPopover } from "./datum-popover";
import type { WriteBackResultaat } from "./schrijf-feedback";

interface TrainingProps {
  id: string;
  naam: string;
  status: TrainingStatus;
  ruweStatusTekst: string | null;
  datum: string | null;
  trainerboardItemId: string | null;
}

interface VeldState {
  bezig: boolean;
  resultaat: WriteBackResultaat | null;
  fout: string | null;
}

const LEGE_VELD_STATE: VeldState = { bezig: false, resultaat: null, fout: null };

/**
 * Traineromgeving V1, Ronde 2 vervolg (2026-08-19) — vervangt de grote
 * bewerkmodal (training-bewerken-dialog.tsx, verwijderd) als primaire
 * interactie: klik direct op de statusbadge of de datum, wijzig precies dat
 * gegeven via een compacte popover, geen apart formulier meer. Status en
 * datum hebben elk hun EIGEN, onafhankelijke bezig-/resultaat-/foutstatus
 * (statusState/datumState) — de twee popovers mogen elkaars laatst getoonde
 * uitkomst nooit overschrijven, ook al raken ze soms (via de automatische
 * datum -> Gepland-regel, writeback.ts) dezelfde onderliggende statuskolom.
 *
 * "Baseline"-tracking (baselineStatus/-StatusTekst/-Datum) is 1-op-1
 * overgenomen van de vorige modal: wat de trainer (of het laatste
 * servervoordeel) het laatst als waarheid zag, bijgewerkt ná elke poging —
 * ook een geweigerde — zodat een volgende poging altijd tegen de meest
 * recent GETOONDE waarde vergelijkt, nooit tegen de oorspronkelijke
 * paginalaad als er al een conflict tussendoor is getoond.
 *
 * Server-side blijft dit stateloos (lib/trainers/writeback.ts): elke poging
 * — ook een "opnieuw proberen ná conflict" — is gewoon een nieuw PATCH-
 * verzoek met een bijgewerkte verwachteHuidigeWaarde/verwachteHuidigeRuweTekst.
 */
export function TrainingRij({
  training,
  toonLogboekStatus = false,
  logboekIngevuld = false,
}: {
  training: TrainingProps;
  toonLogboekStatus?: boolean;
  logboekIngevuld?: boolean;
}) {
  const router = useRouter();

  const [baselineStatus, setBaselineStatus] = useState(training.status);
  const [baselineStatusTekst, setBaselineStatusTekst] = useState(training.ruweStatusTekst);
  const [baselineDatum, setBaselineDatum] = useState(training.datum);

  const [statusState, setStatusState] = useState<VeldState>(LEGE_VELD_STATE);
  const [datumState, setDatumState] = useState<VeldState>(LEGE_VELD_STATE);
  // undefined = nog geen poging gedaan deze paginalaad (retry-knoppen zijn
  // dan nooit zichtbaar); null is een geldige, eerder geprobeerde waarde
  // (datum verwijderen) en moet dus apart van "nog niets geprobeerd" blijven.
  const [laatstGeprobeerdeStatus, setLaatstGeprobeerdeStatus] = useState<TrainingStatus | undefined>(undefined);
  const [laatstGeprobeerdeDatum, setLaatstGeprobeerdeDatum] = useState<string | null | undefined>(undefined);

  async function verwerkRespons(
    response: Response,
    setState: (s: VeldState) => void,
    opBaseline: (data: WriteBackResultaat) => void
  ) {
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setState({ bezig: false, resultaat: null, fout: body.error ?? "Bijwerken mislukt. Probeer het opnieuw." });
      return;
    }
    const data = (await response.json()) as WriteBackResultaat;
    setState({ bezig: false, resultaat: data, fout: null });
    opBaseline(data);
    if (data.algeheleStatus === "volledig_geslaagd") router.refresh();
  }

  async function verstuurStatus(nieuweStatus: TrainingStatus, alleenRecord?: "trainerboard" | "centraal") {
    setLaatstGeprobeerdeStatus(nieuweStatus);
    setStatusState({ bezig: true, resultaat: null, fout: null });
    const verzoek: Record<string, unknown> = { status: { nieuweWaarde: nieuweStatus, verwachteHuidigeRuweTekst: baselineStatusTekst } };
    if (alleenRecord) verzoek.alleenRecord = alleenRecord;
    try {
      const response = await fetch(`/api/trainers/trainingen/${training.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(verzoek),
      });
      await verwerkRespons(response, setStatusState, (data) => {
        const centraal = data.kolomResultaten.find((k) => k.record === "centraal" && k.veld === "status");
        if (centraal?.status === "geschreven") {
          setBaselineStatus(nieuweStatus);
          setBaselineStatusTekst(null); // volgende live read levert de echte ruwe tekst; hier alleen de lokale aanname resetten
        } else if (centraal?.conflict) {
          setBaselineStatusTekst(centraal.conflict.huidigOpMonday);
        }
      });
    } catch {
      setStatusState({ bezig: false, resultaat: null, fout: "Bijwerken mislukt — controleer je verbinding en probeer het opnieuw." });
    }
  }

  async function verstuurDatum(nieuweDatum: string | null, alleenRecord?: "trainerboard" | "centraal") {
    setLaatstGeprobeerdeDatum(nieuweDatum);
    setDatumState({ bezig: true, resultaat: null, fout: null });
    const verzoek: Record<string, unknown> = { datum: { nieuweWaarde: nieuweDatum, verwachteHuidigeWaarde: baselineDatum } };
    if (alleenRecord) verzoek.alleenRecord = alleenRecord;
    try {
      const response = await fetch(`/api/trainers/trainingen/${training.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(verzoek),
      });
      await verwerkRespons(response, setDatumState, (data) => {
        const centraalDatum = data.kolomResultaten.find((k) => k.record === "centraal" && k.veld === "datum");
        if (centraalDatum?.status === "geschreven") setBaselineDatum(nieuweDatum);
        else if (centraalDatum?.conflict) setBaselineDatum(centraalDatum.conflict.huidigOpMonday);

        // De automatische datum -> status-regel (writeback.ts) kan in
        // dezelfde respons een statuskolom meesturen — de baseline-status
        // moet daar ook op meebewegen, anders vergelijkt een volgende,
        // snel-opeenvolgende statuswijziging tegen een inmiddels alweer
        // verouderde aanname.
        const centraalStatus = data.kolomResultaten.find((k) => k.record === "centraal" && k.veld === "status");
        if (centraalStatus?.status === "geschreven") {
          setBaselineStatus(nieuweDatum !== null ? "gepland" : "open");
          setBaselineStatusTekst(null);
        } else if (centraalStatus?.conflict) {
          setBaselineStatusTekst(centraalStatus.conflict.huidigOpMonday);
        }
      });
    } catch {
      setDatumState({ bezig: false, resultaat: null, fout: "Bijwerken mislukt — controleer je verbinding en probeer het opnieuw." });
    }
  }

  const kanBewerken = training.trainerboardItemId !== null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5">
      <p className="min-w-[10rem] flex-1 text-body-sm font-medium text-grijs-900">{training.naam}</p>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {toonLogboekStatus && (
          <span
            className={`rounded-full px-2 py-0.5 text-label font-medium ${
              logboekIngevuld ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {logboekIngevuld ? "Logboek ingevuld" : "Logboek niet ingevuld"}
          </span>
        )}

        {kanBewerken ? (
          <>
            <DatumPopover
              huidigeDatum={baselineDatum}
              bezig={datumState.bezig}
              resultaat={datumState.resultaat}
              fout={datumState.fout}
              onKiezen={(waarde) => void verstuurDatum(waarde)}
              onVerwijderen={() => void verstuurDatum(null)}
              onOpnieuwProberen={(record) => {
                if (laatstGeprobeerdeDatum !== undefined) void verstuurDatum(laatstGeprobeerdeDatum, record);
              }}
              onGesloten={() => setDatumState(LEGE_VELD_STATE)}
            />
            <StatusPopover
              huidigeStatus={baselineStatus}
              bezig={statusState.bezig}
              resultaat={statusState.resultaat}
              fout={statusState.fout}
              onKiezen={(status) => void verstuurStatus(status)}
              onOpnieuwProberen={(record) => {
                if (laatstGeprobeerdeStatus) void verstuurStatus(laatstGeprobeerdeStatus, record);
              }}
              onGesloten={() => setStatusState(LEGE_VELD_STATE)}
            />
          </>
        ) : (
          <>
            <span className="w-20 text-right text-body-sm text-grijs-600">{formatKorteDatum(training.datum)}</span>
            <span className={`rounded-full px-2 py-0.5 text-label font-medium ${TRAINING_STATUS_KLEUR[training.status]}`}>
              {TRAINING_STATUS_LABEL[training.status]}
            </span>
          </>
        )}
      </div>
    </li>
  );
}
