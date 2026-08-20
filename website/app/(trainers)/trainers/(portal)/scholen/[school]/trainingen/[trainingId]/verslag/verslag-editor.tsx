"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Sparkles, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";

// Traineromgeving V1, Ronde 3 (2026-08-24) — de trainingsverslag-editor.
// Eigen, losse frontend-types (geen import van server-only code in een
// "use client"-bestand), zelfde conventie als schrijf-feedback.tsx.
const MAX_TRAINERINVOER = 4000;
const MAX_DEFINITIEVETEKST = 8000;
const AUTOSAVE_DEBOUNCE_MS = 1200;

// "bezig" (concurrencyfix, 2026-08-24): een kortstondige serverclaim tijdens
// het schrijven van de Monday Update — kan hier in principe zichtbaar
// worden als deze pagina ververst terwijl een andere aanvraag (tweede tab,
// dubbelklik) net bezig is. Zelfde amber "onderweg"-kleur als de fallback
// hieronder, nooit rood/mislukt.
type UpdateStatus = "niet_verzonden" | "bezig" | "geschreven" | "mislukt" | "niet_geactiveerd";
type VerslagStatus = "concept" | "gedeeltelijk" | "bevestigd" | "voltooid";

export interface VerslagInitieel {
  status: VerslagStatus;
  trainerInvoer: string | null;
  definitieveTekst: string | null;
  aiGegenereerd: boolean;
  trainingUpdateStatus: UpdateStatus;
  schoolUpdateStatus: UpdateStatus;
  /**
   * Kop+inhoud exact zoals naar Monday geschreven (bouwVerslagWeergaveTekst,
   * server-side samengesteld — nooit hier client-side nagebouwd, dat zou
   * "identiek" tot toeval maken). `undefined` zolang nog niet definitief
   * bevestigd.
   */
  weergaveTekst?: string;
}

const DENKHULP = [
  "Wat heb je behandeld?",
  "Welke keuzes zijn gemaakt?",
  "Wat ging goed?",
  "Waar liep het team tegenaan?",
  "Welke afspraken zijn gemaakt?",
  "Wat moet een volgende trainer weten?",
];

const UPDATE_LABEL: Record<UpdateStatus, string> = {
  niet_verzonden: "Nog niet verzonden",
  bezig: "Wordt verwerkt…",
  geschreven: "Opgeslagen",
  mislukt: "Mislukt",
  niet_geactiveerd: "Nog niet actief",
};

