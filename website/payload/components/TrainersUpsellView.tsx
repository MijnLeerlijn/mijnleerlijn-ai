"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { GraduationCap, School, TrendingUp, type LucideIcon } from "lucide-react";
import type { AdminTrainingRegel } from "@/lib/admin/trainers/trainingen";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import { NAV_COLOR_STYLES, type NavColor } from "@/lib/admin-nav/nav-colors";

// Upsell-ronde (2026-09-02, spec §12) — "Trainingen & upsell": nieuw
// beheer-overzicht. Zelfde "één fetch, client-side filteren/afleiden"-opzet
// als TrainersTrainingenView.tsx — de server (app/api/admin/trainers/upsell/
// route.ts) levert de VOLLEDIGE, ongefilterde rijenlijst + trainerlijst in één
// round-trip (spec §13: geen extra databronaanroep per filterwijziging); elke
// filter/telling/groepering hieronder is pure clientside afleiding via
// useMemo. Trainer-multiselect is een gewone checkboxlijst (geen nieuwe
// UI-library) — elke combinatie ("Wessel alleen", "Wessel+Lonneke", "alle
// trainers") is daarmee triviaal, zonder namen te hoeven hardcoderen.
// Maandtrend is een tabel, geen grafiek — "zonder zware nieuwe
// infrastructuur" (spec §12), geen chart-library toegevoegd.

interface TrainerOptie {
  id: number;
  naam: string;
  actief: boolean;
}

async function apiGetOne<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

interface FilterState {
  trainerIds: Set<number>;
  schoolId: string;
  type: "" | "mijnleerlijn" | "aanvullend";
  vanaf: string;
  tot: string;
}
const LEGE_FILTERS: FilterState = { trainerIds: new Set(), schoolId: "", type: "", vanaf: "", tot: "" };

