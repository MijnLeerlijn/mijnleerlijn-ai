"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RelatiestatusBadge } from "./RelatiestatusBadge";
import { RELATIESTATUS_BADGE } from "@/lib/sales/relatiestatus-badge";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import { PENDING_VOORSTEL_TYPES_VOOR_AANDACHT } from "@/lib/sales/aandacht-nodig";

// Sales UX V2 (2026-08-14) — echte CRM-werklijst: combineerbare filters
// i.p.v. de vorige single-select ("actie_nodig"/"ai_voorstel" vielen daar
// terug op alleen "actief" — zie de sessiegeschiedenis). Elke filterregel
// hieronder werkt onafhankelijk en met EN gecombineerd, zodat bv. "Prospect
// + geen volgende actie" mogelijk is.
interface VariantRef {
  id: number;
  name: string;
}

interface SalesSchoolDoc {
  id: number;
  schoolName: string;
  plaats?: string | null;
  relatiestatus?: string | null;
  salesfase?: string | null;
  onderwijstype?: VariantRef | number | null;
  lastMondayActivityAt?: string | null;
  mondayVolgendeActieDatum?: string | null;
  actief: boolean;
}

interface SalesActionDoc {
  id: number;
  status: string;
  dueDate: string;
  school: number | { id: number };
}

interface SalesProposalDoc {
  id: number;
  status: string;
  proposalType: string;
  school: number | { id: number };
}

async function apiGet<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const data = (await res.json()) as { docs?: T[] };
  return data.docs ?? [];
}

function idVan(waarde: number | { id: number }): number {
  return typeof waarde === "number" ? waarde : waarde.id;
}

function onderwijstypeLabel(waarde: SalesSchoolDoc["onderwijstype"]): string {
  if (!waarde) return "—";
  return typeof waarde === "number" ? `#${waarde}` : waarde.name;
}

function onderwijstypeId(waarde: SalesSchoolDoc["onderwijstype"]): string | null {
  if (!waarde) return null;
  return String(typeof waarde === "number" ? waarde : waarde.id);
}

interface FilterState {
  zoekterm: string;
  relatiestatussen: string[];
  onderwijstypeId: string;
  volgendeActie: "alle" | "wel" | "geen";
  laatsteContact: "alle" | "30" | "90" | "nooit";
  alleenAandachtNodig: boolean;
}

const LEGE_FILTERS: FilterState = {
  zoekterm: "",
  relatiestatussen: [],
  onderwijstypeId: "",
  volgendeActie: "alle",
  laatsteContact: "alle",
  alleenAandachtNodig: false,
};

