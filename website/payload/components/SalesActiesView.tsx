"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// Sales-assistent V1 (2026-08-14) — overzicht/agenda van Sales-acties. Geen
// ingewikkelde projectplanner (bevestigd, zie de sessie-analyse §16) — een
// simpele, filterbare lijst.
interface SchoolRef {
  id: number;
  schoolName: string;
}

interface SalesActionDoc {
  id: number;
  description: string;
  dueDate: string;
  type: string;
  status: "open" | "afgerond" | "vervallen";
  channel?: string | null;
  school: SchoolRef | number;
}

async function apiGet<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const data = (await res.json()) as { docs?: T[] };
  return data.docs ?? [];
}

function schoolNaam(school: SchoolRef | number): string {
  return typeof school === "number" ? `School #${school}` : school.schoolName;
}
function schoolId(school: SchoolRef | number): number {
  return typeof school === "number" ? school : school.id;
}

type StatusFilter = "open" | "afgerond" | "vervallen" | "alle";

export function SalesActiesView() {
  const [acties, setActies] = useState<SalesActionDoc[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [laden, setLaden] = useState(true);

  const laad = useCallback(async () => {
    setLaden(true);
    const where = filter === "alle" ? "" : `where[status][equals]=${filter}&`;
    const docs = await apiGet<SalesActionDoc>(`/api/sales-actions?${where}depth=1&sort=dueDate&limit=500`);
    setActies(docs);
    setLaden(false);
  }, [filter]);

  useEffect(() => {
    laad();
  }, [laad]);

  return (
    <div className="ml-sales">
      <div className="ml-sales__header">
        <h1>Acties</h1>
        <p>{acties.length} actie{acties.length === 1 ? "" : "s"}.</p>
      </div>

      <div className="ml-sales__filter-balk">
        {(["open", "afgerond", "vervallen", "alle"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className="ml-sales__knop"
            style={filter === f ? { borderColor: "var(--ml-admin-accent)", color: "var(--ml-admin-accent)" } : undefined}
            onClick={() => setFilter(f)}
          >
            {f === "alle" ? "Alle" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {laden ? (
        <div className="ml-sales__leeg">Laden…</div>
      ) : acties.length === 0 ? (
        <div className="ml-sales__leeg">Geen acties in deze weergave.</div>
      ) : (
        <div className="ml-sales__grid">
          {acties.map((actie) => (
            <div className="ml-sales__kaart" key={actie.id}>
              <div className="ml-sales__kaart-header">
                <Link href={`/admin/sales/school?id=${schoolId(actie.school)}`}>{schoolNaam(actie.school)}</Link>
                <span className="ml-sales__badge">{actie.type}</span>
              </div>
              <p className="ml-sales__kaart-tekst">{actie.description}</p>
              <p className="ml-sales__kaart-tekst">
                {actie.dueDate.slice(0, 10)}
                {actie.channel ? ` · ${actie.channel}` : ""} · {actie.status}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
