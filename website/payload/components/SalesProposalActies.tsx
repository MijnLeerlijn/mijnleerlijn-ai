"use client";

import { useState } from "react";
import { SalesAanpasFormulier } from "./SalesAanpasFormulier";
import { SalesOnderwijstypeInstellen, type VariantOptie } from "./SalesOnderwijstypeInstellen";
import { SalesProposalChat } from "./SalesProposalChat";

// Relatie-analyse V1.1 (2026-08-15) — DE ene gedeelde actieknoppenrij voor
// een Sales-voorstel, gebruikt op dashboard-To-do (SalesDashboardPaneel.tsx),
// Sales-Overzicht (SalesVandaagView.tsx) EN schooldetail
// (SalesSchooldetailView.tsx) — vervangt de 3 losse, inline knoppenrijen die
// daar eerder stonden. "Dezelfde actie moet overal hetzelfde gedrag hebben"
// (opdrachtseis) is hierdoor een architecturale garantie, niet een
// afspraak: er is maar één plek waar het gedrag gedefinieerd wordt.
//
// Primair: Bevestigen/Accepteren/Maak Sales-actie · Aanpassen (of "Zelf
// instellen" bij veld_correctie — dezelfde variant-picker als schooldetail's
// "Onderwijstype zelf instellen") · Niet nodig/Negeren.
// Secundair: Opnieuw analyseren · Bespreek met AI — alleen bij
// volgende_actie/bestaande_vervolgdatum (veld_correctie heeft zijn eigen
// "Onderwijstype herkennen"-mechanisme, geen relatie-analyse van toepassing).
export interface SalesProposalVoorActies {
  id: number;
  proposalType: "volgende_actie" | "veld_correctie" | "bestaande_vervolgdatum";
  proposedDate?: string | null;
  proposedType?: string | null;
  proposedChannel?: string | null;
}

interface SalesProposalActiesProps {
  voorstel: SalesProposalVoorActies;
  /** Ververst de omliggende lijst/pagina — zelfde onGepland/onGewijzigd-conventie als PlanActieKnop.tsx. */
  onGewijzigd: () => void;
}

async function apiPost<T>(url: string, body?: unknown): Promise<{ ok: boolean; data: T | null }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, data };
}

export function SalesProposalActies({ voorstel, onGewijzigd }: SalesProposalActiesProps) {
  const [bezig, setBezig] = useState(false);
  const [aanpassenOpen, setAanpassenOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [heranalyseBezig, setHeranalyseBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  const isVeldCorrectie = voorstel.proposalType === "veld_correctie";
  const kanHeranalyseren = !isVeldCorrectie;

  async function beslisAccepteren() {
    setBezig(true);
    await apiPost(`/api/sales/proposals/${voorstel.id}/decide`, { beslissing: "accepted" });
    setBezig(false);
    onGewijzigd();
  }

  async function beslisAfwijzen() {
    setBezig(true);
    await apiPost(`/api/sales/proposals/${voorstel.id}/decide`, { beslissing: "rejected" });
    setBezig(false);
    onGewijzigd();
  }

  async function beslisAangepast(aangepasteWaarde: Record<string, string>) {
    setBezig(true);
    await apiPost(`/api/sales/proposals/${voorstel.id}/decide`, { beslissing: "modified", aangepasteWaarde });
    setBezig(false);
    setAanpassenOpen(false);
    onGewijzigd();
  }

  async function onderwijstypeBevestigd(variant: VariantOptie) {
    await beslisAangepast({ proposedValue: variant.educationType });
  }

  async function heranalyseer() {
    setHeranalyseBezig(true);
    setMelding(null);
    const { ok, data } = await apiPost<{ status: string; reden?: string }>(`/api/sales/proposals/${voorstel.id}/reanalyze`);
    setHeranalyseBezig(false);
    if (ok && data?.status === "nieuw_voorstel") {
      onGewijzigd();
    } else if (ok && data?.status === "geen_wijziging") {
      setMelding(data.reden ?? "Geen nieuw voorstel — het bestaande blijft staan.");
    } else {
      setMelding("Opnieuw analyseren mislukt — probeer het later opnieuw.");
    }
  }

  return (
    <div>
      <div className="ml-sales__actie-knoppen">
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig} onClick={beslisAccepteren}>
          {voorstel.proposalType === "bestaande_vervolgdatum" ? "Maak Sales-actie" : isVeldCorrectie ? "Bevestigen" : "Accepteren"}
        </button>

        {isVeldCorrectie ? (
          <SalesOnderwijstypeInstellen label="Zelf instellen" onBevestig={onderwijstypeBevestigd} />
        ) : (
          <button type="button" className="ml-sales__knop" onClick={() => setAanpassenOpen((o) => !o)}>
            Aanpassen
          </button>
        )}

        <button type="button" className="ml-sales__knop" disabled={bezig} onClick={beslisAfwijzen}>
          {isVeldCorrectie ? "Negeren" : "Niet nodig"}
        </button>
      </div>

      {!isVeldCorrectie && aanpassenOpen && <SalesAanpasFormulier voorstel={voorstel} onBevestig={beslisAangepast} />}

      {kanHeranalyseren && (
        <div className="ml-sales__actie-knoppen ml-sales__actie-knoppen--secundair">
          <button type="button" className="ml-sales__knop ml-sales__knop--secundair" disabled={heranalyseBezig} onClick={heranalyseer}>
            {heranalyseBezig ? "Bezig…" : "Opnieuw analyseren"}
          </button>
          <button type="button" className="ml-sales__knop ml-sales__knop--secundair" onClick={() => setChatOpen((o) => !o)}>
            Bespreek met AI
          </button>
        </div>
      )}

      {melding && (
        <p className="ml-sales-widget__meta" style={{ marginTop: 4 }}>
          {melding}
        </p>
      )}

      {chatOpen && (
        <SalesProposalChat
          proposalId={voorstel.id}
          onNieuwVoorstel={() => {
            setChatOpen(false);
            onGewijzigd();
          }}
          onSluiten={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