export function TrainersUpsellView() {
  const [trainingen, setTrainingen] = useState<AdminTrainingRegel[]>([]);
  const [trainerOpties, setTrainerOpties] = useState<TrainerOptie[]>([]);
  const [laden, setLaden] = useState(true);
  const [filters, setFilters] = useState<FilterState>(LEGE_FILTERS);

  useEffect(() => {
    let genegeerd = false;
    apiGetOne<{ trainingen: AdminTrainingRegel[]; trainerOpties: TrainerOptie[] }>("/api/admin/trainers/upsell").then((data) => {
      if (genegeerd) return;
      setTrainingen(data?.trainingen ?? []);
      setTrainerOpties(data?.trainerOpties ?? []);
      setLaden(false);
    });
    return () => {
      genegeerd = true;
    };
  }, []);

  const scholenOpties = useMemo(() => {
    const perSchool = new Map<string, string>();
    for (const t of trainingen) perSchool.set(t.schoolId, t.schoolNaam);
    return Array.from(perSchool.entries())
      .map(([id, naam]) => ({ id, naam }))
      .sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  }, [trainingen]);

  const zichtbaar = useMemo(() => {
    return trainingen.filter((t) => {
      if (filters.trainerIds.size > 0 && !filters.trainerIds.has(t.trainerId)) return false;
      if (filters.schoolId && t.schoolId !== filters.schoolId) return false;
      if (filters.type && t.bron !== filters.type) return false;
      if (filters.vanaf && (t.datum ?? "") < filters.vanaf) return false;
      if (filters.tot && (t.datum ?? "") > filters.tot) return false;
      return true;
    });
  }, [trainingen, filters]);

  const totalen = useMemo(() => {
    const totaalMijnleerlijn = zichtbaar.filter((t) => t.bron === "mijnleerlijn").length;
    const totaalAanvullend = zichtbaar.filter((t) => t.bron === "aanvullend").length;
    const scholenMetAanvullend = new Set(zichtbaar.filter((t) => t.bron === "aanvullend").map((t) => t.schoolId));
    return {
      totaalMijnleerlijn,
      totaalAanvullend,
      aantalScholenMetAanvullend: scholenMetAanvullend.size,
      verhouding: totaalMijnleerlijn > 0 ? Math.round((totaalAanvullend / totaalMijnleerlijn) * 100) / 100 : null,
    };
  }, [zichtbaar]);

  const perTrainer = useMemo(() => {
    const groepen = new Map<number, { trainerId: number; trainerNaam: string; aantalMijnleerlijn: number; aantalAanvullend: number; scholen: Set<string> }>();
    for (const t of zichtbaar) {
      let groep = groepen.get(t.trainerId);
      if (!groep) {
        groep = { trainerId: t.trainerId, trainerNaam: t.trainerNaam, aantalMijnleerlijn: 0, aantalAanvullend: 0, scholen: new Set() };
        groepen.set(t.trainerId, groep);
      }
      if (t.bron === "mijnleerlijn") groep.aantalMijnleerlijn++;
      else {
        groep.aantalAanvullend++;
        groep.scholen.add(t.schoolId);
      }
    }
    return Array.from(groepen.values())
      .map((g) => ({ ...g, aantalScholenMetAanvullend: g.scholen.size }))
      .sort((a, b) => b.aantalAanvullend - a.aantalAanvullend || a.trainerNaam.localeCompare(b.trainerNaam, "nl"));
  }, [zichtbaar]);

  const perSchool = useMemo(() => {
    const groepen = new Map<string, { schoolId: string; schoolNaam: string; aantalMijnleerlijn: number; aantalAanvullend: number }>();
    for (const t of zichtbaar) {
      let groep = groepen.get(t.schoolId);
      if (!groep) {
        groep = { schoolId: t.schoolId, schoolNaam: t.schoolNaam, aantalMijnleerlijn: 0, aantalAanvullend: 0 };
        groepen.set(t.schoolId, groep);
      }
      if (t.bron === "mijnleerlijn") groep.aantalMijnleerlijn++;
      else groep.aantalAanvullend++;
    }
    return Array.from(groepen.values())
      .filter((g) => g.aantalAanvullend > 0)
      .sort((a, b) => b.aantalAanvullend - a.aantalAanvullend || a.schoolNaam.localeCompare(b.schoolNaam, "nl"));
  }, [zichtbaar]);

  const perMaand = useMemo(() => {
    const groepen = new Map<string, { maand: string; aantalMijnleerlijn: number; aantalAanvullend: number }>();
    for (const t of zichtbaar) {
      if (!t.datum) continue;
      const maand = t.datum.slice(0, 7);
      let groep = groepen.get(maand);
      if (!groep) {
        groep = { maand, aantalMijnleerlijn: 0, aantalAanvullend: 0 };
        groepen.set(maand, groep);
      }
      if (t.bron === "mijnleerlijn") groep.aantalMijnleerlijn++;
      else groep.aantalAanvullend++;
    }
    return Array.from(groepen.values()).sort((a, b) => a.maand.localeCompare(b.maand));
  }, [zichtbaar]);

  function toggleTrainer(id: number) {
    setFilters((f) => {
      const nieuw = new Set(f.trainerIds);
      if (nieuw.has(id)) nieuw.delete(id);
      else nieuw.add(id);
      return { ...f, trainerIds: nieuw };
    });
  }

  const filtersActief = filters.trainerIds.size > 0 || filters.schoolId || filters.type || filters.vanaf || filters.tot;

  if (laden) return <div className="ml-sales__leeg">Laden…</div>;

  return (
    <div className="ml-sales">
      <div className="ml-sales__header">
        <h1>Trainingen &amp; upsell</h1>
        <p>MijnLeerlijn-trainingen versus aanvullende trainingen — geen bedragen, uitsluitend aantallen.</p>
      </div>

      <div className="ml-sales__kaarten-rij" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <TotaalKaart label="MijnLeerlijn" waarde={totalen.totaalMijnleerlijn} kleur="blue" icoon={GraduationCap} />
        <TotaalKaart label="Aanvullend" waarde={totalen.totaalAanvullend} kleur="purple" icoon={TrendingUp} />
        <TotaalKaart label="Scholen met aanvullend" waarde={totalen.aantalScholenMetAanvullend} kleur="teal" icoon={School} />
        <div className="ml-sales__kaart" style={{ textAlign: "center", alignItems: "center" }}>
          <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{totalen.verhouding === null ? "—" : totalen.verhouding}</p>
          <p className="ml-sales__kaart-tekst" style={{ margin: 0 }}>
            Aanvullend t.o.v. MijnLeerlijn
          </p>
        </div>
      </div>

      <div className="ml-sales__section">
        <div className="ml-sales__section-titel">
          <h2>Filters</h2>
          {filtersActief && (
            <button type="button" className="ml-sales__knop" onClick={() => setFilters(LEGE_FILTERS)}>
              Wis filters
            </button>
          )}
        </div>
        <div className="ml-sales__filter-balk" style={{ alignItems: "flex-start" }}>
          <div>
            <p className="ml-sales__kaart-tekst" style={{ margin: "0 0 4px" }}>
              Trainers {filters.trainerIds.size > 0 ? `(${filters.trainerIds.size} geselecteerd)` : "(alle)"}
            </p>
            <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--theme-elevation-150)", borderRadius: 6, padding: 8, minWidth: 220 }}>
              {trainerOpties.map((t) => (
                <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 13 }}>
                  <input type="checkbox" checked={filters.trainerIds.has(t.id)} onChange={() => toggleTrainer(t.id)} />
                  {t.naam}
                  {!t.actief && <span className="ml-sales__ontbrekend">(inactief)</span>}
                </label>
              ))}
            </div>
          </div>
          <select value={filters.schoolId} onChange={(e) => setFilters((f) => ({ ...f, schoolId: e.target.value }))} style={{ padding: "6px 10px" }}>
            <option value="">Alle scholen</option>
            {scholenOpties.map((s) => (
              <option key={s.id} value={s.id}>
                {s.naam}
              </option>
            ))}
          </select>
          <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as FilterState["type"] }))} style={{ padding: "6px 10px" }}>
            <option value="">MijnLeerlijn + aanvullend</option>
            <option value="mijnleerlijn">Alleen MijnLeerlijn</option>
            <option value="aanvullend">Alleen aanvullend</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            Vanaf
            <input type="date" value={filters.vanaf} onChange={(e) => setFilters((f) => ({ ...f, vanaf: e.target.value }))} style={{ padding: "5px 8px" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            Tot
            <input type="date" value={filters.tot} onChange={(e) => setFilters((f) => ({ ...f, tot: e.target.value }))} style={{ padding: "5px 8px" }} />
          </label>
        </div>
      </div>

      <div className="ml-sales__section">
        <h2>Verdeling per trainer</h2>
        {perTrainer.length === 0 ? (
          <div className="ml-sales__leeg">Geen trainingen voor deze filters.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ml-sales__tabel">
              <thead>
                <tr>
                  <th>Trainer</th>
                  <th>MijnLeerlijn</th>
                  <th>Aanvullend</th>
                  <th>Scholen met aanvullend</th>
                </tr>
              </thead>
              <tbody>
                {perTrainer.map((r) => (
                  <tr key={r.trainerId}>
                    <td>
                      <Link href={`/admin/trainers/detail?id=${r.trainerId}`}>{r.trainerNaam}</Link>
                    </td>
                    <td>{r.aantalMijnleerlijn}</td>
                    <td>{r.aantalAanvullend}</td>
                    <td>{r.aantalScholenMetAanvullend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ml-sales__section">
        <h2>Scholen met aanvullende trainingen</h2>
        {perSchool.length === 0 ? (
          <div className="ml-sales__leeg">Geen aanvullende trainingen voor deze filters.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ml-sales__tabel">
              <thead>
                <tr>
                  <th>School</th>
                  <th>MijnLeerlijn</th>
                  <th>Aanvullend</th>
                </tr>
              </thead>
              <tbody>
                {perSchool.map((r) => (
                  <tr key={r.schoolId}>
                    <td>
                      <Link href={`/admin/trainers/school?id=${r.schoolId}`}>{r.schoolNaam}</Link>
                    </td>
                    <td>{r.aantalMijnleerlijn}</td>
                    <td>{r.aantalAanvullend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {perMaand.length > 0 && (
        <div className="ml-sales__section">
          <h2>Ontwikkeling per maand</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="ml-sales__tabel">
              <thead>
                <tr>
                  <th>Maand</th>
                  <th>MijnLeerlijn</th>
                  <th>Aanvullend</th>
                </tr>
              </thead>
              <tbody>
                {perMaand.map((r) => (
                  <tr key={r.maand}>
                    <td>{formatKorteDatum(`${r.maand}-01`)}</td>
                    <td>{r.aantalMijnleerlijn}</td>
                    <td>{r.aantalAanvullend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TotaalKaart({ label, waarde, kleur, icoon: Icoon }: { label: string; waarde: number; kleur: NavColor; icoon: LucideIcon }) {
  const stijl = NAV_COLOR_STYLES[kleur];
  return (
    <div className="ml-sales__kaart" style={{ textAlign: "center", alignItems: "center" }}>
      <span className="ml-sales__kaart-icoon" style={{ "--item-fg": stijl.fg, "--item-bg": stijl.bg } as CSSProperties}>
        <Icoon size={15} aria-hidden="true" />
      </span>
      <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: stijl.fg }}>{waarde}</p>
      <p className="ml-sales__kaart-tekst" style={{ margin: 0 }}>
        {label}
      </p>
    </div>
  );
}
