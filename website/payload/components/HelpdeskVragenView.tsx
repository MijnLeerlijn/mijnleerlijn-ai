"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Button, CheckboxInput, Gutter, TextInput, toast } from "@payloadcms/ui";

// Homepage-herontwerp (2026-07-29): beheerpagina voor de collectie
// payload/collections/HelpdeskVragen.ts — vervangt de vaste, handmatig
// getypte lijst uit de oude Global (payload/globals/HelpdeskVoorbeeldvragen.ts).
// Vragen ontstaan nu automatisch uit echte bezoekersinvoer (elke bevestigde
// "Verstuur"-klik, zie app/api/helpdesk/ask/route.ts), of worden hier
// handmatig toegevoegd. Zelfde architectuur als DownloadbeheerView.tsx/
// DownloadcategorieenView.tsx: batch-"Opslaan" voor tekst/vastzetten/
// verbergen (voorkomt een stortvloed aan losse verzoeken bij tientallen
// rijen), directe acties voor toevoegen/verwijderen. Alle CRUD via gewone
// Payload REST-calls naar /api/helpdesk-vragen — de collectie staat al open
// voor `anyEditor`, dus geen aparte gecontroleerde route nodig (zelfde als
// hoe DownloadbeheerView.tsx al rechtstreeks /api/handleidingen aanspreekt).

interface HelpdeskVraagDoc {
  id: number;
  vraag: string;
  aantalGesteld: number;
  laatstGebruiktOp: string | null;
  pinned: boolean;
  pinVolgorde: number | null;
  verborgen: boolean;
}

interface Rij {
  id: number;
  vraag: string;
  aantalGesteld: number;
  laatstGebruiktOp: string | null;
  pinned: boolean;
  pinVolgorde: number | null;
  verborgen: boolean;
  gewijzigd: boolean;
}

const MAX_OP_HOMEPAGE = 5;

function naarRij(doc: HelpdeskVraagDoc): Rij {
  return {
    id: doc.id,
    vraag: doc.vraag,
    aantalGesteld: doc.aantalGesteld ?? 0,
    laatstGebruiktOp: doc.laatstGebruiktOp ?? null,
    pinned: Boolean(doc.pinned),
    pinVolgorde: doc.pinVolgorde ?? null,
    verborgen: Boolean(doc.verborgen),
    gewijzigd: false,
  };
}