function UpdateStatusPil({ status }: { status: UpdateStatus }) {
  const kleur =
    status === "geschreven"
      ? "bg-green-50 text-green-700"
      : status === "mislukt"
        ? "bg-red-50 text-red-700"
        : status === "niet_geactiveerd"
          ? "bg-grijs-100 text-grijs-600"
          : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-label font-medium ${kleur}`}>{UPDATE_LABEL[status]}</span>;
}

async function verwerkJson(response: Response): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; fout: string }> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, fout: typeof body.error === "string" ? body.error : "Er ging iets mis. Probeer het opnieuw." };
  }
  return { ok: true, data: await response.json() };
}

/**
 * Multi-stap-flow (spec §26): 1. jouw aantekeningen, 2. AI-voorstel
 * controleren, 3. definitief opslaan. Fases "invoer"/"concept" bedienen
 * beide de EDIT-fase (status "concept" of nog geen rij) — zodra
 * bevestigVerslag() succesvol een kant wegschrijft, verlaat de rij "concept"
 * permanent en toont dit component uitsluitend nog een read-only weergave +
 * eventuele "opnieuw proberen"-actie (spec §21: de server accepteert na dat
 * punt sowieso geen nieuwe tekst meer, dus bewerken aanbieden zou een dode
 * knop zijn).
 */
export function VerslagEditor({
  trainingId,
  schoolId,
  trainingNaam,
  verslagInitieel,
  mondayLogboekIngevuldZonderLokaalVerslag = false,
}: {
  trainingId: string;
  schoolId: string;
  trainingNaam: string;
  verslagInitieel: VerslagInitieel | null;
  /**
   * Spec §15 — Monday's eigen logboekvlag zegt "ingevuld", maar er is geen
   * lokale training-verslagen-rij (bv. historische data van vóór Ronde 3, of
   * handmatig aangevinkt in Monday zelf). Nooit verslagtekst verzinnen op
   * basis van uitsluitend dit signaal — uitsluitend een nette, eerlijke
   * degradatiemelding, de gewone invoerflow blijft daaronder gewoon
   * beschikbaar voor wie alsnog een verslag wil vastleggen.
   */
  mondayLogboekIngevuldZonderLokaalVerslag?: boolean;
}) {
  const router = useRouter();

  const [status, setStatus] = useState<VerslagStatus | null>(verslagInitieel?.status ?? null);
  const [trainerInvoer, setTrainerInvoer] = useState(verslagInitieel?.trainerInvoer ?? "");
  const [definitieveTekst, setDefinitieveTekst] = useState(verslagInitieel?.definitieveTekst ?? "");
  const [aiGegenereerd, setAiGegenereerd] = useState(verslagInitieel?.aiGegenereerd ?? false);
  const [trainingUpdateStatus, setTrainingUpdateStatus] = useState<UpdateStatus>(verslagInitieel?.trainingUpdateStatus ?? "niet_verzonden");
  const [schoolUpdateStatus, setSchoolUpdateStatus] = useState<UpdateStatus>(verslagInitieel?.schoolUpdateStatus ?? "niet_verzonden");
  const [weergaveTekst, setWeergaveTekst] = useState<string | undefined>(verslagInitieel?.weergaveTekst);

  const [fase, setFase] = useState<"invoer" | "concept">(verslagInitieel?.definitieveTekst ? "concept" : "invoer");

  const [conceptStatus, setConceptStatus] = useState<"idle" | "bezig" | "opgeslagen" | "fout">("idle");
  const [structureerBezig, setStructureerBezig] = useState(false);
  const [structureerFout, setStructureerFout] = useState<string | null>(null);
  const [bevestigBezig, setBevestigBezig] = useState(false);
  const [bevestigFout, setBevestigFout] = useState<string | null>(null);
  const [bevestigBoodschap, setBevestigBoodschap] = useState<string | null>(null);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); }, []);

  const kanNogBewerken = status === null || status === "concept";

  function planAutosave(deel: { trainerInvoer?: string; definitieveTekst?: string }) {
    if (!kanNogBewerken) return; // spec §21: nooit meer autosaven zodra bevestigd
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setConceptStatus("bezig");
    autosaveTimer.current = setTimeout(() => void slaConceptOp(deel), AUTOSAVE_DEBOUNCE_MS);
  }

  async function slaConceptOp(deel: { trainerInvoer?: string; definitieveTekst?: string }) {
    try {
      const response = await fetch(`/api/trainers/trainingen/${trainingId}/verslag/concept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(deel),
      });
      const uitkomst = await verwerkJson(response);
      setConceptStatus(uitkomst.ok ? "opgeslagen" : "fout");
      if (uitkomst.ok && status === null) setStatus("concept");
    } catch {
      setConceptStatus("fout");
    }
  }

  function wijzigTrainerInvoer(waarde: string) {
    setTrainerInvoer(waarde);
    planAutosave({ trainerInvoer: waarde });
  }

  function wijzigDefinitieveTekst(waarde: string) {
    setDefinitieveTekst(waarde);
    planAutosave({ definitieveTekst: waarde });
  }

  async function maakVerslag() {
    const invoerTrim = trainerInvoer.trim();
    if (!invoerTrim || structureerBezig) return;
    setStructureerBezig(true);
    setStructureerFout(null);
    try {
      const response = await fetch(`/api/trainers/trainingen/${trainingId}/verslag/structureer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ trainerInvoer: invoerTrim }),
      });
      const uitkomst = await verwerkJson(response);
      if (!uitkomst.ok) {
        setStructureerFout(uitkomst.fout);
        setStructureerBezig(false);
        return;
      }
      const verslag = uitkomst.data.verslag as { definitieveTekst: string | null; aiGegenereerd: boolean; status: VerslagStatus };
      setDefinitieveTekst(verslag.definitieveTekst ?? "");
      setAiGegenereerd(verslag.aiGegenereerd);
      setStatus(verslag.status);
      setFase("concept");
      setStructureerBezig(false);
    } catch {
      setStructureerFout("AI-structurering mislukt — controleer je verbinding en probeer het opnieuw.");
      setStructureerBezig(false);
    }
  }

  async function bevestig(metTekst: boolean) {
    if (bevestigBezig) return;
    setBevestigBezig(true);
    setBevestigFout(null);
    setBevestigBoodschap(null);
    try {
      const response = await fetch(`/api/trainers/trainingen/${trainingId}/verslag/bevestig`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(metTekst ? { definitieveTekst } : {}),
      });
      const uitkomst = await verwerkJson(response);
      if (!uitkomst.ok) {
        setBevestigFout(uitkomst.fout);
        setBevestigBezig(false);
        return;
      }
      const verslag = uitkomst.data.verslag as {
        status: VerslagStatus;
        definitieveTekst: string | null;
        trainingUpdateStatus: UpdateStatus;
        schoolUpdateStatus: UpdateStatus;
      };
      setStatus(verslag.status);
      if (verslag.definitieveTekst) setDefinitieveTekst(verslag.definitieveTekst);
      setTrainingUpdateStatus(verslag.trainingUpdateStatus);
      setSchoolUpdateStatus(verslag.schoolUpdateStatus);
      // Server-samengesteld (zelfde functie als de Monday-schrijving) —
      // nooit hier client-side nabouwen.
      if (typeof uitkomst.data.weergaveTekst === "string") setWeergaveTekst(uitkomst.data.weergaveTekst);
      if (typeof uitkomst.data.boodschap === "string") setBevestigBoodschap(uitkomst.data.boodschap);
      setBevestigBezig(false);
      router.refresh(); // dashboard/schooldetail tonen bij terugnavigeren meteen de bijgewerkte status
    } catch {
      setBevestigFout("Bevestigen mislukt — controleer je verbinding en probeer het opnieuw.");
      setBevestigBezig(false);
    }
  }

  // -------------------------------------------------------------------
  // Reeds afgerond of onderweg — read-only tekst + eventuele retry-actie.
  // Zodra status voorbij "concept" is, ligt definitieveTekst vast (spec §21)
  // en biedt dit component geen bewerkmogelijkheid meer aan.
  // -------------------------------------------------------------------
  if (status === "voltooid") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50/60 px-4 py-3 text-body-sm font-medium text-green-800">
          <CheckCircle2 size={18} />
          Verslag ingevuld — opgeslagen bij de training en in het schoollogboek.
        </div>
        <VerslagTekstReadOnly tekst={weergaveTekst ?? definitieveTekst} />
      </div>
    );
  }

  if (status === "gedeeltelijk" || status === "bevestigd") {
    const afrondingOnvolledig = status === "bevestigd";
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex items-start gap-2 text-body-sm font-medium text-amber-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              {afrondingOnvolledig
                ? "Het verslag is opgeslagen bij zowel de training als de school. De afronding (status/logboek bijwerken) is nog niet overal gelukt."
                : "Het verslag is nog niet bij beide plekken opgeslagen."}
              {bevestigBoodschap && <p className="mt-1 font-normal text-amber-700">{bevestigBoodschap}</p>}
            </div>
          </div>
          {!afrondingOnvolledig && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-label">
              <span className="flex items-center gap-1.5 text-grijs-700">
                Trainingslogboek: <UpdateStatusPil status={trainingUpdateStatus} />
              </span>
              <span className="flex items-center gap-1.5 text-grijs-700">
                Schoollogboek: <UpdateStatusPil status={schoolUpdateStatus} />
              </span>
            </div>
          )}
          {bevestigFout && (
            <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-label text-red-700">
              {bevestigFout}
            </p>
          )}
          <button
            type="button"
            disabled={bevestigBezig}
            onClick={() => void bevestig(false)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-label font-semibold text-amber-800 transition-colors hover:bg-amber-50 disabled:cursor-wait disabled:opacity-60"
          >
            {bevestigBezig ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Opnieuw proberen
          </button>
        </div>
        <VerslagTekstReadOnly tekst={weergaveTekst ?? definitieveTekst} />
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Bewerkbare flow — fase "invoer" (stap 1) of "concept" (stap 2/3).
  // -------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-5">
      {mondayLogboekIngevuldZonderLokaalVerslag && (
        <div className="flex items-start gap-2 rounded-xl border border-grijs-200 bg-grijs-50 px-4 py-3 text-body-sm text-grijs-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-grijs-500" />
          <div>
            Logboek staat als ingevuld in Monday, maar er is hier geen verslagtekst bekend. Wil je er alsnog één vastleggen?
          </div>
        </div>
      )}

      <StapIndicator fase={fase} />

      {fase === "invoer" ? (
        <section className="rounded-xl border border-grijs-200 bg-white p-4 shadow-sm">
          <label htmlFor="verslag-invoer" className="text-h3 font-semibold text-grijs-900">
            Jouw aantekeningen
          </label>
          <textarea
            id="verslag-invoer"
            value={trainerInvoer}
            onChange={(e) => wijzigTrainerInvoer(e.target.value)}
            maxLength={MAX_TRAINERINVOER}
            rows={8}
            placeholder="Vertel kort wat er tijdens deze training is gebeurd..."
            className="mt-2 w-full resize-y rounded-lg border border-grijs-300 p-3 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
          />
          <ul className="mt-2 flex flex-col gap-0.5 text-label text-grijs-500">
            {DENKHULP.map((vraag) => (
              <li key={vraag}>· {vraag}</li>
            ))}
          </ul>
          <AutosaveIndicator status={conceptStatus} />

          {structureerFout && (
            <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-label text-red-700">
              {structureerFout}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={structureerBezig || trainerInvoer.trim().length === 0}
              onClick={() => void maakVerslag()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {structureerBezig ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  AI structureert je verslag…
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Maak verslag
                </>
              )}
            </button>
            {definitieveTekst.trim().length > 0 && (
              <button type="button" onClick={() => setFase("concept")} className="text-body-sm font-medium text-teal-700 hover:underline">
                Terug naar concept
              </button>
            )}
            <Link href={`/scholen/${schoolId}`} className="text-body-sm font-medium text-grijs-600 hover:text-grijs-800 hover:underline">
              Annuleren
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-grijs-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="verslag-concept" className="text-h3 font-semibold text-grijs-900">
              Concept controleren
            </label>
            {aiGegenereerd && (
              <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-label font-medium text-teal-700">
                <Sparkles size={11} />
                AI-voorstel
              </span>
            )}
          </div>
          <p className="mt-1 text-label text-grijs-500">Pas de tekst vrij aan — dit wordt de definitieve verslagtekst.</p>
          <textarea
            id="verslag-concept"
            value={definitieveTekst}
            onChange={(e) => wijzigDefinitieveTekst(e.target.value)}
            maxLength={MAX_DEFINITIEVETEKST}
            rows={14}
            className="mt-2 w-full resize-y rounded-lg border border-grijs-300 p-3 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
          />
          <AutosaveIndicator status={conceptStatus} />

          <div className="mt-3 flex flex-wrap gap-3 text-body-sm font-medium text-teal-700">
            <button type="button" disabled={structureerBezig} onClick={() => void maakVerslag()} className="hover:underline disabled:opacity-50">
              {structureerBezig ? "Bezig…" : "Opnieuw AI laten structureren"}
            </button>
            <button type="button" onClick={() => setFase("invoer")} className="hover:underline">
              Terug naar oorspronkelijke invoer
            </button>
          </div>

          {bevestigFout && (
            <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-label text-red-700">
              {bevestigFout}
            </p>
          )}

          <p className="mt-4 text-label text-grijs-500">
            Dit verslag wordt bij bevestigen opgeslagen bij zowel <strong>{trainingNaam}</strong> als in het <strong>centrale schoollogboek</strong>.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={bevestigBezig || definitieveTekst.trim().length === 0}
              onClick={() => void bevestig(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bevestigBezig ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Bezig met opslaan…
                </>
              ) : (
                "Definitief opslaan"
              )}
            </button>
            <Link href={`/scholen/${schoolId}`} className="text-body-sm font-medium text-grijs-600 hover:text-grijs-800 hover:underline">
              Annuleren
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function StapIndicator({ fase }: { fase: "invoer" | "concept" }) {
  const stappen = [
    { sleutel: "invoer", label: "1. Aantekeningen" },
    { sleutel: "concept", label: "2. Voorstel controleren" },
    { sleutel: "opslaan", label: "3. Opslaan" },
  ] as const;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label font-medium">
      {stappen.map((stap, i) => (
        <span key={stap.sleutel} className={fase === stap.sleutel || (stap.sleutel === "opslaan" && fase === "concept") ? "text-teal-700" : "text-grijs-400"}>
          {stap.label}
          {i < stappen.length - 1 && <span className="ml-2 text-grijs-300">·</span>}
        </span>
      ))}
    </div>
  );
}

function AutosaveIndicator({ status }: { status: "idle" | "bezig" | "opgeslagen" | "fout" }) {
  if (status === "idle") return null;
  return (
    <p className="mt-1.5 text-label text-grijs-500">
      {status === "bezig" && (
        <span className="flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" />
          Concept opslaan…
        </span>
      )}
      {status === "opgeslagen" && "Concept opgeslagen"}
      {status === "fout" && <span className="text-amber-700">Concept kon niet worden opgeslagen — je tekst blijft zichtbaar, probeer het zo opnieuw.</span>}
    </p>
  );
}

function VerslagTekstReadOnly({ tekst }: { tekst: string }) {
  return (
    <section className="rounded-xl border border-grijs-200 bg-white p-4 shadow-sm">
      <h2 className="text-h3 font-semibold text-grijs-900">Verslag</h2>
      <p className="mt-2 whitespace-pre-line text-body-sm text-grijs-900">{tekst || "(geen tekst)"}</p>
    </section>
  );
}
