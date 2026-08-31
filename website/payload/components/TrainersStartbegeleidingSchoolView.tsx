"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { AdminStartbegeleidingSchoolDetail } from "@/lib/admin/trainers/startbegeleiding";
import { STARTACTIE_LABEL, type StartactieType } from "@/lib/trainers/startbegeleiding";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import { AdminStatusBadge } from "./AdminStatusBadge";

// Startbegeleiding-ronde (2026-09-02, spec §D.14/§E) — schooldetail: AI-
// samenvatting (on-demand), gekoppelde trainers + "Koppel trainer" (Actie 2,
// echte Monday-schrijving), openstaande acties van deze school + "Nieuwe
// actie" (Actie 1, 100% lokaal). Zelfde Suspense+useSearchParams-opzet als
// SchoolDetailView.tsx (?id=), maar bewust GEEN tabs — deze pagina heeft maar
// één scherm-vol content, geen zeven tabbladen zoals de bredere Schooldetail.

async function apiGetOne<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

const RELATIESTATUS_KLEUR: Record<string, "blue" | "green"> = {
  "Wacht op handtekening": "blue",
  Klant: "green",
};

function SchoolDetailInner() {
  const params = useSearchParams();
  const schoolId = params.get("id");
  if (!schoolId) return <div className="ml-sales__leeg">Geen school-ID opgegeven.</div>;
  // Key-based remount bij schoolwissel (zelfde patroon als SchoolDetailView.tsx
  // se DetailVoorSchool) — laat elke useState hieronder gewoon opnieuw zijn
  // initiële waarde pakken i.p.v. handmatig te resetten in een effect (dat
  // laatste triggert react-hooks/set-state-in-effect, en cascadeert nodeloos).
  return <StartbegeleidingSchoolDetail key={schoolId} schoolId={schoolId} />;
}

