"use client";

import { useState } from "react";

// Relatie-analyse V1.1 (2026-08-15) — "Bespreek met AI" + "Maak hiervan
// nieuw voorstel". Hergebruikt bewust dezelfde .ml-sales__chat-*-CSS-klassen
// als de Vraag-tab (SalesDashboardPaneel.tsx)/"Vraag AI over deze school"
// (SalesSchooldetailView.tsx) — visueel en interactief hetzelfde
// chat-patroon, geen vierde variant.
//
// "Chat is gesprek, voorstel is resultaat" (opdrachtseis): dit component
// stuurt elke vraag naar /api/sales/proposals/[id]/chat (wijzigt nooit het
// voorstel) en roept /api/sales/proposals/[id]/from-chat UITSLUITEND aan na
// een expliciete klik op "Maak hiervan nieuw voorstel".
export interface ProposalChatBericht {
  role: "user" | "assistant";
  content: string;
}

interface SalesProposalChatProps {
  proposalId: number;
  onNieuwVoorstel: (nieuwProposalId: number) => void;
  onSluiten: () => void;
}

export function SalesProposalChat({ proposalId, onNieuwVoorstel, onSluiten }: SalesProposalChatProps) {
  const [berichten, setBerichten] = useState<ProposalChatBericht[]>([]);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [maakBezig, setMaakBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function verstuur() {
    const vraag = invoer.trim();
    if (!vraag) return;
    setInvoer("");
    setBezig(true);
    setFout(null);
    const voorGeschiedenis = berichten;
    setBerichten((b) => [...b, { role: "user", content: vraag }]);
    try {
      const res = await fetch(`/api/sales/proposals/${proposalId}/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vraag, geschiedenis: voorGeschiedenis }),
      });
      const data = (await res.json()) as { antwoord?: string; error?: string };
      if (res.ok && data.antwoord) {
        setBerichten((b) => [...b, { role: "assistant", content: data.antwoord! }]);
      } else {
        setFout(data.error ?? "Vraag stellen mislukt — probeer het opnieuw.");
      }
    } finally {
      setBezig(false);
    }
  }

  async function maakNieuwVoorstel() {
    if (berichten.length === 0) return;
    setMaakBezig(true);
    setFout(null);
    try {
      const res = await fetch(`/api/sales/proposals/${proposalId}/from-chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geschiedenis: berichten }),
      });
      const data = (await res.json()) as { nieuwProposalId?: number; error?: string };
      if (res.ok && data.nieuwProposalId) {
        onNieuwVoorstel(data.nieuwProposalId);
      } else {
        setFout(data.error ?? "Nieuw voorstel maken mislukt.");
      }
    } finally {
      setMaakBezig(false);
    }
  }

  return (
    <div className="ml-sales__proposal-chat" onClick={(e) => e.stopPropagation()}>
      {berichten.length > 0 && (
        <div className="ml-sales__chat-berichten">
          {berichten.map((bericht, i) => (
            <div key={i} className={`ml-sales__chat-bericht ml-sales__chat-bericht--${bericht.role === "user" ? "vraag" : "antwoord"}`}>
              {bericht.content}
            </div>
          ))}
        </div>
      )}
      {fout && <p className="ml-sales-widget__meta">{fout}</p>}
      <div className="ml-sales__chat-input-rij">
        <textarea value={invoer} onChange={(e) => setInvoer(e.target.value)} placeholder="Bijv. 'ik wil liever mailen dan bellen' of 'maak een beter voorstel'" />
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig || !invoer.trim()} onClick={verstuur}>
          {bezig ? "Bezig…" : "Vraag"}
        </button>
      </div>
      <div className="ml-sales__actie-knoppen" style={{ marginTop: 8 }}>
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={maakBezig || berichten.length === 0} onClick={maakNieuwVoorstel}>
          {maakBezig ? "Bezig…" : "Maak hiervan nieuw voorstel"}
        </button>
        <button type="button" className="ml-sales__knop" onClick={onSluiten}>
          Sluiten
        </button>
      </div>
    </div>
  );
}
