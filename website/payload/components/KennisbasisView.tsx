"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Button, Gutter, toast } from "@payloadcms/ui";

// Kennisbasis per variant (2026-07-31): één centraal scherm met een
// variantkiezer bovenaan — vervangt het oude, losse "Kennisbasis
// MijnLeerlijn"-menu-item (de Payload Global, nu admin.hidden, zie
// payload/globals/KennisbasisMijnleerlijn.ts). Leest en schrijft
// UITSLUITEND via app/api/knowledge-sources/achtergrond/[variantId] — die
// route zoekt/maakt het achtergronddocument op precies hetzelfde kenmerk
// (variantContext + bronrol) als de AI-pijplijn (lib/assistant/
// kennisbasis-context.ts), dus dit scherm bewerkt gegarandeerd hetzelfde
// document dat de Helpdesk AI daadwerkelijk gebruikt — nooit een tweede,
// parallel document.

interface VariantOptie {
  id: number;
  name: string;
  branding?: { productName?: string };
}

interface AchtergrondData {
  variant: { id: number; name: string; productNaam: string; actief: boolean; status: string | null };
  document: { id: number; title: string; content: string; updatedAt: string | null } | null;
}

export function KennisbasisView() {
  const [varianten, setVarianten] = useState<VariantOptie[]>([]);
  const [geselecteerd, setGeselecteerd] = useState<number | null>(null);
  const [data, setData] = useState<AchtergrondData | null>(null);
  const [tekst, setTekst] = useState("");
  const [status, setStatus] = useState<"laden" | "klaar" | "fout">("laden");
  const [opslaan, setOpslaan] = useState(false);

  useEffect(() => {
    fetch("/api/variants?limit=100&sort=name&depth=0", { credentials: "include" })
      .then((res) => res.json())
      .then((res: { docs: VariantOptie[] }) => {
        setVarianten(res.docs);
        if (res.docs[0]) setGeselecteerd(res.docs[0].id);
        else setStatus("klaar");
      })
      .catch(() => setStatus("fout"));
  }, []);

  useEffect(() => {
    if (geselecteerd === null) return;
    setStatus("laden");
    fetch(`/api/knowledge-sources/achtergrond/${geselecteerd}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((res: AchtergrondData) => {
        setData(res);
        setTekst(res.document?.content ?? "");
        setStatus("klaar");
      })
      .catch(() => setStatus("fout"));
  }, [geselecteerd]);

  async function opslaanTekst() {
    if (geselecteerd === null) return;
    setOpslaan(true);
    try {
      const res = await fetch(`/api/knowledge-sources/achtergrond/${geselecteerd}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: tekst }),
      });
      if (!res.ok) {
        const fout = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(fout?.error || "Opslaan mislukt.");
      }
      toast.success("Achtergronddocument opgeslagen.");
      // Herladen zodat "document" (id, updatedAt) klopt na een eerste aanmaak.
      const verse = await fetch(`/api/knowledge-sources/achtergrond/${geselecteerd}`, { credentials: "include" });
      if (verse.ok) setData(await verse.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setOpslaan(false);
    }
  }

  const heeftBruikbareKennis = Boolean(data?.document?.content?.trim());

  return (
    <Gutter>
      <h1 style={{ marginBottom: "0.25rem" }}>Kennisbasis</h1>
      <p style={{ color: "var(--theme-elevation-500)", marginTop: 0 }}>
        Het vaste achtergrondverhaal (visie, samenhang, productlogica) dat de Helpdesk AI voor de gekozen variant
        altijd meeneemt — naast de gewone handleidingen/kennisbronnen.
      </p>

      <div style={{ maxWidth: 360, margin: "1rem 0" }}>
        <label htmlFor="kennisbasis-variant-select" style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>
          Variant
        </label>
        <select
          id="kennisbasis-variant-select"
          value={geselecteerd ?? ""}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setGeselecteerd(Number(e.target.value))}
          style={{
            width: "100%",
            padding: "0.5rem",
            border: "1px solid var(--theme-elevation-150)",
            borderRadius: "4px",
            background: "var(--theme-input-bg)",
            color: "var(--theme-text)",
          }}
        >
          {varianten.map((v) => (
            <option key={v.id} value={v.id}>
              {v.branding?.productName || v.name}
            </option>
          ))}
        </select>
      </div>

      {status === "laden" && <p>Laden…</p>}
      {status === "fout" && <p style={{ color: "var(--theme-error-500)" }}>Ophalen mislukt. Herlaad de pagina.</p>}

      {status === "klaar" && data && (
        <>
          {(!data.variant.actief || data.variant.status === "gearchiveerd") && (
            <div
              style={{
                background: "var(--theme-warning-100)",
                border: "1px solid var(--theme-warning-500)",
                borderRadius: "4px",
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
              }}
            >
              Deze variant is momenteel {data.variant.status === "gearchiveerd" ? "gearchiveerd" : "niet actief"} —
              bezoekers kunnen 'm nu niet bereiken.
            </div>
          )}

          {!heeftBruikbareKennis && (
            <div
              style={{
                background: "var(--theme-error-100)",
                border: "1px solid var(--theme-error-500)",
                borderRadius: "4px",
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
              }}
            >
              Deze variant heeft nog geen (bruikbare) achtergrondkennis. De Helpdesk AI gebruikt dan geen
              achtergrondblok voor {data.variant.productNaam} — nooit stilzwijgend de kennis van een andere variant.
              Vul hieronder tekst in en sla op om dit aan te vullen.
            </div>
          )}

          <textarea
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            rows={24}
            style={{
              width: "100%",
              padding: "0.75rem",
              border: "1px solid var(--theme-elevation-150)",
              borderRadius: "4px",
              background: "var(--theme-input-bg)",
              color: "var(--theme-text)",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.75rem" }}>
            <Button buttonStyle="primary" disabled={opslaan} onClick={opslaanTekst}>
              {opslaan ? "Bezig met opslaan…" : "Opslaan"}
            </Button>
            {data.document?.updatedAt && (
              <span style={{ fontSize: 12, color: "var(--theme-elevation-500)" }}>
                Laatst bijgewerkt: {new Date(data.document.updatedAt).toLocaleString("nl-NL")}
              </span>
            )}
          </div>
        </>
      )}
    </Gutter>
  );
}
