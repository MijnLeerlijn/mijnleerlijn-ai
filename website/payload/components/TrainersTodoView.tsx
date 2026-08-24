"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { AdminTodoItem } from "@/lib/admin/trainers/todo";
import { TODO_ICOON, TODO_CTA_LABEL, todoTijdLabel } from "@/lib/trainers/todo-styles";
import { NAV_COLOR_STYLES, hexNaarRgba } from "@/lib/admin-nav/nav-colors";
import { TODO_SOORT_KLEUR } from "@/lib/admin/trainers/status-kleuren";
import { AdminStatusBadge } from "./AdminStatusBadge";

// Traineromgeving V2, Fase 4 (2026-08-24) — adminbreed To do (spec §5).
// Hergebruikt TODO_ICOON/TODO_CTA_LABEL/todoTijdLabel (lib/trainers/
// todo-styles.ts) 1-op-1 — zelfde weergavebewoording als de trainerportal,
// geen tweede interpretatie. "CTA" hier is uitsluitend een doorklik naar de
// (read-only) trainerdetailpagina — spec §8: admin mag doorkijken, nooit
// namens de trainer een verslag afronden/bewerken, dus GEEN link naar de
// trainerportal se eigen bewerk-URL (die ligt bovendien op een ander,
// voor de admin-sessie onbereikbaar (sub)domein/auth-mechanisme).

async function apiGetOne<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

interface FilterState {
  zoekterm: string;
  soort: string;
}
const LEGE_FILTERS: FilterState = { zoekterm: "", soort: "" };

const SOORT_LABEL: Record<AdminTodoItem["soort"], string> = {
  telefonisch_concept: "Telefonisch concept",
  verslag_vastgelopen: "Verslag vastgelopen",
  concept_gestart: "Concept gestart",
  verslag_ontbreekt: "Verslag ontbreekt",
};

export function TrainersTodoView() {
  const [todo, setTodo] = useState<AdminTodoItem[]>([]);
  const [laden, setLaden] = useState(true);
  const [filters, setFilters] = useState<FilterState>(LEGE_FILTERS);

  // Inline fetch-met-ignore-vlag — zie TrainersOverzichtView.tsx se toelichting bij dezelfde regel.
  useEffect(() => {
    let genegeerd = false;
    apiGetOne<{ todo: AdminTodoItem[] }>("/api/admin/trainers/todo").then((data) => {
      if (genegeerd) return;
      setTodo(data?.todo ?? []);
      setLaden(false);
    });
    return () => {
      genegeerd = true;
    };
  }, []);

  const zichtbaar = useMemo(() => {
    const term = filters.zoekterm.trim().toLowerCase();
    return todo.filter((item) => {
      if (term && !item.trainerNaam.toLowerCase().includes(term) && !item.schoolNaam.toLowerCase().includes(term)) return false;
      if (filters.soort && item.soort !== filters.soort) return false;
      return true;
    });
  }, [todo, filters]);

  return (
    <div className="ml-sales">
      <div className="ml-sales__header">
        <h1>To do</h1>
        <p>
          {zichtbaar.length} van {todo.length} openstaande acties (over alle trainers).
        </p>
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
          {Object.entries(SOORT_LABEL).map(([waarde, label]) => (
            <option key={waarde} value={waarde}>
              {label}
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
        <div className="ml-sales__leeg">Geen openstaande acties.</div>
      ) : (
        <div className="ml-sales__grid">
          {zichtbaar.map((item, i) => {
            const Icoon = TODO_ICOON[item.soort];
            const kleur = TODO_SOORT_KLEUR[item.soort];
            const stijl = NAV_COLOR_STYLES[kleur];
            return (
              <div
                className="ml-sales__kaart ml-sales__kaart--accent"
                key={`${item.trainerId}-${item.trainingId}-${i}`}
                style={{ "--item-fg": stijl.fg, "--item-bg": hexNaarRgba(stijl.fg, 0.06) } as CSSProperties}
              >
                <div className="ml-sales__kaart-header">
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="ml-sales__kaart-icoon" style={{ "--item-fg": stijl.fg, "--item-bg": stijl.bg } as CSSProperties}>
                      <Icoon size={15} aria-hidden="true" />
                    </span>
                    <strong>{item.trainingNaam}</strong>
                  </span>
                  <AdminStatusBadge label={SOORT_LABEL[item.soort]} kleur={kleur} />
                </div>
                <p className="ml-sales__kaart-tekst">{item.schoolNaam}</p>
                <p className="ml-sales__kaart-tekst">
                  <Link href={`/admin/trainers/detail?id=${item.trainerId}`}>{item.trainerNaam}</Link>
                </p>
                <p className="ml-sales__logboek-meta">{todoTijdLabel(item)}</p>
                <Link href={`/admin/trainers/detail?id=${item.trainerId}&tab=verslagen`} className="ml-sales__knop" style={{ marginTop: 8, display: "inline-block" }}>
                  {TODO_CTA_LABEL[item.soort]} bekijken
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
