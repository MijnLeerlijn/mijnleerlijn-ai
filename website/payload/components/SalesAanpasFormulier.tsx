"use client";

import { useState } from "react";

// Relatie-analyse V1.1 (2026-08-15) — geëxtraheerd uit
// SalesSchooldetailView.tsx (was daar module-privé) zodat SalesProposalActies
// 'm kan hergebruiken op elk scherm waar een voorstel wordt getoond — één
// implementatie, geen kopie per pagina. De "veld_correctie"-tak (vrije
// tekstinvoer) is bewust VERVALLEN: elk veld_correctie-voorstel in dit
// systeem is een onderwijstype-voorstel (zie enrichment.ts — bevestigd
// scoped op uitsluitend Type school), en daarvoor is SalesOnderwijstypeInstellen
// (een echte variant-picker) strikt beter dan vrije tekst — SalesProposalActies
// toont die daarom i.p.v. dit formulier voor veld_correctie-voorstellen.
const ACTIE_TYPES = ["mail", "bellen", "afspraak", "voorbereiding", "informatie_sturen", "anders"];
const KANALEN = ["mail", "telefoon", "in_persoon", "anders"];

export interface AanpasFormulierVoorstel {
  proposedDate?: string | null;
  proposedType?: string | null;
  proposedChannel?: string | null;
}

export function SalesAanpasFormulier({ voorstel, onBevestig }: { voorstel: AanpasFormulierVoorstel; onBevestig: (waarde: Record<string, string>) => void }) {
  const [datum, setDatum] = useState(voorstel.proposedDate?.slice(0, 10) ?? "");
  const [type, setType] = useState(voorstel.proposedType ?? "anders");
  const [kanaal, setKanaal] = useState(voorstel.proposedChannel ?? "mail");

  return (
    <div className="ml-sales__actie-knoppen" style={{ marginTop: 8, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
      <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={{ padding: "6px 10px", borderRadius: "var(--ml-admin-radius-sm)", border: "1px solid var(--theme-elevation-200)" }} />
      <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: "6px 10px", borderRadius: "var(--ml-admin-radius-sm)", border: "1px solid var(--theme-elevation-200)" }}>
        {ACTIE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select value={kanaal} onChange={(e) => setKanaal(e.target.value)} style={{ padding: "6px 10px", borderRadius: "var(--ml-admin-radius-sm)", border: "1px solid var(--theme-elevation-200)" }}>
        {KANALEN.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <button type="button" className="ml-sales__knop ml-sales__knop--primair" onClick={() => onBevestig({ proposedDate: datum, proposedType: type, proposedChannel: kanaal })}>
        Bevestig aanpassing
      </button>
    </div>
  );
}
