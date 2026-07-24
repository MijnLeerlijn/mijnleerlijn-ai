"use client";

import { useState } from "react";
import { Button, toast } from "@payloadcms/ui";

interface RepairResultaat {
  gevonden: { id: number; title: string; indexError: string | null }[];
  verwerkt: number;
  heringedexeerd: number;
  geembed: number;
  nogSteedsMislukt: number;
  fouten: string[];
}

// "Herstel mislukte bronnen" — herindexeert + herembedt Knowledge Sources
// met status "error" (bv. "Kon PDF niet ophalen (HTTP 403)"), zie
// lib/knowledge/repair-failed-sources.ts en app/api/knowledge/repair-failed/
// route.ts. Geen selectie nodig (i.t.t. IndexSelectedSourcesButton/
// MaakEmbeddingsButton hiernaast) — dit vindt zelf alle mislukte bronnen.
// Raakt Blob/de sync-pijplijn niet aan: uitsluitend een herindexeer-/
// herembedpoging op reeds bestaande bronnen.
export function RepairFailedSourcesButton() {
  const [bezig, setBezig] = useState(false);

  async function start() {
    setBezig(true);
    try {
      const response = await fetch("/api/knowledge/repair-failed", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as RepairResultaat | { error: string };
      if (!response.ok || "error" in data) {
        toast.error("error" in data ? data.error : "Herstellen mislukt.");
        return;
      }

      if (data.gevonden.length === 0) {
        toast.success("Geen mislukte bronnen gevonden.");
        return;
      }

      const samenvatting = `Gevonden: ${data.gevonden.length} · Verwerkt: ${data.verwerkt} · Heringedexeerd: ${data.heringedexeerd} · Geëmbed: ${data.geembed} · Nog steeds mislukt: ${data.nogSteedsMislukt}`;

      if (data.nogSteedsMislukt > 0) {
        // Korte foutmelding per nog-steeds-mislukte bron — volledige/technische
        // details staan bewaard op de bron zelf (veld indexError).
        const voorbeelden = data.fouten.slice(0, 3).join(" · ");
        toast.error(`${samenvatting}${voorbeelden ? ` — ${voorbeelden}` : ""}`);
      } else {
        toast.success(samenvatting);
      }
    } catch {
      toast.error("Herstellen mislukt door een netwerk- of serverfout.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div style={{ margin: "0 0 var(--base, 24px) 0" }}>
      <Button onClick={start} disabled={bezig} buttonStyle="secondary" size="small">
        {bezig ? "Bezig met herstellen…" : "Herstel mislukte bronnen"}
      </Button>
    </div>
  );
}
