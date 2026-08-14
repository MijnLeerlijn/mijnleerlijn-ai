"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// Sales-assistent V1 (2026-08-14) — overzicht van alle scholen uit Monday.
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

async function apiGet<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const data = (await res.json()) as { docs?: T[] };
  return data.docs ?? [];
}

function onderwijstypeLabel(waarde: SalesSchoolDoc["onderwijstype"]): string {
  if (!waarde) return "—";
  return typeof waarde === "number" ? `#${waarde}` : waarde.name;
}

type Filter = "alle" | "actie_nodig" | "ai_voorstel" | "geen_volgende_actie" | "afgesloten";

export function SalesScholenView() {
  const [scholen, setScholen] = useState<SalesSchoolDoc[]>([]);
  const [zoekterm, setZoekterm] = useState("");
  const [filter, setFilter] = useState<Filter>("alle");
  const [laden, setLaden] = useState(true);

  const laad = useCallback(async () => {
    setLaden(true);
    const docs = await apiGet<SalesSchoolDoc>(`/api/sales-schools?depth=1&sort=schoolName&limit=1000`);
    setScholen(docs);
    setLaden(false);
  }, []);

  useEffect(() => {
    laad();
  }, [laad]);

  const zichtbaar = scholen.filter((s) => {
    if (zoekterm && !s.schoolName.toLowerCase().includes(zoekterm.toLowerCase()) && !(s.plaats ?? "").toLowerCase().includes(zoekterm.toLowerCase())) {
      return false;
    }
    if (filter === "afgesloten") return !s.actief;
    if (filter === "geen_volgende_actie") return s.actief && !s.mondayVolgendeActieDatum;
    if (filter === "alle") return true;
    return s.actief; // actie_nodig/ai_voorstel: geavanceerdere filtering vereist een join met acties/voorstellen — hier vereenvoudigd tot "actief", verfijning is een vervolgstap
  });

  return (
    <div className="ml-sales">
      <div className="ml-sales__header">
        <h1>Scholen</h1>
        <p>{scholen.length} scholen gesynchroniseerd vanuit Monday.</p>
      </div>

      <div className="ml-sales__filter-balk">
        <input
          type="text"
          placeholder="Zoek op schoolnaam of plaats…"
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: "var(--ml-admin-radius-sm)", border: "1px solid var(--theme-elevation-200)", minWidth: "220px" }}
        />
        {(["alle", "actie_nodig", "geen_volgende_actie", "afgesloten"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className="ml-sales__knop"
            style={filter === f ? { borderColor: "var(--ml-admin-accent)", color: "var(--ml-admin-accent)" } : undefined}
            onClick={() => setFilter(f)}
          >
            {f === "alle" ? "Alle" : f === "actie_nodig" ? "Actief" : f === "geen_volgende_actie" ? "Geen volgende actie" : "Afgesloten"}
          </button>
        ))}
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
                <th>Onderwijstype</th>
                <th>Laatste activiteit</th>
                <th>Relatiestatus</th>
                <th>Salesfase</th>
                <th>Volgende actie (Monday)</th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map((school) => (
                <tr key={school.id}>
                  <td>
                    <Link href={`/admin/sales/school?id=${school.id}`}>{school.schoolName}</Link>
                    {school.plaats && <div className="ml-sales__logboek-meta">{school.plaats}</div>}
                  </td>
                  <td>{onderwijstypeLabel(school.onderwijstype)}</td>
                  <td>{school.lastMondayActivityAt ? school.lastMondayActivityAt.slice(0, 10) : "—"}</td>
                  <td>{school.relatiestatus ?? "—"}</td>
                  <td>{school.salesfase ?? "—"}</td>
                  <td>{school.mondayVolgendeActieDatum ? school.mondayVolgendeActieDatum.slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
