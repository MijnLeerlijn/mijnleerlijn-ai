"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { LogboekType } from "@/lib/trainers/logboek";
import { formatKorteDatumTijd } from "@/lib/sales/format-datum";
import { VERSLAG_STATUS_KLEUR, WRITEBACK_STATUS_KLEUR } from "@/lib/admin/trainers/status-kleuren";
import { AdminStatusBadge } from "./AdminStatusBadge";

// Admin Schooldetail/Trainerdetail — Verslagen + Logboek volledig kunnen
// lezen/bewerken/verwijderen (vervolgronde). ÉÉN gedeelde implementatie voor
// beide detailpagina's (spec: "ik wil niet twee verschillende admin-
// implementaties voor het beheren van dezelfde gegevens") — SchoolDetailView
// en TrainerDetailView importeren deze componenten allebei, elk met hun
// eigen (structureel compatibele) rijtype: AdminSchoolVerslagRegel/
// AdminTrainerVerslagRegel voor Verslagen, AdminSchoolLogboekRegel/
// LogboekItemRecord voor Logboek. De componenten hieronder zijn bewust tegen
// een MINIMALE gemeenschappelijke vorm getypeerd (VerslagWeergaveRegel/
// LogboekWeergaveRegel), niet tegen één van beide concrete typen — elk
// concreet type voldoet daar structureel aan, geen aparte adapterlaag nodig.
//
// Backend-hergebruik: Verslagen-mutaties gaan via
// lib/trainers/verslag.ts se wijzigVerslagAlsAdmin/verwijderVerslagAlsAdmin
// (nieuw, zie dat bestand voor de volledige Monday-writeback-analyse).
// Logboek-mutaties hergebruiken de AL BESTAANDE
// wijzigLogboekItemAlsAdmin/verwijderLogboekItemAlsAdmin (Correctieronde
// Admin Traineromgeving, vorige ronde) via de al bestaande
// /api/admin/trainers/logboek/[id]-route — hier NIET opnieuw gebouwd, alleen
// de UI eromheen verplaatst/verbeterd.

export const VERSLAG_STATUS_LABEL: Record<"concept" | "gedeeltelijk" | "bevestigd" | "voltooid", string> = {
  concept: "Concept",
  gedeeltelijk: "Gedeeltelijk",
  bevestigd: "Bevestigd",
  voltooid: "Voltooid",
};
export const WRITEBACK_STATUS_LABEL: Record<"niet_verzonden" | "bezig" | "geschreven" | "mislukt" | "niet_geactiveerd", string> = {
  niet_verzonden: "Niet verzonden",
  bezig: "Bezig",
  geschreven: "Geschreven",
  mislukt: "Mislukt",
  niet_geactiveerd: "Niet actief",
};
// Letterlijke kopie van lib/trainers/logboek.ts se LOGBOEK_TYPE_LABEL — dat
// bestand importeert monday-links.ts (live Monday-API-code) op
// runtime-niveau, niet veilig om in een "use client"-component te bundelen
// (zelfde reden als lib/sales/format-datum.ts se TYPE_LABEL-toelichting).
export const LOGBOEK_TYPE_LABEL: Record<LogboekType, string> = {
  telefonisch: "Telefonisch",
  helpdesk: "Helpdesk",
  overleg: "Overleg",
  notitie: "Notitie",
  overig: "Overig",
};

const LOGBOEK_PREVIEW_LENGTE = 110;

// ---------------------------------------------------------------------------
// Verslagen
// ---------------------------------------------------------------------------

export interface VerslagWeergaveRegel {
  verslagId: number;
  trainerId?: number;
  trainerNaam?: string;
  schoolNaam?: string;
  trainingNaam: string;
  wanneer: string;
  status: "concept" | "gedeeltelijk" | "bevestigd" | "voltooid";
  bron: "portal" | "telefoon";
  trainingUpdateStatus: "niet_verzonden" | "bezig" | "geschreven" | "mislukt" | "niet_geactiveerd";
  schoolUpdateStatus: "niet_verzonden" | "bezig" | "geschreven" | "mislukt" | "niet_geactiveerd";
  definitieveTekst: string | null;
  trainerInvoer: string | null;
  /**
   * Root-cause-fix productie-incident (2026-08-27) — uitsluitend relevant
   * bij bron="telefoon": true als het gesprek niet via een expliciete
   * '#'-bevestiging is afgerond (maximale opnameduur bereikt, geen reactie
   * op de vervolgvraag, of een onverwachte hangup). Zie
   * payload/collections/TrainingVerslagen.ts.
   */
  mogelijkOnvolledig?: boolean | null;
}