export function SalesScholenView() {
  const [scholen, setScholen] = useState<SalesSchoolDoc[]>([]);
  const [varianten, setVarianten] = useState<VariantRef[]>([]);
  const [volgendeActiePerSchool, setVolgendeActiePerSchool] = useState<Map<number, string>>(new Map());
  const [aandachtNodigIds, setAandachtNodigIds] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterState>(LEGE_FILTERS);
  const [laden, setLaden] = useState(true);

  const laad = useCallback(async () => {
    setLaden(true);
    const [docs, variantDocs, openActies, pendingVoorstellen] = await Promise.all([
      apiGet<SalesSchoolDoc>(`/api/sales-schools?depth=1&sort=schoolName&limit=1000`),
      apiGet<VariantRef>(`/api/variants?limit=100&sort=name&depth=0`),
      apiGet<SalesActionDoc>(`/api/sales-actions?where[status][equals]=open&depth=0&limit=2000`),
      apiGet<SalesProposalDoc>(`/api/sales-proposals?where[status][equals]=pending&depth=0&limit=2000`),
    ]);
    setScholen(docs);
    setVarianten(variantDocs);

    // Eén "volgende actie"-datum per school: de open Sales-actie (meest
    // concreet/actueel) heeft voorrang boven de Monday-gecachte datum.
    const volgendeActie = new Map<number, string>();
    for (const doc of docs) {
      if (doc.mondayVolgendeActieDatum) volgendeActie.set(doc.id, doc.mondayVolgendeActieDatum);
    }
    for (const actie of openActies) {
      const id = idVan(actie.school);
      const huidig = volgendeActie.get(id);
      if (!huidig || actie.dueDate < huidig) volgendeActie.set(id, actie.dueDate);
    }
    setVolgendeActiePerSchool(volgendeActie);

    const schoolIdsMetActie = new Set(openActies.map((a) => idVan(a.school)));
    const schoolIdsMetVoorstel = new Set(
      pendingVoorstellen.filter((p) => (PENDING_VOORSTEL_TYPES_VOOR_AANDACHT as readonly string[]).includes(p.proposalType)).map((p) => idVan(p.school))
    );
    setAandachtNodigIds(new Set(docs.filter((s) => s.actief && !schoolIdsMetActie.has(s.id) && !schoolIdsMetVoorstel.has(s.id)).map((s) => s.id)));

    setLaden(false);
  }, []);

  useEffect(() => {
    laad();
  }, [laad]);

  function toggleRelatiestatus(waarde: string) {
    setFilters((f) => ({
      ...f,
      relatiestatussen: f.relatiestatussen.includes(waarde) ? f.relatiestatussen.filter((r) => r !== waarde) : [...f.relatiestatussen, waarde],
    }));
  }

  const zichtbaar = useMemo(() => {
    const vandaag = new Date();
    return scholen.filter((s) => {
      if (filters.zoekterm && !s.schoolName.toLowerCase().includes(filters.zoekterm.toLowerCase()) && !(s.plaats ?? "").toLowerCase().includes(filters.zoekterm.toLowerCase())) {
        return false;
      }
      if (filters.relatiestatussen.length > 0 && !filters.relatiestatussen.includes(s.relatiestatus ?? "")) return false;
      if (filters.onderwijstypeId && onderwijstypeId(s.onderwijstype) !== filters.onderwijstypeId) return false;

      const volgendeActieDatum = volgendeActiePerSchool.get(s.id) ?? null;
      if (filters.volgendeActie === "wel" && !volgendeActieDatum) return false;
      if (filters.volgendeActie === "geen" && volgendeActieDatum) return false;

      if (filters.laatsteContact !== "alle") {
        if (filters.laatsteContact === "nooit") {
          if (s.lastMondayActivityAt) return false;
        } else {
          if (!s.lastMondayActivityAt) return false;
          const dagenGeleden = (vandaag.getTime() - new Date(s.lastMondayActivityAt).getTime()) / (1000 * 60 * 60 * 24);
          const drempel = filters.laatsteContact === "30" ? 30 : 90;
          if (dagenGeleden < drempel) return false;
        }
      }

      if (filters.alleenAandachtNodig && !aandachtNodigIds.has(s.id)) return false;

      return true;
    });
  }, [scholen, filters, volgendeActiePerSchool, aandachtNodigIds]);

  return (
    <div className="ml-sales">
      <div className="ml-sales__header">
        <h1>Scholen</h1>
        <p>
          {zichtbaar.length} van {scholen.length} scholen.
        </p>
      </div>

      <div className="ml-sales__filter-balk">
        <input
          type="text"
          placeholder="Zoek op schoolnaam of plaats…"
          value={filters.zoekterm}
          onChange={(e) => setFilters((f) => ({ ...f, zoekterm: e.target.value }))}
          style={{ padding: "6px 10px", borderRadius: "var(--ml-admin-radius-sm)", border: "1px solid var(--theme-elevation-200)", minWidth: "200px" }}
        />
        {Object.keys(RELATIESTATUS_BADGE).map((waarde) => (
          <button
            key={waarde}
            type="button"
            className="ml-sales__knop"
            style={filters.relatiestatussen.includes(waarde) ? { borderColor: "var(--ml-admin-accent)", color: "var(--ml-admin-accent)", fontWeight: 700 } : undefined}
            onClick={() => toggleRelatiestatus(waarde)}
          >
            {waarde}
          </button>
        ))}
        <select value={filters.onderwijstypeId} onChange={(e) => setFilters((f) => ({ ...f, onderwijstypeId: e.target.value }))} style={{ padding: "6px 10px" }}>
          <option value="">Alle onderwijstypen</option>
          {varianten.map((v) => (
            <option key={v.id} value={String(v.id)}>
              {v.name}
            </option>
          ))}
        </select>
        <select value={filters.volgendeActie} onChange={(e) => setFilters((f) => ({ ...f, volgendeActie: e.target.value as FilterState["volgendeActie"] }))} style={{ padding: "6px 10px" }}>
          <option value="alle">Volgende actie: alle</option>
          <option value="wel">Heeft volgende actie</option>
          <option value="geen">Geen volgende actie</option>
        </select>
        <select value={filters.laatsteContact} onChange={(e) => setFilters((f) => ({ ...f, laatsteContact: e.target.value as FilterState["laatsteContact"] }))} style={{ padding: "6px 10px" }}>
          <option value="alle">Laatste contact: alle</option>
          <option value="30">Langer dan 30 dagen geleden</option>
          <option value="90">Langer dan 90 dagen geleden</option>
          <option value="nooit">Nog nooit</option>
        </select>
        <button
          type="button"
          className="ml-sales__knop"
          style={filters.alleenAandachtNodig ? { borderColor: "var(--ml-admin-accent)", color: "var(--ml-admin-accent)", fontWeight: 700 } : undefined}
          onClick={() => setFilters((f) => ({ ...f, alleenAandachtNodig: !f.alleenAandachtNodig }))}
        >
          Aandacht nodig
        </button>
        {(filters.zoekterm || filters.relatiestatussen.length > 0 || filters.onderwijstypeId || filters.volgendeActie !== "alle" || filters.laatsteContact !== "alle" || filters.alleenAandachtNodig) && (
          <button type="button" className="ml-sales__knop" onClick={() => setFilters(LEGE_FILTERS)}>
            Wis filters
          </button>
        )}
      </div>

      {laden ? (
        <div className="ml-sales__leeg">Laden…</div>
      ) : zichtbaar.length === 0 ? (
        <div className="ml-sales__leeg">Geen scholen gevonden.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="ml-sales__tabel">
            <thead>
              <tr>
                <th>School</th>
                <th>Relatiestatus</th>
                <th>Onderwijstype</th>
                <th>Plaats</th>
                <th>Laatste contact</th>
                <th>Volgende actie</th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map((school) => (
                <tr key={school.id}>
                  <td>
                    <Link href={`/admin/sales/school?id=${school.id}`}>{school.schoolName}</Link>
                  </td>
                  <td>
                    <RelatiestatusBadge relatiestatus={school.relatiestatus} />
                  </td>
                  <td>{onderwijstypeLabel(school.onderwijstype)}</td>
                  <td>{school.plaats || "—"}</td>
                  <td className={school.lastMondayActivityAt ? undefined : "ml-sales__ontbrekend"}>{formatKorteDatum(school.lastMondayActivityAt)}</td>
                  <td className={volgendeActiePerSchool.has(school.id) ? undefined : "ml-sales__ontbrekend"}>{formatKorteDatum(volgendeActiePerSchool.get(school.id))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