function formatDatum(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

/** Zelfde selectielogica als lib/helpdesk/top5-voorbeeldvragen.ts — puur voor de "Op homepage"-indicatie, geen serveraanroep. */
function bepaalOpHomepage(rijen: Rij[]): Set<number> {
  const zichtbaar = rijen.filter((r) => !r.verborgen);
  const gepind = zichtbaar
    .filter((r) => r.pinned)
    .sort((a, b) => {
      const pa = a.pinVolgorde ?? Number.MAX_SAFE_INTEGER;
      const pb = b.pinVolgorde ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return (b.laatstGebruiktOp ?? "").localeCompare(a.laatstGebruiktOp ?? "");
    })
    .slice(0, MAX_OP_HOMEPAGE);

  const resultaat = new Set(gepind.map((r) => r.id));
  if (resultaat.size >= MAX_OP_HOMEPAGE) return resultaat;

  const aanvulling = zichtbaar
    .filter((r) => !r.pinned)
    .sort((a, b) => {
      if (b.aantalGesteld !== a.aantalGesteld) return b.aantalGesteld - a.aantalGesteld;
      return (b.laatstGebruiktOp ?? "").localeCompare(a.laatstGebruiktOp ?? "");
    });

  for (const rij of aanvulling) {
    if (resultaat.size >= MAX_OP_HOMEPAGE) break;
    resultaat.add(rij.id);
  }
  return resultaat;
}

export function HelpdeskVragenView() {
  const [rijen, setRijen] = useState<Rij[]>([]);
  const [status, setStatus] = useState<"laden" | "klaar" | "fout">("laden");
  const [opslaan, setOpslaan] = useState(false);
  const [nieuweVraag, setNieuweVraag] = useState("");
  const [toevoegen, setToevoegen] = useState(false);

  async function laadAlles() {
    setStatus("laden");
    try {
      const res = await fetch("/api/helpdesk-vragen?limit=1000&sort=-aantalGesteld", { credentials: "include" });
      if (!res.ok) throw new Error(`Ophalen mislukt (${res.status}).`);
      const data = (await res.json()) as { docs: HelpdeskVraagDoc[] };
      setRijen(data.docs.map(naarRij));
      setStatus("klaar");
    } catch {
      setStatus("fout");
    }
  }

  useEffect(() => {
    laadAlles();
  }, []);

  const opHomepage = useMemo(() => bepaalOpHomepage(rijen), [rijen]);

  function werkRijBij(id: number, wijziging: Partial<Rij>) {
    setRijen((huidig) => huidig.map((r) => (r.id === id ? { ...r, ...wijziging, gewijzigd: true } : r)));
  }

  const aantalGewijzigd = rijen.filter((r) => r.gewijzigd).length;

  async function slaOp() {
    const teBewaren = rijen.filter((r) => r.gewijzigd);
    if (teBewaren.length === 0) return;
    setOpslaan(true);
    try {
      const resultaten = await Promise.allSettled(
        teBewaren.map(async (r) => {
          // vraagNormalized meesturen zodra de tekst wijzigt: anders raakt
          // deze rij los van toekomstige, echte bezoekersvragen met dezelfde
          // (nieuwe) formulering — die zouden dan een nieuwe, aparte rij
          // krijgen i.p.v. de telling van deze rij voort te zetten.
          const res = await fetch(`/api/helpdesk-vragen/${r.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vraag: r.vraag,
              vraagNormalized: r.vraag.trim().replace(/\s+/g, " ").toLowerCase(),
              pinned: r.pinned,
              verborgen: r.verborgen,
            }),
          });
          if (!res.ok) throw new Error(String(r.id));
        })
      );
      const mislukt = resultaten.filter((r) => r.status === "rejected").length;
      if (mislukt > 0) {
        toast.error(`${mislukt} van ${teBewaren.length} wijziging(en) konden niet opgeslagen worden.`);
      } else {
        toast.success(`${teBewaren.length} vraag/vragen bijgewerkt.`);
      }
      await laadAlles();
    } finally {
      setOpslaan(false);
    }
  }

  async function voegToe() {
    const tekst = nieuweVraag.trim();
    if (!tekst) return;
    setToevoegen(true);
    try {
      const genormaliseerd = tekst.toLowerCase().replace(/\s+/g, " ");
      const res = await fetch("/api/helpdesk-vragen", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vraag: tekst,
          vraagNormalized: genormaliseerd,
          aantalGesteld: 0,
          pinned: false,
          verborgen: false,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null;
        throw new Error(data?.errors?.[0]?.message || "Toevoegen mislukt.");
      }
      setNieuweVraag("");
      toast.success(`Vraag "${tekst}" toegevoegd.`);
      await laadAlles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Toevoegen mislukt.");
    } finally {
      setToevoegen(false);
    }
  }

  async function verwijder(rij: Rij) {
    if (!window.confirm(`Vraag "${rij.vraag}" verwijderen?`)) return;
    try {
      const res = await fetch(`/api/helpdesk-vragen/${rij.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
      toast.success("Vraag verwijderd.");
      await laadAlles();
    } catch {
      toast.error("Verwijderen is mislukt.");
    }
  }

  return (
    <Gutter>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>Helpdesk-vragen</h1>
          <p style={{ color: "var(--theme-elevation-500)", margin: 0 }}>
            De homepage toont eerst alle vastgezette vragen; zijn dat er minder dan {MAX_OP_HOMEPAGE}, dan wordt
            automatisch aangevuld met de meest gestelde niet-verborgen vragen. De kolom &ldquo;Op
            homepage&rdquo; hieronder toont live wat (na opslaan) daadwerkelijk getoond wordt.
          </p>
        </div>
        <Button buttonStyle="primary" disabled={aantalGewijzigd === 0 || opslaan} onClick={slaOp}>
          {opslaan ? "Bezig met opslaan…" : `Opslaan${aantalGewijzigd > 0 ? ` (${aantalGewijzigd})` : ""}`}
        </Button>
      </div>

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "flex-end",
          margin: "0 0 1.5rem",
          padding: "1rem",
          border: "1px solid var(--theme-elevation-150)",
          borderRadius: "4px",
          background: "var(--theme-input-bg)",
        }}
      >
        <div style={{ flex: 1, maxWidth: 420 }}>
          <TextInput
            path="nieuweVraag"
            label="Nieuwe vraag toevoegen"
            value={nieuweVraag}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNieuweVraag(e.target.value)}
            placeholder="Bv. Hoe koppel ik doelen aan een leerling?"
          />
        </div>
        <Button buttonStyle="secondary" disabled={!nieuweVraag.trim() || toevoegen} onClick={voegToe}>
          {toevoegen ? "Bezig met toevoegen…" : "+ Toevoegen"}
        </Button>
      </div>

      {status === "laden" && <p>Laden…</p>}
      {status === "fout" && <p style={{ color: "var(--theme-error-500)" }}>Ophalen mislukt. Herlaad de pagina.</p>}

      {status === "klaar" && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--theme-elevation-150)", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Vraag</th>
              <th style={{ padding: "0.5rem", textAlign: "center" }}>Aantal gesteld</th>
              <th style={{ padding: "0.5rem" }}>Laatst gebruikt</th>
              <th style={{ padding: "0.5rem", textAlign: "center" }}>Vastgezet</th>
              <th style={{ padding: "0.5rem", textAlign: "center" }}>Verborgen</th>
              <th style={{ padding: "0.5rem", textAlign: "center" }}>Op homepage</th>
              <th style={{ padding: "0.5rem" }}>Verwijderen</th>
            </tr>
          </thead>
          <tbody>
            {rijen.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "1rem", color: "var(--theme-elevation-500)" }}>
                  Nog geen vragen — ze verschijnen automatisch zodra bezoekers de assistent gebruiken, of voeg er
                  hierboven zelf een toe.
                </td>
              </tr>
            )}
            {rijen.map((rij) => (
              <tr
                key={rij.id}
                style={{
                  borderBottom: "1px solid var(--theme-elevation-100)",
                  background: rij.gewijzigd ? "var(--theme-elevation-50)" : undefined,
                }}
              >
                <td style={{ padding: "0.5rem" }}>
                  <input
                    type="text"
                    value={rij.vraag}
                    onChange={(e) => werkRijBij(rij.id, { vraag: e.target.value })}
                    style={{
                      width: "100%",
                      minWidth: 260,
                      padding: "0.4rem",
                      border: "1px solid var(--theme-elevation-150)",
                      borderRadius: "4px",
                      background: "var(--theme-input-bg)",
                      color: "inherit",
                    }}
                  />
                </td>
                <td style={{ padding: "0.5rem", textAlign: "center" }}>{rij.aantalGesteld}</td>
                <td style={{ padding: "0.5rem" }}>{formatDatum(rij.laatstGebruiktOp)}</td>
                <td style={{ padding: "0.5rem", textAlign: "center" }}>
                  <CheckboxInput
                    id={`pinned-${rij.id}`}
                    checked={rij.pinned}
                    onToggle={(e) => werkRijBij(rij.id, { pinned: e.target.checked })}
                  />
                </td>
                <td style={{ padding: "0.5rem", textAlign: "center" }}>
                  <CheckboxInput
                    id={`verborgen-${rij.id}`}
                    checked={rij.verborgen}
                    onToggle={(e) => werkRijBij(rij.id, { verborgen: e.target.checked })}
                  />
                </td>
                <td style={{ padding: "0.5rem", textAlign: "center" }}>
                  {opHomepage.has(rij.id) ? "✓" : ""}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <Button buttonStyle="secondary" size="small" onClick={() => verwijder(rij)}>
                    Verwijderen
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Gutter>
  );
}