export function VerslagenLijst<T extends VerslagWeergaveRegel>({
  data,
  toonTrainerKolom = true,
  toonSchoolKolom = false,
  onGewijzigd,
  onVerwijderd,
}: {
  data: T[];
  /** Standaard aan (schooldetail: trainer varieert per rij) — trainerdetail zet dit uit (altijd dezelfde trainer, al zichtbaar in de paginakop) en toonSchoolKolom aan (daar varieert juist de school). */
  toonTrainerKolom?: boolean;
  toonSchoolKolom?: boolean;
  onGewijzigd: (verslagId: number, wijziging: { definitieveTekst: string }) => void;
  onVerwijderd: (verslagId: number) => void;
}) {
  const [bekijkItem, setBekijkItem] = useState<T | null>(null);

  if (data.length === 0) return <div className="ml-sales__leeg">Nog geen verslagen.</div>;
  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table className="ml-sales__tabel">
          <thead>
            <tr>
              <th>Datum</th>
              {toonTrainerKolom && <th>Trainer</th>}
              {toonSchoolKolom && <th>School</th>}
              <th>Training</th>
              <th>Status</th>
              <th>Bron</th>
              <th>Training-update</th>
              <th>School-update</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((v) => (
              <tr key={v.verslagId}>
                <td>{formatKorteDatumTijd(v.wanneer)}</td>
                {toonTrainerKolom && <td>{v.trainerId ? <Link href={`/admin/trainers/detail?id=${v.trainerId}`}>{v.trainerNaam}</Link> : (v.trainerNaam ?? "—")}</td>}
                {toonSchoolKolom && <td>{v.schoolNaam ?? "—"}</td>}
                <td>{v.trainingNaam}</td>
                <td>
                  <AdminStatusBadge label={VERSLAG_STATUS_LABEL[v.status]} kleur={VERSLAG_STATUS_KLEUR[v.status]} />
                </td>
                <td>
                  {v.bron === "telefoon" ? "Telefonisch" : "Portal"}
                  {v.bron === "telefoon" && v.mogelijkOnvolledig && (
                    <span style={{ marginLeft: 6 }}>
                      <AdminStatusBadge label="Mogelijk onvolledig" kleur="orange" />
                    </span>
                  )}
                </td>
                <td>
                  <AdminStatusBadge label={WRITEBACK_STATUS_LABEL[v.trainingUpdateStatus]} kleur={WRITEBACK_STATUS_KLEUR[v.trainingUpdateStatus]} />
                </td>
                <td>
                  <AdminStatusBadge label={WRITEBACK_STATUS_LABEL[v.schoolUpdateStatus]} kleur={WRITEBACK_STATUS_KLEUR[v.schoolUpdateStatus]} />
                </td>
                <td>
                  <button type="button" className="ml-sales__knop" onClick={() => setBekijkItem(v)}>
                    Bekijken
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bekijkItem && (
        <VerslagDetailModal
          verslag={bekijkItem}
          onSluiten={() => setBekijkItem(null)}
          onGewijzigd={(wijziging) => {
            onGewijzigd(bekijkItem.verslagId, wijziging);
            setBekijkItem((huidig) => (huidig ? { ...huidig, ...wijziging } : huidig));
          }}
          onVerwijderd={() => {
            onVerwijderd(bekijkItem.verslagId);
            setBekijkItem(null);
          }}
        />
      )}
    </>
  );
}

