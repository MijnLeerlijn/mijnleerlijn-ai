"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AdminTrainingRegel } from "@/lib/admin/trainers/trainingen";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import { WEERGAVE_STATUS_KLEUR, VERSLAG_STATUS_KLEUR } from "@/lib/admin/trainers/status-kleuren";
import { AdminStatusBadge } from "./AdminStatusBadge";

// Traineromgeving V2, Fase 4 (2026-08-24) — "Alle trainingen" adminbreed
// (spec §4). Eén fetch van de volledige, admin-brede lijst (de server-route
// ondersteunt ook query-param-filters, maar client-side filteren over de
// al-opgehaalde lijst — zelfde architectuur als SalesScholenView.tsx — geeft
// direct, responsief filtergedrag zonder herhaalde round-trips).

async function apiGetOne<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

const STATUS_LABEL: Record<AdminTrainingRegel["weergaveStatus"], string> = {
  open: "Open",
  vandaag: "Vandaag",
  komend: "Komend",
  verslag_nog_invullen: "Verslag nog invullen",
  gedaan: "Gedaan",
  geannuleerd: "Geannuleerd",
};

const VERSLAG_STATUS_LABEL: Record<NonNullable<AdminTrainingRegel["verslagStatus"]> | "geen", string> = {
  concept: "Concept",
  gedeeltelijk: "Gedeeltelijk",
  bevestigd: "Bevestigd",
  voltooid: "Voltooid",
  geen: "Nog geen verslag",
};

const BRON_LABEL: Record<AdminTrainingRegel["bron"], string> = {
  mijnleerlijn: "MijnLeerlijn",
  aanvullend: "Aanvullend",
};

interface FilterState {
  zoekterm: string;
  status: string;
  verslagStatus: string;
  bron: string;
}
const LEGE_FILTERS: FilterState = { zoekterm: "", status: "", verslagStatus: "", bron: "" };

export function TrainersTrainingenView() {
  const [trainingen, setTrainingen] = useState<AdminTrainingRegel[]>([]);
  const [laden, setLaden] = useState(true);
  const [filters, setFilters] = useState<FilterState>(LEGE_FILTERS);

  // Inline fetch-met-ignore-vlag — zie TrainersOverzichtView.tsx se toelichting bij dezelfde regel.
  useEffect(() => {
    let genegeerd = false;
    apiGetOne<{ trainingen: AdminTrainingRegel[] }>("/api/admin/trainers/trainingen").then((data) => {
      if (genegeerd) return;
      setTrainingen(data?.trainingen ?? []);
      setLaden(false);
    });
    return () => {
      genegeerd = true;
    };
  }, []);

  const zichtbaar = useMemo(() => {
    const term = filters.zoekterm.trim().toLowerCase();
    return trainingen.filter((t) => {
      if (term && !t.trainerNaam.toLowerCase().includes(term) && !t.schoolNaam.toLowerCase().includes(term) && !t.trainingNaam.toLowerCase().includes(term)) return false;
      if (filters.status && t.weergaveStatus !== filters.status) return false;
      if (filters.verslagStatus) {
        if (filters.verslagStatus === "geen" ? t.verslagStatus !== null : t.verslagStatus !== filters.verslagStatus) return false;
      }
      if (filters.bron && t.bron !== filters.bron) return false;
      return true;
    });
  }, [trainingen, filters]);

  return (
    <div className="ml-sales">
      <div className="ml-sales__header">
        <h1>Alle trainingen</h1>
        <p>
          {zichtbaar.length} van {trainingen.length} trainingen (over alle trainers).
        </p>
      </div>

      <div className="ml-sales__filter-balk">
        <input
          type="text"
          placeholder="Zoek op trainer, school of training…"
          value={filters.zoekterm}
          onChange={(e) => setFilters((f) => ({ ...f, zoekterm: e.target.value }))}
          className="ml-sales__zoekveld"
        />
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} style={{ padding: "6px 10px" }}>
          <option value="">Alle statussen</option>
          {Object.entries(STATUS_LABEL).map(([waarde, label]) => (
            <option key={waarde} value={waarde}>
              {label}
            </option>
          ))}
        </select>
        <select value={filters.verslagStatus} onChange={(e) => setFilters((f) => ({ ...f, verslagStatus: e.target.value }))} style={{ padding: "6px 10px" }}>
          <option value="">Alle verslagstatussen</option>
          {Object.entries(VERSLAG_STATUS_LABEL).map(([waarde, label]) => (
            <option key={waarde} value={waarde}>
              {label}
            </option>
          ))}
        </select>
        <select value={filters.bron} onChange={(e) => setFilters((f) => ({ ...f, bron: e.target.value }))} style={{ padding: "6px 10px" }}>
          <option value="">MijnLeerlijn + aanvullend</option>
          {Object.entries(BRON_LABEL).map(([waarde, label]) => (
            <option key={waarde} value={waarde}>
              {label}
            </option>
          ))}
        </select>
        {(filters.zoekterm || filters.status || filters.verslagStatus || filters.bron) && (
          <button type="button" className="ml-sales__knop" onClick={() => setFilters(LEGE_FILTERS)}>
            Wis filters
          </button>
        )}
      </div>

      {laden ? (
        <div className="ml-sales__leeg">Laden…</div>
      ) : zichtbaar.length === 0 ? (
        <div className="ml-sales__leeg">Geen trainingen gevonden.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="ml-sales__tabel">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Trainer</th>
                <th>School</th>
                <th>Training</th>
                <th>Bron</th>
                <th>Status</th>
                <th>Verslagstatus</th>
                <th>Bron verslag</th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map((t, i) => (
                <tr key={`${t.trainerId}-${t.trainingId}-${i}`}>
                  <td className={t.datum ? undefined : "ml-sales__ontbrekend"}>{formatKorteDatum(t.datum)}</td>
                  <td>
                    <Link href={`/admin/trainers/detail?id=${t.trainerId}`}>{t.trainerNaam}</Link>
                  </td>
                  <td>
                    <Link href={`/admin/trainers/school?id=${t.schoolId}`}>{t.schoolNaam}</Link>
                  </td>
                  <td>{t.trainingNaam}</td>
                  <td>{t.bron === "aanvullend" ? <AdminStatusBadge label="Aanvullend" kleur="purple" /> : <span className="ml-sales__ontbrekend">MijnLeerlijn</span>}</td>
                  <td>
                    <AdminStatusBadge label={STATUS_LABEL[t.weergaveStatus]} kleur={WEERGAVE_STATUS_KLEUR[t.weergaveStatus]} />
                  </td>
                  <td>
                    {t.verslagStatus ? (
                      <AdminStatusBadge label={VERSLAG_STATUS_LABEL[t.verslagStatus]} kleur={VERSLAG_STATUS_KLEUR[t.verslagStatus]} />
                    ) : (
                      <span className="ml-sales__ontbrekend">Nog geen verslag</span>
                    )}
                  </td>
                  <td className={t.verslagBron ? undefined : "ml-sales__ontbrekend"}>{t.verslagBron === "telefoon" ? "Telefonisch" : t.verslagBron === "portal" ? "Portal" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
