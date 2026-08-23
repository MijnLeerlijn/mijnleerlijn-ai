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
//
// Kennisbasis-basiskennis voor trainers (2026-08-23) — "Maak trainerversie"
// hieronder roept dezelfde /api/creator/trainer-kennisversie-route aan als
// Articles.ts se knop (MaakTrainerversieButton.tsx), maar dan met
// `knowledgeSourceId` i.p.v. `articleId`: dit scherm bewerkt namelijk zelf
// GEEN articles-record maar precies het achtergronddocument (`data.document`
// hierboven) — dus geen `useDocumentInfo()` (die bestaat hier niet, dit is
// geen standaard documentscherm), gewoon het al-geladen `data.document.id`.
// Bewaart een concept exact zoals de Articles-knop: status "concept", pas
// zichtbaar voor trainers na "Publiceren voor trainers" in het
// trainer-kennisversies-scherm zelf — nooit stilzwijgend gepubliceerd.

interface VariantOptie {
  id: number;
  name: string;
  branding?: { productName?: string };
}

interface AchtergrondData {
  variant: { id: number; name: string; productNaam: string; actief: boolean; status: string | null };
  document: { id: number; title: string; content: string; updatedAt: string | null } | null;
}

/** Letterlijke kopie van dezelfde helper in CreatorView.tsx/MaakTrainerversieButton.tsx (bewuste, niet-gedeelde duplicatie — zie die bestanden). */
async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as (T & { errors?: { message?: string }[]; error?: string }) | null;
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.error || "Actie mislukt.");
  return data as T;
}

type TrainerversieStatus = "stil" | "bezig" | "gelukt" | "fout";

export function KennisbasisView() {
  const [varianten, setVarianten] = useState<VariantOptie[]>([]);
  const [geselecteerd, setGeselecteerd] = useState<number | null>(null);
  const [data, setData] = useState<AchtergrondData | null>(null);
  const [tekst, setTekst] = useState("");
  const [status, setStatus] = useState<"laden" | "klaar" | "fout">("laden");
  const [opslaan, setOpslaan] = useState(false);
  const [trainerversieStatus, setTrainerversieStatus] = useState<TrainerversieStatus>("stil");
  const [trainerversieBoodschap, setTrainerversieBoodschap] = useState("");
  const [trainerversieId, setTrainerversieId] = useState<number | null>(null);

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
    setTrainerversieStatus("stil");
    setTrainerversieBoodschap("");
    setTrainerversieId(null);
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

  async function maakTrainerversie() {
    if (!data?.document) return;
    setTrainerversieStatus("bezig");
    setTrainerversieBoodschap("");
    setTrainerversieId(null);
    try {
      const genRes = await fetch("/api/creator/trainer-kennisversie", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeSourceId: data.document.id }),
      });
      const genData = await json<{ titel: string; tekst: string }>(genRes);

      const saveRes = await fetch("/api/trainer-kennisversies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bron: { relationTo: "knowledge-sources", value: data.document.id },
          titel: genData.titel,
          tekst: genData.tekst,
          status: "concept",
          generatedByAi: true,
        }),
      });
      const saveData = await json<{ doc: { id: number } }>(saveRes);

      setTrainerversieId(saveData.doc.id);
      setTrainerversieBoodschap("Conceptversie aangemaakt — controleer en bewerk de tekst voordat je publiceert.");
      setTrainerversieStatus("gelukt");
    } catch (error) {
      setTrainerversieBoodschap(error instanceof Error ? error.message : "Mislukt door een netwerk- of serverfout.");
      setTrainerversieStatus("fout");
    }
  }

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

          <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--theme-elevation-150)" }}>
            <h2 style={{ marginBottom: "0.25rem" }}>Basiskennis voor trainers</h2>
            <p style={{ color: "var(--theme-elevation-500)", marginTop: 0, marginBottom: "0.75rem" }}>
              Herschrijft deze tekst — dezelfde feiten, vanuit trainersperspectief — als nieuwe conceptversie in{" "}
              <em>Trainer-kennisversies</em>. Publiceren voor trainers gebeurt daarna apart, via de status van die
              conceptversie.
            </p>
            <Button buttonStyle="secondary" disabled={!heeftBruikbareKennis || !data.document || trainerversieStatus === "bezig"} onClick={maakTrainerversie}>
              {trainerversieStatus === "bezig" ? "Bezig met genereren…" : "Maak trainerversie"}
            </Button>
            {trainerversieStatus === "gelukt" && (
              <p style={{ marginTop: "0.5rem", color: "var(--theme-success-500)" }}>
                {trainerversieBoodschap}{" "}
                {trainerversieId && <a href={`/admin/collections/trainer-kennisversies/${trainerversieId}`}>Open conceptversie →</a>}
              </p>
            )}
            {trainerversieStatus === "fout" && trainerversieBoodschap && (
              <p style={{ marginTop: "0.5rem", color: "var(--theme-error-500)" }}>{trainerversieBoodschap}</p>
            )}
          </div>
        </>
      )}
    </Gutter>
  );
}
