"use client";

import { useState } from "react";
import { Share2, Copy, Check, X, Trash2, Send } from "lucide-react";

interface DeelGesprekKnopProps {
  /** conversationId's van alle huidige "klaar"-berichten in dit gesprek die ECHT via /api/helpdesk/ask gesteld zijn, in weergavevolgorde — zie HelpdeskChat.tsx. Een geërfd bericht (initieleBerichten) telt hier nooit in mee, dat loopt via parentToken hieronder. */
  conversationIds: number[];
  /** Gesprek delen — vervolgen (2026-09-01, spec-eis §7): de token van het gesprek waaronder dit gesprek zelf is voortgezet (HelpdeskChat.tsx se deelParentToken) — de server plakt diens bevroren berichten vóór conversationIds. Leeg bij een vers, ongedeeld gesprek. */
  parentToken?: string;
}

// Chat delen via URL — herbouw (2026-09-01, spec-eis §1): geen
// geschiedenis met eerder gemaakte links meer, en dus ook geen
// localStorage-gebruik — elke klik op "Delen" maakt telkens opnieuw precies
// ÉÉN nieuwe link aan, die zichzelf toont zolang het paneel openstaat.
// Intrekken (spec-eis §8) blijft mogelijk, maar uitsluitend voor DEZE net
// aangemaakte link — geen lijst om doorheen te bladeren.
export default function DeelGesprekKnop({ conversationIds, parentToken }: DeelGesprekKnopProps) {
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);
  const [ingetrokken, setIngetrokken] = useState(false);
  // Geen useEffect/state hiervoor nodig: dit wordt uitsluitend gelezen binnen
  // het {open && (...)}-paneel hieronder, dat sowieso nooit tijdens de
  // server-render/hydratie zichtbaar is (open start op false) — dus geen
  // enkel hydratie-mismatchrisico bij een rechtstreekse navigator-check hier.
  const kanNatiefDelen = typeof navigator !== "undefined" && typeof navigator.share === "function";

  function url(t: string): string {
    return `${window.location.origin}/delen/${t}`;
  }

  async function kopieer(t: string) {
    try {
      await navigator.clipboard.writeText(url(t));
      setGekopieerd(true);
      setTimeout(() => setGekopieerd(false), 2500);
    } catch {
      // Stil falen — de URL staat nog gewoon zichtbaar in het paneel om handmatig te selecteren.
    }
  }

  async function openPaneel() {
    setOpen(true);
    setFout(null);
    setToken(null);
    setIngetrokken(false);
    setBezig(true);
    try {
      const res = await fetch("/api/helpdesk/delen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationIds, ...(parentToken ? { parentToken } : {}) }),
      });
      const data = await res.json();
      if (!res.ok || typeof data.token !== "string") {
        setFout("error" in data && typeof data.error === "string" ? data.error : "Delen is nu niet gelukt.");
        return;
      }
      setToken(data.token);
      void kopieer(data.token);
    } catch {
      setFout("Delen is nu niet mogelijk door een netwerkfout.");
    } finally {
      setBezig(false);
    }
  }

  async function trekIn() {
    if (!token) return;
    setIngetrokken(true);
    try {
      await fetch("/api/helpdesk/delen/intrekken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch {
      // Stil falen — de link is lokaal al als ingetrokken gemarkeerd; de server-aanroep mag hierna alsnog aankomen.
    }
  }

  async function deelNatief() {
    if (!token) return;
    try {
      await navigator.share({ url: url(token), title: "Gedeeld gesprek — MijnLeerlijn Helpdesk" });
    } catch {
      // Gebruiker annuleerde de systeem-share-dialoog — geen actie nodig.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPaneel()}
        className="flex items-center gap-1.5 rounded-lg border border-grijs-200 px-3 py-1.5 text-sm text-grijs-600 transition-colors duration-[120ms] hover:border-[var(--variant-accent)] hover:text-[var(--variant-accent)]"
      >
        <Share2 size={15} aria-hidden />
        Delen
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Gesprek delen"
          className="fixed inset-0 z-50 flex items-center justify-center bg-donkerblauw/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-grijs-900">Gesprek delen</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Sluiten" className="text-grijs-400 hover:text-grijs-700">
                <X size={18} aria-hidden />
              </button>
            </div>

            <p className="mt-1 text-sm text-grijs-600">
              Iedereen met de link kan dit gesprek bekijken en eronder verder chatten — ook zonder in te loggen.
            </p>

            {bezig && <p className="mt-4 text-sm text-grijs-500">Link maken...</p>}
            {fout && <p className="mt-4 rounded-md bg-rood/5 p-3 text-sm text-grijs-900">{fout}</p>}

            {token && !ingetrokken && (
              <div className="mt-4 rounded-lg border border-grijs-200 p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={url(token)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 truncate rounded-md border border-grijs-200 bg-grijs-50 px-2 py-1.5 text-xs text-grijs-700"
                  />
                  <button
                    type="button"
                    onClick={() => void kopieer(token)}
                    className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--variant-accent)] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    {gekopieerd ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                    {gekopieerd ? "Gekopieerd" : "Kopieer"}
                  </button>
                  {kanNatiefDelen && (
                    <button
                      type="button"
                      onClick={() => void deelNatief()}
                      aria-label="Delen via..."
                      className="flex shrink-0 items-center rounded-md border border-grijs-200 p-1.5 text-grijs-500 hover:text-[var(--variant-accent)]"
                    >
                      <Send size={13} aria-hidden />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void trekIn()}
                  className="mt-2 flex items-center gap-1 text-xs text-grijs-500 hover:text-rood"
                >
                  <Trash2 size={12} aria-hidden />
                  Link intrekken
                </button>
              </div>
            )}

            {ingetrokken && <p className="mt-4 text-sm text-grijs-600">Link ingetrokken — hij werkt niet meer.</p>}
          </div>
        </div>
      )}
    </>
  );
}
