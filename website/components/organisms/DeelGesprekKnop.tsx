"use client";

import { useState } from "react";
import { Share2, Copy, Check, X, Trash2, Send } from "lucide-react";

interface DeelGesprekKnopProps {
  /** conversationId's van alle huidige "klaar"-berichten in het gesprek, in weergavevolgorde — zie HelpdeskChat.tsx. */
  conversationIds: number[];
}

interface OpgeslagenShare {
  token: string;
  createdAt: string;
}

// Chat delen via URL (2026-08-24) — spec §A6. Bewust GEEN server-side
// "mijn shares"-lijst (de Helpdesk-chat heeft geen ingelogde gebruiker om
// zo'n lijst aan te koppelen, zie lib/helpdesk/delen.ts se toelichting) —
// de lijst met eerder gemaakte links leeft daarom uitsluitend in
// localStorage van DEZE browser. Dit is een bewuste, in het opleverrapport
// benoemde beperking: op een ander apparaat/browser is een eerder gemaakte
// link niet terug te vinden in dit paneel (de link zelf blijft natuurlijk
// gewoon werken tot intrekking).
const OPSLAG_SLEUTEL = "mijnleerlijn-gedeelde-helpdesk-chats";

function leesOpgeslagenShares(): OpgeslagenShare[] {
  try {
    const ruw = localStorage.getItem(OPSLAG_SLEUTEL);
    if (!ruw) return [];
    const parsed: unknown = JSON.parse(ruw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is OpgeslagenShare => typeof item?.token === "string" && typeof item?.createdAt === "string"
    );
  } catch {
    return [];
  }
}

function schrijfOpgeslagenShares(shares: OpgeslagenShare[]): void {
  try {
    localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(shares));
  } catch {
    // Stil falen (bv. privénavigatie zonder opslag) — de link is al getoond/gekopieerd, alleen het "eerder gedeeld"-lijstje blijft dan leeg.
  }
}

function formatKort(iso: string): string {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function DeelGesprekKnop({ conversationIds }: DeelGesprekKnopProps) {
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [shares, setShares] = useState<OpgeslagenShare[]>([]);
  const [gekopieerdToken, setGekopieerdToken] = useState<string | null>(null);
  // Geen useEffect/state hiervoor nodig: dit wordt uitsluitend gelezen binnen
  // het {open && (...)}-paneel hieronder, dat sowieso nooit tijdens de
  // server-render/hydratie zichtbaar is (open start op false) — dus geen
  // enkel hydratie-mismatchrisico bij een rechtstreekse navigator-check hier.
  const kanNatiefDelen = typeof navigator !== "undefined" && typeof navigator.share === "function";

  function urlVoor(token: string): string {
    return `${window.location.origin}/delen/${token}`;
  }

  async function kopieer(token: string) {
    try {
      await navigator.clipboard.writeText(urlVoor(token));
      setGekopieerdToken(token);
      setTimeout(() => setGekopieerdToken((huidig) => (huidig === token ? null : huidig)), 2500);
    } catch {
      // Stil falen — de URL staat nog gewoon zichtbaar in het paneel om handmatig te selecteren.
    }
  }

  async function openPaneel() {
    setOpen(true);
    setFout(null);
    setShares(leesOpgeslagenShares());

    if (conversationIds.length === 0) return;
    setBezig(true);
    try {
      const res = await fetch("/api/helpdesk/delen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationIds }),
      });
      const data = await res.json();
      if (!res.ok || typeof data.token !== "string") {
        setFout("error" in data && typeof data.error === "string" ? data.error : "Delen is nu niet gelukt.");
        return;
      }
      const nieuw: OpgeslagenShare = { token: data.token, createdAt: new Date().toISOString() };
      setShares((huidig) => {
        const bijgewerkt = [nieuw, ...huidig];
        schrijfOpgeslagenShares(bijgewerkt);
        return bijgewerkt;
      });
      void kopieer(nieuw.token);
    } catch {
      setFout("Delen is nu niet mogelijk door een netwerkfout.");
    } finally {
      setBezig(false);
    }
  }

  async function trekIn(token: string) {
    setShares((huidig) => {
      const bijgewerkt = huidig.filter((s) => s.token !== token);
      schrijfOpgeslagenShares(bijgewerkt);
      return bijgewerkt;
    });
    try {
      await fetch("/api/helpdesk/delen/intrekken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch {
      // Stil falen — lokaal is de link al uit de lijst verwijderd; de server-aanroep mag hierna alsnog aankomen.
    }
  }

  async function deelNatief(token: string) {
    try {
      await navigator.share({ url: urlVoor(token), title: "Gedeeld gesprek — MijnLeerlijn Helpdesk" });
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
              Iedereen met de link kan dit gesprek bekijken — ook zonder in te loggen. Nieuwe berichten die je hierna
              stelt, verschijnen niet automatisch in deze link.
            </p>

            {bezig && <p className="mt-4 text-sm text-grijs-500">Link maken...</p>}
            {fout && <p className="mt-4 rounded-md bg-rood/5 p-3 text-sm text-grijs-900">{fout}</p>}

            {shares.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                {shares.map((share) => (
                  <div key={share.token} className="rounded-lg border border-grijs-200 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={urlVoor(share.token)}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 truncate rounded-md border border-grijs-200 bg-grijs-50 px-2 py-1.5 text-xs text-grijs-700"
                      />
                      <button
                        type="button"
                        onClick={() => void kopieer(share.token)}
                        className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--variant-accent)] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      >
                        {gekopieerdToken === share.token ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                        {gekopieerdToken === share.token ? "Gekopieerd" : "Kopieer"}
                      </button>
                      {kanNatiefDelen && (
                        <button
                          type="button"
                          onClick={() => void deelNatief(share.token)}
                          aria-label="Delen via..."
                          className="flex shrink-0 items-center rounded-md border border-grijs-200 p-1.5 text-grijs-500 hover:text-[var(--variant-accent)]"
                        >
                          <Send size={13} aria-hidden />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-grijs-500">Gemaakt {formatKort(share.createdAt)}</span>
                      <button
                        type="button"
                        onClick={() => void trekIn(share.token)}
                        className="flex items-center gap-1 text-xs text-grijs-500 hover:text-rood"
                      >
                        <Trash2 size={12} aria-hidden />
                        Intrekken
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
