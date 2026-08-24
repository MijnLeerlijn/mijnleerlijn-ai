"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { AlertCircle, type LucideIcon } from "lucide-react";
import type { AdminActiviteitItem, AdminActiviteitSoort } from "@/lib/admin/trainers/activiteit";
import { ACTIVITEIT_LABEL, ACTIVITEIT_ICOON } from "@/lib/trainers/activiteit-styles";
import { formatKorteDatumTijd } from "@/lib/sales/format-datum";
import { NAV_COLOR_STYLES } from "@/lib/admin-nav/nav-colors";
import { activiteitSoortKleur } from "@/lib/admin/trainers/status-kleuren";

// Traineromgeving V2, Fase 4 (2026-08-24) — admin-brede Activiteit (spec
// §6). Hergebruikt ACTIVITEIT_LABEL/-ICOON (lib/trainers/activiteit-styles.ts)
// voor de vier soorten die de trainerportal al kent — uitsluitend
// "telefonie_mislukt" (spec §6: telefonie alleen bij betekenisvolle status,
// zie lib/admin/trainers/activiteit.ts se doc-comment) is hier nieuw en
// krijgt daarom een eigen, lokale icoon/label. ACTIVITEIT_KLEUR (Tailwind-
// klassen, de trainerportal se eigen stylingsysteem) wordt bewust NIET
// hergebruikt — de admin-omgeving gebruikt admin-shell.css/NAV_COLOR_STYLES,
// zie spec §16.

async function apiGetOne<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function labelVoor(soort: AdminActiviteitSoort): string {
  return soort === "telefonie_mislukt" ? "Telefonie mislukt" : ACTIVITEIT_LABEL[soort];
}
function icoonVoor(soort: AdminActiviteitSoort): LucideIcon {
  return soort === "telefonie_mislukt" ? AlertCircle : ACTIVITEIT_ICOON[soort];
}

interface FilterState {
  zoekterm: string;
  soort: string;
}
const LEGE_FILTERS: FilterState = { zoekterm: "", soort: "" };

const ALLE_SOORTEN: AdminActiviteitSoort[] = ["training", "telefonisch", "helpdesk", "overleg", "notitie", "overig", "telefonie_mislukt"];

export function TrainersActiviteitView() {
  const [activiteit, setActiviteit] = useState<AdminActiviteitItem[]>([]);
  const [laden, setLaden] = useState(true);
  const [filters, setFilters] = useState<FilterState>(LEGE_FILTERS);

  useEffect(() => {
    let genegeerd = false;
    apiGetOne<{ activiteit: AdminActiviteitItem[] }>("/api/admin/trainers/activiteit?limiet=200").then((data) => {
      if (genegeerd) return;
      setActiviteit(data?.activiteit ?? []);
      setLaden(false);
    });
    return () => {
      genegeerd = true;
    };
  }, []);

  const zichtbaar = useMemo(() => {
    const term = filters.zoekterm.trim().toLowerCase();
    return activiteit.filter((item) => {
      if (term && !item.trainerNaam.toLowerCase().includes(term) && !item.schoolNaam.toLowerCase().includes(term)) return false;
      if (filters.soort && item.soort !== filters.soort) return false;
      return true;
    });
  }, [activiteit, filters]);

  return (
    <div className="ml-sales">
      <div className="ml-sales__header">
        <h1>Activiteit</h1>
        <p>Chronologische activiteit over alle trainers.</p>
      </div>

      <div className="ml-sales__filter-balk">
        <input
          type="text"
          placeholder="Zoek op trainer of school…"
          value={filters.zoekterm}
          onChange={(e) => setFilters((f) => ({ ...f, zoekterm: e.target.value }))}
          className="ml-sales__zoekveld"
        />
        <select value={filters.soort} onChange={(e) => setFilters((f) => ({ ...f, soort: e.target.value }))} style={{ padding: "6px 10px" }}>
          <option value="">Alle typen</option>
          {ALLE_SOORTEN.map((soort) => (
            <option key={soort} value={soort}>
              {labelVoor(soort)}
            </option>
          ))}
        </select>
        {(filters.zoekterm || filters.soort) && (
          <button type="button" className="ml-sales__knop" onClick={() => setFilters(LEGE_FILTERS)}>
            Wis filters
          </button>
        )}
      </div>

      {laden ? (
        <div className="ml-sales__leeg">Laden…</div>
      ) : zichtbaar.length === 0 ? (
        <div className="ml-sales__leeg">Geen activiteit gevonden.</div>
      ) : (
        <div className="ml-sales__logboek">
          {zichtbaar.map((item, i) => {
            const Icoon = icoonVoor(item.soort);
            const stijl = NAV_COLOR_STYLES[activiteitSoortKleur(item.soort)];
            return (
              <div className="ml-sales__logboek-item" key={i}>
                <span className="ml-sales__kaart-icoon" style={{ "--item-fg": stijl.fg, "--item-bg": stijl.bg } as CSSProperties}>
                  <Icoon size={15} aria-hidden="true" />
                </span>
                <div>
                  <div>
                    <Link href={`/admin/trainers/detail?id=${item.trainerId}`}>{item.trainerNaam}</Link> — {item.titel}
                  </div>
                  <div className="ml-sales__logboek-meta">
                    {formatKorteDatumTijd(item.wanneer)} · {labelVoor(item.soort)} ·{" "}
                    {item.schoolId ? <Link href={`/admin/trainers/school?id=${item.schoolId}`}>{item.schoolNaam}</Link> : item.schoolNaam}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
