"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Rocket } from "lucide-react";
import type { AdminStartbegeleidingSchoolRegel } from "@/lib/admin/trainers/startbegeleiding";
import { AdminStatusBadge } from "./AdminStatusBadge";

// Startbegeleiding-ronde (2026-09-02, spec §D.13) — scholenlijst: nieuwe
// scholen uit Monday (salesstatus "Wacht op handtekening"/"Klant"), verrijkt
// met gekoppelde trainers + open-actietelling. Zelfde enkele-fetch-plus-
// client-side-filter-opzet als TrainersTodoView.tsx — geen filter-round-trip
// nodig voor een lijst van deze grootte (spec §13).

async function apiGetOne<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

const RELATIESTATUS_KLEUR: Record<string, "blue" | "green"> = {
  "Wacht op handtekening": "blue",
  Klant: "green",
};

export function TrainersStartbegeleidingView() {
  const [scholen, setScholen] = useState<AdminStartbegeleidingSchoolRegel[]>([]);
  const [laden, setLaden] = useState(true);
  const [zoekterm, setZoekterm] = useState("");

  useEffect(() => {
    let genegeerd = false;
    apiGetOne<{ scholen: AdminStartbegeleidingSchoolRegel[] }>("/api/admin/trainers/startbegeleiding").then((data) => {
      if (genegeerd) return;
      setScholen(data?.scholen ?? []);
      setLaden(false);
    });
    return () => {
      genegeerd = true;
    };
  }, []);

  const zichtbaar = useMemo(() => {
    const term = zoekterm.trim().toLowerCase();
    if (!term) return scholen;
    return scholen.filter((s) => s.naam.toLowerCase().includes(term));
  }, [scholen, zoekterm]);

  return (
    <div className="ml-sales">
      <div className="ml-sales__header">
        <h1>Startbegeleiding</h1>
        <p>
          {zichtbaar.length} van {scholen.length} scholen die starten of net gestart zijn — afkomstig uit Monday (Wacht op handtekening / Klant).
        </p>
      </div>

      <div className="ml-sales__filter-balk">
        <input type="text" placeholder="Zoek op schoolnaam…" value={zoekterm} onChange={(e) => setZoekterm(e.target.value)} className="ml-sales__zoekveld" />
      </div>

      {laden ? (
        <div className="ml-sales__leeg">Laden…</div>
      ) : zichtbaar.length === 0 ? (
        <div className="ml-sales__leeg">Geen scholen gevonden.</div>
      ) : (
        <div className="ml-sales__grid">
          {zichtbaar.map((school) => (
            <Link href={`/admin/trainers/startbegeleiding/school?id=${school.id}`} key={school.id} className="ml-sales__kaart ml-sales__kaart--accent" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              <div className="ml-sales__kaart-header">
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="ml-sales__kaart-icoon">
                    <Rocket size={15} aria-hidden="true" />
                  </span>
                  <strong>{school.naam}</strong>
                </span>
                <AdminStatusBadge label={school.relatiestatus} kleur={RELATIESTATUS_KLEUR[school.relatiestatus] ?? "slate"} />
              </div>
              <p className="ml-sales__kaart-tekst">{[school.onderwijstype, school.locatie].filter(Boolean).join(" — ") || "—"}</p>
              <p className="ml-sales__kaart-tekst">{school.gekoppeldeTrainerNamen.length > 0 ? `Trainer(s): ${school.gekoppeldeTrainerNamen.join(", ")}` : "Nog geen trainer gekoppeld"}</p>
              {school.aantalOpenStartActies > 0 && <p className="ml-sales__kaart-tekst">{school.aantalOpenStartActies} openstaande actie(s)</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