function VerslagDetailModal({
  verslag,
  onSluiten,
  onGewijzigd,
  onVerwijderd,
}: {
  verslag: VerslagWeergaveRegel;
  onSluiten: () => void;
  onGewijzigd: (wijziging: { definitieveTekst: string }) => void;
  onVerwijderd: () => void;
}) {
  const [modus, setModus] = useState<"bekijken" | "bewerken">("bekijken");
  const [tekst, setTekst] = useState(verslag.definitieveTekst ?? "");
  const [bezig, setBezig] = useState(false);
  const [verwijderBezig, setVerwijderBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const volledigGeschreven = verslag.trainingUpdateStatus === "geschreven" && verslag.schoolUpdateStatus === "geschreven";

  async function handleOpslaan(e: FormEvent) {
    e.preventDefault();
    if (tekst.trim().length === 0) return;
    setBezig(true);
    setFout(null);
    try {
      const response = await fetch(`/api/admin/trainers/verslag/${verslag.verslagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ definitieveTekst: tekst }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFout(typeof body.error === "string" ? body.error : "Opslaan mislukt. Probeer het opnieuw.");
        setBezig(false);
        return;
      }
      onGewijzigd({ definitieveTekst: tekst });
      setModus("bekijken");
      setBezig(false);
    } catch {
      setFout("Opslaan mislukt — controleer je verbinding en probeer het opnieuw.");
      setBezig(false);
    }
  }

  async function handleVerwijderen() {
    if (!window.confirm("Weet je zeker dat je dit verslag wilt verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
    setVerwijderBezig(true);
    try {
      const response = await fetch(`/api/admin/trainers/verslag/${verslag.verslagId}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        window.alert("Verwijderen is niet gelukt. Probeer het opnieuw.");
        setVerwijderBezig(false);
        return;
      }
      onVerwijderd();
    } catch {
      window.alert("Verwijderen is niet gelukt. Probeer het opnieuw.");
      setVerwijderBezig(false);
    }
  }

  return (
    <div className="ml-sales__overlay" onClick={onSluiten}>
      <div className="ml-sales__overlay-paneel" onClick={(e) => e.stopPropagation()}>
        <div className="ml-sales__overlay-header">
          <h2>Verslag {modus === "bewerken" ? "bewerken" : "bekijken"}</h2>
          <button type="button" onClick={onSluiten} aria-label="Sluiten">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, fontSize: 13 }} className="ml-sales__kaart-tekst">
          {verslag.schoolNaam && (
            <div>
              <strong>School:</strong> {verslag.schoolNaam}
            </div>
          )}
          {verslag.trainerNaam && (
            <div>
              <strong>Trainer:</strong> {verslag.trainerNaam}
            </div>
          )}
          <div>
            <strong>Training:</strong> {verslag.trainingNaam}
          </div>
          <div>
            <strong>Datum:</strong> {formatKorteDatumTijd(verslag.wanneer)}
          </div>
          <div>
            <strong>Bron:</strong> {verslag.bron === "telefoon" ? "Telefonisch" : "Portal"}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <strong>Status:</strong> <AdminStatusBadge label={VERSLAG_STATUS_LABEL[verslag.status]} kleur={VERSLAG_STATUS_KLEUR[verslag.status]} />
          </div>
          {verslag.bron === "telefoon" && verslag.mogelijkOnvolledig && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <strong>Let op:</strong> <AdminStatusBadge label="Mogelijk onvolledig — niet bewust afgerond" kleur="orange" />
            </div>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <strong>Monday — training-update:</strong> <AdminStatusBadge label={WRITEBACK_STATUS_LABEL[verslag.trainingUpdateStatus]} kleur={WRITEBACK_STATUS_KLEUR[verslag.trainingUpdateStatus]} />
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <strong>Monday — school-update:</strong> <AdminStatusBadge label={WRITEBACK_STATUS_LABEL[verslag.schoolUpdateStatus]} kleur={WRITEBACK_STATUS_KLEUR[verslag.schoolUpdateStatus]} />
          </div>
        </div>

        {modus === "bekijken" ? (
          <>
            <div className="ml-sales__overlay-veld">
              <label>Verslagtekst</label>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{verslag.definitieveTekst || "Nog geen definitieve tekst."}</p>
            </div>
            {verslag.trainerInvoer && verslag.trainerInvoer !== verslag.definitieveTekst && (
              <details style={{ marginTop: 8 }}>
                <summary className="ml-sales__kaart-tekst" style={{ cursor: "pointer" }}>
                  Oorspronkelijke trainerinvoer tonen
                </summary>
                <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }} className="ml-sales__kaart-tekst">
                  {verslag.trainerInvoer}
                </p>
              </details>
            )}

            <div className="ml-sales__overlay-acties">
              <button type="button" className="ml-sales__knop ml-sales__knop--gevaar" disabled={verwijderBezig} onClick={handleVerwijderen}>
                {verwijderBezig ? "Bezig…" : "Verwijderen"}
              </button>
              <button type="button" className="ml-sales__knop ml-sales__knop--primair" onClick={() => setModus("bewerken")}>
                Bewerken
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleOpslaan} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!volledigGeschreven && (
              <p className="ml-sales__kaart-tekst" style={{ margin: 0 }}>
                Dit verslag is nog niet (volledig) naar Monday geschreven. Als de trainer dit verslag later zelf bevestigt, wordt de dan geldende tekst gebruikt — deze wijziging schrijft zelf niets naar Monday.
              </p>
            )}
            <div className="ml-sales__overlay-veld">
              <label htmlFor="verslag-bewerk-tekst">Verslagtekst</label>
              <textarea id="verslag-bewerk-tekst" value={tekst} onChange={(e) => setTekst(e.target.value)} rows={10} required />
            </div>

            {fout && <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{fout}</p>}

            <div className="ml-sales__overlay-acties">
              <button
                type="button"
                className="ml-sales__knop"
                disabled={bezig}
                onClick={() => {
                  setTekst(verslag.definitieveTekst ?? "");
                  setFout(null);
                  setModus("bekijken");
                }}
              >
                Annuleren
              </button>
              <button type="submit" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig || tekst.trim().length === 0}>
                {bezig ? "Opslaan…" : "Opslaan"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logboek
// ---------------------------------------------------------------------------

export interface LogboekWeergaveRegel {
  id: number;
  trainerId?: number;
  trainerNaam?: string;
  schoolNaam?: string | null;
  type: LogboekType;
  occurredAt: string;
  tekst: string;
  trainingNaam?: string | null;
}

/** "2026-08-28T14:05" in de LOKALE tijd van de browser — zelfde conventie als app/(trainers)/trainers/(portal)/logboek/nieuw/logboek-form.tsx se nuAlsDatetimeLocal, hier vanaf een BESTAAND ISO-tijdstip i.p.v. "nu". */
function isoAlsDatetimeLocal(iso: string): string {
  const datum = new Date(iso);
  const lokaal = new Date(datum.getTime() - datum.getTimezoneOffset() * 60_000);
  return lokaal.toISOString().slice(0, 16);
}

export function LogboekLijst<T extends LogboekWeergaveRegel>({
  data,
  toonTrainerKolom = true,
  onGewijzigd,
  onVerwijderd,
}: {
  data: T[];
  /** Zelfde reden als VerslagenLijst — trainerdetail kent de trainer al via de paginakop. */
  toonTrainerKolom?: boolean;
  onGewijzigd: (id: number, wijziging: { type: LogboekType; occurredAt: string; tekst: string }) => void;
  onVerwijderd: (id: number) => void;
}) {
  const [bekijkItem, setBekijkItem] = useState<T | null>(null);

  if (data.length === 0) return <div className="ml-sales__leeg">Nog geen logboekitems.</div>;

  return (
    <>
      <div className="ml-sales__logboek">
        {data.map((item) => {
          const preview = item.tekst.length > LOGBOEK_PREVIEW_LENGTE ? `${item.tekst.slice(0, LOGBOEK_PREVIEW_LENGTE)}…` : item.tekst;
          return (
            <button type="button" key={item.id} className="ml-sales__logboek-item ml-sales__logboek-item--klikbaar" onClick={() => setBekijkItem(item)}>
              <span className="ml-sales__logboek-stip" />
              <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                <div>
                  {toonTrainerKolom && item.trainerNaam ? <>{item.trainerNaam} — </> : null}
                  {preview}
                </div>
                <div className="ml-sales__logboek-meta">
                  {formatKorteDatumTijd(item.occurredAt)} · {LOGBOEK_TYPE_LABEL[item.type]}
                  {item.trainingNaam ? ` · ${item.trainingNaam}` : ""}
                  {item.schoolNaam ? ` · ${item.schoolNaam}` : ""}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {bekijkItem && (
        <LogboekBekijkModal
          item={bekijkItem}
          onSluiten={() => setBekijkItem(null)}
          onGewijzigd={(wijziging) => {
            onGewijzigd(bekijkItem.id, wijziging);
            setBekijkItem(null);
          }}
          onVerwijderd={() => {
            onVerwijderd(bekijkItem.id);
            setBekijkItem(null);
          }}
        />
      )}
    </>
  );
}

function LogboekBekijkModal({
  item,
  onSluiten,
  onGewijzigd,
  onVerwijderd,
}: {
  item: LogboekWeergaveRegel;
  onSluiten: () => void;
  onGewijzigd: (wijziging: { type: LogboekType; occurredAt: string; tekst: string }) => void;
  onVerwijderd: () => void;
}) {
  const [bewerken, setBewerken] = useState(false);
  const [verwijderBezig, setVerwijderBezig] = useState(false);

  async function handleVerwijderen() {
    if (!window.confirm("Weet je zeker dat je dit logboekitem wilt verwijderen?")) return;
    setVerwijderBezig(true);
    try {
      const response = await fetch(`/api/admin/trainers/logboek/${item.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        window.alert("Verwijderen is niet gelukt. Probeer het opnieuw.");
        setVerwijderBezig(false);
        return;
      }
      onVerwijderd();
    } catch {
      window.alert("Verwijderen is niet gelukt. Probeer het opnieuw.");
      setVerwijderBezig(false);
    }
  }

  if (bewerken) {
    return <LogboekBewerkModal item={item} onSluiten={() => setBewerken(false)} onOpgeslagen={onGewijzigd} />;
  }

  return (
    <div className="ml-sales__overlay" onClick={onSluiten}>
      <div className="ml-sales__overlay-paneel" onClick={(e) => e.stopPropagation()}>
        <div className="ml-sales__overlay-header">
          <h2>Logboekitem</h2>
          <button type="button" onClick={onSluiten} aria-label="Sluiten">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, fontSize: 13 }} className="ml-sales__kaart-tekst">
          {item.trainerNaam && (
            <div>
              <strong>Trainer:</strong> {item.trainerNaam}
            </div>
          )}
          {item.schoolNaam && (
            <div>
              <strong>School:</strong> {item.schoolNaam}
            </div>
          )}
          {item.trainingNaam && (
            <div>
              <strong>Training:</strong> {item.trainingNaam}
            </div>
          )}
          <div>
            <strong>Type:</strong> {LOGBOEK_TYPE_LABEL[item.type]}
          </div>
          <div>
            <strong>Datum/tijd:</strong> {formatKorteDatumTijd(item.occurredAt)}
          </div>
        </div>

        <div className="ml-sales__overlay-veld">
          <label>Notitie</label>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{item.tekst}</p>
        </div>

        <div className="ml-sales__overlay-acties">
          <button type="button" className="ml-sales__knop ml-sales__knop--gevaar" disabled={verwijderBezig} onClick={handleVerwijderen}>
            {verwijderBezig ? "Bezig…" : "Verwijderen"}
          </button>
          <button type="button" className="ml-sales__knop ml-sales__knop--primair" onClick={() => setBewerken(true)}>
            Bewerken
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hergebruikt de AL BESTAANDE wijzigLogboekItemAlsAdmin-route (vorige ronde)
 * — deze functiecomponent is verplaatst uit SchoolDetailView.tsx naar hier
 * (ongewijzigde logica) zodat TrainerDetailView.tsx 'm ook kan gebruiken.
 */
function LogboekBewerkModal({
  item,
  onSluiten,
  onOpgeslagen,
}: {
  item: LogboekWeergaveRegel;
  onSluiten: () => void;
  onOpgeslagen: (item: { type: LogboekType; occurredAt: string; tekst: string }) => void;
}) {
  const [type, setType] = useState<LogboekType>(item.type);
  const [occurredAt, setOccurredAt] = useState(isoAlsDatetimeLocal(item.occurredAt));
  const [tekst, setTekst] = useState(item.tekst);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (tekst.trim().length === 0) return;
    setBezig(true);
    setFout(null);
    try {
      const response = await fetch(`/api/admin/trainers/logboek/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, occurredAt: new Date(occurredAt).toISOString(), tekst }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFout(typeof body.error === "string" ? body.error : "Opslaan mislukt. Probeer het opnieuw.");
        setBezig(false);
        return;
      }
      onOpgeslagen({ type: body.item?.type ?? type, occurredAt: body.item?.occurredAt ?? new Date(occurredAt).toISOString(), tekst: body.item?.tekst ?? tekst });
    } catch {
      setFout("Opslaan mislukt — controleer je verbinding en probeer het opnieuw.");
      setBezig(false);
    }
  }

  return (
    <div className="ml-sales__overlay" onClick={onSluiten}>
      <div className="ml-sales__overlay-paneel" onClick={(e) => e.stopPropagation()}>
        <div className="ml-sales__overlay-header">
          <h2>Logboekitem bewerken</h2>
          <button type="button" onClick={onSluiten} aria-label="Sluiten">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="ml-sales__overlay-veld">
            <label htmlFor="logboek-bewerk-type">Type</label>
            <select id="logboek-bewerk-type" value={type} onChange={(e) => setType(e.target.value as LogboekType)}>
              {Object.entries(LOGBOEK_TYPE_LABEL).map(([waarde, label]) => (
                <option key={waarde} value={waarde}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-sales__overlay-veld">
            <label htmlFor="logboek-bewerk-datum">Datum/tijd</label>
            <input id="logboek-bewerk-datum" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
          </div>

          <div className="ml-sales__overlay-veld">
            <label htmlFor="logboek-bewerk-tekst">Notitie</label>
            <textarea id="logboek-bewerk-tekst" value={tekst} onChange={(e) => setTekst(e.target.value)} rows={5} required />
          </div>

          {fout && <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{fout}</p>}

          <div className="ml-sales__overlay-acties">
            <button type="button" className="ml-sales__knop" onClick={onSluiten} disabled={bezig}>
              Annuleren
            </button>
            <button type="submit" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig || tekst.trim().length === 0}>
              {bezig ? "Opslaan…" : "Opslaan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
