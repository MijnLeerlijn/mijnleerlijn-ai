"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Sales UX V2 (2026-08-14) — kleine, herbruikbare "Plan actie"-knop voor
// scholen zonder bestaand AI-voorstel (widget-tier 4 / Vandaag "Aandacht
// nodig"). Post rechtstreeks naar Payload's eigen sales-actions-REST-API
// (al anyEditor-creatable, createdBy wordt server-side automatisch gezet —
// zie SalesActions.ts se beforeChange-hook) — geen nieuwe eigen route nodig.
// router.refresh() ververst de omliggende server component (BeheerDashboard/
// SalesVandaagView) zodat de school na het plannen uit deze lijst verdwijnt.
const ACTIE_TYPES = [
  { value: "mail", label: "Mail" },
  { value: "bellen", label: "Bellen" },
  { value: "afspraak", label: "Afspraak" },
  { value: "voorbereiding", label: "Voorbereiding" },
  { value: "informatie_sturen", label: "Informatie sturen" },
  { value: "anders", label: "Anders" },
];

// Sales UX-ronde 3 (2026-08-14) — optionele onGepland-callback toegevoegd:
// router.refresh() ververst alleen server-gerenderde data, niet het
// client-fetched state van SalesDashboardPaneel.tsx (nieuwe "To do"-tab).
// Bestaand gebruik (SalesVandaagView.tsx) geeft geen onGepland mee en
// behoudt dus exact het bestaande router.refresh()-gedrag.
export function PlanActieKnop({ schoolId, onGepland }: { schoolId: number; onGepland?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("bellen");
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [omschrijving, setOmschrijving] = useState("");
  const [bezig, setBezig] = useState(false);

  async function plan() {
    if (!omschrijving.trim()) return;
    setBezig(true);
    try {
      const res = await fetch("/api/sales-actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school: schoolId, type, dueDate: datum, description: omschrijving.trim(), status: "open" }),
      });
      if (res.ok) {
        setOpen(false);
        setOmschrijving("");
        if (onGepland) onGepland();
        else router.refresh();
      }
    } finally {
      setBezig(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="ml-sales__knop" onClick={() => setOpen(true)}>
        Plan actie
      </button>
    );
  }

  return (
    <div className="ml-sales__plan-actie-form" onClick={(e) => e.stopPropagation()}>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        {ACTIE_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
      <input type="text" placeholder="Omschrijving" value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} />
      <div className="ml-sales__actie-knoppen">
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig || !omschrijving.trim()} onClick={plan}>
          {bezig ? "Bezig…" : "Opslaan"}
        </button>
        <button type="button" className="ml-sales__knop" onClick={() => setOpen(false)} disabled={bezig}>
          Annuleren
        </button>
      </div>
    </div>
  );
}
