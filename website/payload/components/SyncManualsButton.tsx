"use client";

import { useState } from "react";
import { Button, toast } from "@payloadcms/ui";

interface SyncResultaat {
  gevonden: number;
  nieuw: number;
  bijgewerkt: number;
  ongewijzigdOvergeslagen: number;
  duplicaatOvergeslagen: number;
  geindexeerd: number;
  geembed: number;
  mislukt: number;
  fouten: string[];
}

// "Synchroniseer handleidingen" — scant website/handleidingen/ en maakt/
// werkt knowledge-sources bij, zie lib/knowledge/sync-manuals.ts en
// app/api/knowledge/sync-manuals/route.ts. Geen selectie nodig (i.t.t.
// IndexSelectedSourcesButton/MaakEmbeddingsButton hiernaast) — dit werkt op
// de hele map, dus altijd actief. Stopt bij een fout/timeout altijd met
// laden en toont een duidelijke melding (nooit oneindig "bezig" blijven
// hangen).
export function SyncManualsButton() {
  const [bezig, setBezig] = useState(false);

  async function start() {
    setBezig(true);
    try {
      const response = await fetch("/api/knowledge/sync-manuals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as SyncResultaat | { error: string };
      if (!response.ok || "error" in data) {
        toast.error("error" in data ? data.error : "Synchroniseren mislukt.");
        return;
      }
      const samenvatting = `Gevonden: ${data.gevonden} · Nieuw: ${data.nieuw} · Bijgewerkt: ${data.bijgewerkt} · Ongewijzigd: ${data.ongewijzigdOvergeslagen} · Duplicaat: ${data.duplicaatOvergeslagen} · Geïndexeerd: ${data.geindexeerd} · Geëmbed: ${data.geembed} · Mislukt: ${data.mislukt}`;

      if (data.mislukt > 0) {
        // Korte foutmelding per mislukt bestand — volledige/technische
        // details staan bewaard op de bron zelf (veld indexError).
        const voorbeelden = data.fouten.slice(0, 3).join(" · ");
        toast.error(`${samenvatting}${voorbeelden ? ` — ${voorbeelden}` : ""}`);
      } else {
        toast.success(samenvatting);
      }
    } catch {
      toast.error("Synchroniseren mislukt door een netwerk- of serverfout.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <Button onClick={start} disabled={bezig} buttonStyle="secondary" size="small">
      {bezig ? "Bezig met synchroniseren…" : "Synchroniseer handleidingen"}
    </Button>
  );
}
