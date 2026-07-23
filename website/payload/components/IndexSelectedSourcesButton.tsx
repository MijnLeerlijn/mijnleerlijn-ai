"use client";

import { useState } from "react";
import { Button, toast, useSelection } from "@payloadcms/ui";

interface IndexeerResultaat {
  verwerkt: number;
  geindexeerd: number;
  mislukt: number;
  fouten: string[];
}

// "Indexeer geselecteerde bronnen"-knop in de lijstweergave van
// knowledge-sources — dekt zowel nieuwe bronnen als herindexeren (een reeds
// geïndexeerde bron opnieuw selecteren en klikken verwerkt 'm gewoon
// opnieuw, zie lib/knowledge/run-indexing.ts). Zelfde patroon als
// AnalyzeSelectedThreadsButton.tsx.
export function IndexSelectedSourcesButton() {
  const { count, selectedIDs } = useSelection();
  const [bezig, setBezig] = useState(false);

  async function start() {
    if (count === 0) {
      toast.error("Selecteer eerst een of meer bronnen.");
      return;
    }
    setBezig(true);
    try {
      const response = await fetch("/api/knowledge/index", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceIds: selectedIDs.map(Number) }),
      });
      const data = (await response.json()) as IndexeerResultaat | { error: string };
      if (!response.ok || "error" in data) {
        toast.error("error" in data ? data.error : "Indexeren mislukt.");
        return;
      }
      toast.success(
        `Verwerkt: ${data.verwerkt} · Geïndexeerd: ${data.geindexeerd} · Mislukt: ${data.mislukt}`
      );
    } catch {
      toast.error("Indexeren mislukt door een netwerk- of serverfout.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <Button onClick={start} disabled={bezig || count === 0} buttonStyle="secondary" size="small">
      {bezig ? "Bezig met indexeren…" : `Indexeer geselecteerde bronnen${count > 0 ? ` (${count})` : ""}`}
    </Button>
  );
}