function StartbegeleidingSchoolDetail({ schoolId }: { schoolId: string }) {
  const [detail, setDetail] = useState<AdminStartbegeleidingSchoolDetail | null>(null);
  const [laden, setLaden] = useState(true);
  const [nietGevonden, setNietGevonden] = useState(false);

  const [samenvatting, setSamenvatting] = useState<string | null>(null);
  const [samenvattingLaden, setSamenvattingLaden] = useState(false);
  const [samenvattingFout, setSamenvattingFout] = useState<string | null>(null);

  const [koppelOpen, setKoppelOpen] = useState(false);
  const [koppelTrainerId, setKoppelTrainerId] = useState("");
  const [koppelBezig, setKoppelBezig] = useState(false);
  const [koppelBoodschap, setKoppelBoodschap] = useState<string | null>(null);

  const [actieOpen, setActieOpen] = useState(false);
  const [actieTrainerId, setActieTrainerId] = useState("");
  const [actieType, setActieType] = useState<StartactieType>("intake");
  const [actieDeadline, setActieDeadline] = useState("");
  const [actieGespreksDatum, setActieGespreksDatum] = useState("");
  const [actieInstructie, setActieInstructie] = useState("");
  const [actieBezig, setActieBezig] = useState(false);
  const [actieFout, setActieFout] = useState<string | null>(null);

  const [statusBezigVoorId, setStatusBezigVoorId] = useState<number | null>(null);

  // Herbruikbare refresh (na een mutatie — koppel/maakActie/wijzigStatus
  // hieronder roepen dit rechtstreeks aan, buiten een effect, dus zonder
  // react-hooks/set-state-in-effect-risico).
  const laadDetail = useCallback(async () => {
    const data = await apiGetOne<AdminStartbegeleidingSchoolDetail>(`/api/admin/trainers/startbegeleiding/school?id=${encodeURIComponent(schoolId)}`);
    if (!data) {
      setNietGevonden(true);
    } else {
      setDetail(data);
    }
    setLaden(false);
  }, [schoolId]);

  // Inline fetch-met-ignore-vlag voor de EERSTE lading — zelfde patroon als
  // TrainersTodoView.tsx/TrainersOverzichtView.tsx: de setState-aanroepen
  // zitten in een .then()-callback (dus ná de async grens), niet
  // synchroon in het effect-lichaam zelf.
  useEffect(() => {
    let genegeerd = false;
    apiGetOne<AdminStartbegeleidingSchoolDetail>(`/api/admin/trainers/startbegeleiding/school?id=${encodeURIComponent(schoolId)}`).then((data) => {
      if (genegeerd) return;
      if (!data) setNietGevonden(true);
      else setDetail(data);
      setLaden(false);
    });
    return () => {
      genegeerd = true;
    };
  }, [schoolId]);

  async function genereerSamenvatting() {
    setSamenvattingLaden(true);
    setSamenvattingFout(null);
    try {
      const res = await fetch(`/api/admin/trainers/startbegeleiding/samenvatting?id=${encodeURIComponent(schoolId)}`, { credentials: "include" });
      const data = (await res.json()) as { samenvatting?: string; error?: string };
      if (!res.ok || !data.samenvatting) {
        setSamenvattingFout(data.error ?? "Samenvatting genereren mislukt.");
      } else {
        setSamenvatting(data.samenvatting);
      }
    } catch {
      setSamenvattingFout("Samenvatting genereren mislukt.");
    } finally {
      setSamenvattingLaden(false);
    }
  }

  async function koppel() {
    if (!koppelTrainerId) return;
    setKoppelBezig(true);
    setKoppelBoodschap(null);
    try {
      const res = await fetch("/api/admin/trainers/startbegeleiding/koppel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mondaySchoolId: schoolId, trainerId: Number(koppelTrainerId) }),
      });
      const data = (await res.json()) as { boodschap?: string; error?: string };
      setKoppelBoodschap(data.boodschap ?? data.error ?? "Onbekende uitkomst.");
      if (res.ok) {
        setKoppelOpen(false);
        setKoppelTrainerId("");
        await laadDetail();
      }
    } finally {
      setKoppelBezig(false);
    }
  }

  async function maakActie() {
    if (!actieTrainerId || !actieDeadline) return;
    setActieBezig(true);
    setActieFout(null);
    try {
      const res = await fetch("/api/admin/trainers/startbegeleiding/actie", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mondaySchoolId: schoolId,
          schoolNaam: detail?.school.naam ?? null,
          trainerId: Number(actieTrainerId),
          actieType,
          instructie: actieInstructie.trim() || null,
          deadline: actieDeadline,
          gespreksDatum: actieGespreksDatum || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setActieFout(data.error ?? "Actie aanmaken mislukt.");
        return;
      }
      setActieOpen(false);
      setActieTrainerId("");
      setActieDeadline("");
      setActieGespreksDatum("");
      setActieInstructie("");
      setActieType("intake");
      await laadDetail();
    } finally {
      setActieBezig(false);
    }
  }

  async function wijzigStatus(id: number, status: "afgerond" | "vervallen") {
    setStatusBezigVoorId(id);
    try {
      const res = await fetch(`/api/admin/trainers/startbegeleiding/actie/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await laadDetail();
    } finally {
      setStatusBezigVoorId(null);
    }
  }

  if (laden) return <div className="ml-sales__leeg">Laden…</div>;
  if (nietGevonden || !detail) return <div className="ml-sales__leeg">School niet gevonden (of valt niet meer onder Startbegeleiding).</div>;

  const { school, gekoppeldeTrainers, openStartActies, trainerOpties } = detail;

  return (
    <div className="ml-sales">
      <div className="ml-sales__schooldetail-header">
        <div>
          <Link href="/admin/trainers/startbegeleiding">← Terug naar Startbegeleiding</Link>
          <h1>{school.naam}</h1>
          <p className="ml-sales__schooldetail-meta">{[school.onderwijstype, school.locatie].filter(Boolean).join(" — ") || "—"}</p>
        </div>
        <AdminStatusBadge label={school.relatiestatus} kleur={RELATIESTATUS_KLEUR[school.relatiestatus] ?? "slate"} />
      </div>

      <div className="ml-sales__section">
        <div className="ml-sales__section-titel">Samenvatting</div>
        {samenvatting ? (
          <p className="ml-sales__kaart-tekst">{samenvatting}</p>
        ) : (
          <button type="button" className="ml-sales__knop" onClick={genereerSamenvatting} disabled={samenvattingLaden}>
            {samenvattingLaden ? "Bezig…" : "Genereer samenvatting"}
          </button>
        )}
        {samenvattingFout && <p className="ml-sales__kaart-tekst">{samenvattingFout}</p>}
      </div>

      <div className="ml-sales__section">
        <div className="ml-sales__section-titel">Gekoppelde trainers</div>
        {gekoppeldeTrainers.length === 0 ? <p className="ml-sales__kaart-tekst">Nog geen trainer gekoppeld.</p> : <p className="ml-sales__kaart-tekst">{gekoppeldeTrainers.map((t) => t.naam).join(", ")}</p>}
        {koppelBoodschap && <p className="ml-sales__kaart-tekst">{koppelBoodschap}</p>}
        {koppelOpen ? (
          <div className="ml-sales__plan-actie-form">
            <select value={koppelTrainerId} onChange={(e) => setKoppelTrainerId(e.target.value)}>
              <option value="">Kies trainer…</option>
              {trainerOpties.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.naam}
                  {!t.actief ? " (inactief)" : ""}
                </option>
              ))}
            </select>
            <div className="ml-sales__actie-knoppen">
              <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={koppelBezig || !koppelTrainerId} onClick={koppel}>
                {koppelBezig ? "Bezig…" : "Koppelen"}
              </button>
              <button type="button" className="ml-sales__knop" onClick={() => setKoppelOpen(false)} disabled={koppelBezig}>
                Annuleren
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="ml-sales__knop" onClick={() => setKoppelOpen(true)}>
            Koppel een trainer
          </button>
        )}
      </div>

      <div className="ml-sales__section">
        <div className="ml-sales__section-titel">Openstaande acties</div>
        {openStartActies.length === 0 ? (
          <p className="ml-sales__kaart-tekst">Geen openstaande acties.</p>
        ) : (
          <div className="ml-sales__grid">
            {openStartActies.map((actie) => (
              <div className="ml-sales__kaart" key={actie.id}>
                <div className="ml-sales__kaart-header">
                  <strong>{STARTACTIE_LABEL[actie.actieType]}</strong>
                </div>
                <p className="ml-sales__kaart-tekst">Trainer: {actie.trainerNaam}</p>
                <p className="ml-sales__kaart-tekst">Deadline: {formatKorteDatum(actie.deadline)}</p>
                {actie.gespreksDatum && <p className="ml-sales__kaart-tekst">Gesprek op: {formatKorteDatum(actie.gespreksDatum)}</p>}
                {actie.instructie && <p className="ml-sales__kaart-tekst">{actie.instructie}</p>}
                <div className="ml-sales__actie-knoppen">
                  <button type="button" className="ml-sales__knop" disabled={statusBezigVoorId === actie.id} onClick={() => wijzigStatus(actie.id, "afgerond")}>
                    Afgerond
                  </button>
                  <button type="button" className="ml-sales__knop ml-sales__knop--gevaar" disabled={statusBezigVoorId === actie.id} onClick={() => wijzigStatus(actie.id, "vervallen")}>
                    Vervallen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {actieOpen ? (
          <div className="ml-sales__plan-actie-form">
            <select value={actieTrainerId} onChange={(e) => setActieTrainerId(e.target.value)}>
              <option value="">Kies trainer…</option>
              {trainerOpties.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.naam}
                  {!t.actief ? " (inactief)" : ""}
                </option>
              ))}
            </select>
            <select value={actieType} onChange={(e) => setActieType(e.target.value as StartactieType)}>
              {Object.entries(STARTACTIE_LABEL).map(([waarde, label]) => (
                <option key={waarde} value={waarde}>
                  {label}
                </option>
              ))}
            </select>
            <input type="date" value={actieDeadline} onChange={(e) => setActieDeadline(e.target.value)} title="Deadline" />
            <input type="date" value={actieGespreksDatum} onChange={(e) => setActieGespreksDatum(e.target.value)} title="Gespreksdatum (optioneel)" />
            <input type="text" placeholder="Korte instructie (optioneel)" value={actieInstructie} onChange={(e) => setActieInstructie(e.target.value)} maxLength={1000} />
            {actieFout && <p className="ml-sales__kaart-tekst">{actieFout}</p>}
            <div className="ml-sales__actie-knoppen">
              <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={actieBezig || !actieTrainerId || !actieDeadline} onClick={maakActie}>
                {actieBezig ? "Bezig…" : "Opslaan"}
              </button>
              <button type="button" className="ml-sales__knop" onClick={() => setActieOpen(false)} disabled={actieBezig}>
                Annuleren
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="ml-sales__knop" onClick={() => setActieOpen(true)} style={{ marginTop: 8 }}>
            Nog iets nodig voor de start
          </button>
        )}
      </div>
    </div>
  );
}

export function TrainersStartbegeleidingSchoolView() {
  return (
    <Suspense fallback={<div className="ml-sales__leeg">Laden…</div>}>
      <SchoolDetailInner />
    </Suspense>
  );
}
