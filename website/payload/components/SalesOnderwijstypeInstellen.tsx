"use client";

import { useState } from "react";

// Relatie-analyse V1.1 (2026-08-15) — "Onderwijstype zelf instellen".
// Gebruikt de bestaande variants-data via /api/variants (al bestaand,
// al gebruikt door SalesScholenView.tsx) — geen hardcoded tweede lijst.
// Zelfde compacte "knop -> inline formulier"-interactiepatroon als
// PlanActieKnop.tsx, bewust hergebruikt i.p.v. iets nieuws te verzinnen.
//
// Twee modi, ÉÉN component (opdrachtseis: geen 3 implementaties):
// - Standalone (schoolId meegegeven, geen onBevestig): schrijft direct via
//   POST /api/sales/school/[id]/education-type — de bestaande, conflictveilige
//   write-back-service (lib/sales/education-type-manual.ts). Gebruikt op
//   schooldetail ("Volgende stap") en Scholenoverzicht (compacte rij-actie).
// - Proposal-modus (onBevestig meegegeven): de aanroeper (SalesProposalActies)
//   regelt zelf de accept/modify-afhandeling — hergebruikt dan de AL
//   BESTAANDE proposal-decide-write-back (dezelfde write-back-service,
//   via een ANDERE, al geteste weg — de conflictsnapshot komt daar uit het
//   voorstel zelf i.p.v. een verse Monday-read).
export interface VariantOptie {
  id: number;
  name: string;
  educationType: string;
}

interface SalesOnderwijstypeInstellenProps {
  schoolId?: number;
  onBevestig?: (variant: VariantOptie) => void | Promise<void>;
  onGewijzigd?: () => void;
  label?: string;
  /** Kleinere, randloze knop voor krappe plekken (bv. een tabelcel) — zelfde component/gedrag, alleen de gesloten-status oogt lichter. */
  compact?: boolean;
}

export function SalesOnderwijstypeInstellen({ schoolId, onBevestig, onGewijzigd, label = "Zelf instellen", compact = false }: SalesOnderwijstypeInstellenProps) {
  const [open, setOpen] = useState(false);
  const [varianten, setVarianten] = useState<VariantOptie[] | null>(null);
  const [gekozen, setGekozen] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  async function openFormulier() {
    setOpen(true);
    if (varianten !== null) return;
    const res = await fetch("/api/variants?limit=100&sort=name&depth=0", { credentials: "include" });
    const data = res.ok ? ((await res.json()) as { docs?: VariantOptie[] }) : { docs: [] };
    setVarianten(data.docs ?? []);
  }

  async function bevestig() {
    const variant = varianten?.find((v) => String(v.id) === gekozen);
    if (!variant) return;
    setBezig(true);
    setMelding(null);
    try {
      if (onBevestig) {
        await onBevestig(variant);
        setOpen(false);
        return;
      }
      if (!schoolId) return;
      const res = await fetch(`/api/sales/school/${schoolId}/education-type`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: variant.id }),
      });
      const data = (await res.json()) as { lokaalBijgewerkt?: boolean; writeback?: { boodschap?: string }; error?: string };
      if (res.ok && data.lokaalBijgewerkt) {
        setOpen(false);
        if (onGewijzigd) onGewijzigd();
      } else {
        setMelding(data.writeback?.boodschap ?? data.error ?? "Opslaan mislukt.");
      }
    } finally {
      setBezig(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={`ml-sales__knop${compact ? " ml-sales__knop--secundair" : ""}`} onClick={openFormulier}>
        {label}
      </button>
    );
  }

  return (
    <div className="ml-sales__plan-actie-form" onClick={(e) => e.stopPropagation()}>
      <select value={gekozen} onChange={(e) => setGekozen(e.target.value)} aria-label="Kies onderwijstype">
        <option value="">Kies onderwijstype…</option>
        {varianten?.map((v) => (
          <option key={v.id} value={String(v.id)}>
            {v.name}
          </option>
        ))}
      </select>
      <div className="ml-sales__actie-knoppen">
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig || !gekozen} onClick={bevestig}>
          {bezig ? "Bezig…" : "Bevestigen"}
        </button>
        <button type="button" className="ml-sales__knop" onClick={() => setOpen(false)} disabled={bezig}>
          Annuleren
        </button>
      </div>
      {melding && (
        <p className="ml-sales__kaart-tekst" style={{ marginTop: 2 }}>
          {melding}
        </p>
      )}
    </div>
  );
}
