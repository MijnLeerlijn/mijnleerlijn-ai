"use client";

import { useState } from "react";
import { Button, toast, useSelection } from "@payloadcms/ui";

interface AnalyseResultaat {
  geanalyseerd: number;
  conceptenGemaakt: number;
  bestaandeConceptenBijgewerkt: number;
  genegeerd: number;
  mislukt: number;
  fouten: string[];
}

// "Analyseer geselecteerde threads"-knop in de lijstweergave van
// support-threads — geregistreerd via admin.components.listMenuItems (zie
// payload/collections/SupportThreads.ts), dat binnen dezelfde
// SelectionProvider rendert als de rest van de lijst, dus useSelection()
// werkt hier. Resultaat als toast, niet inline: hier is weinig ruimte in de
// lijst-toolbar.
export function AnalyzeSelectedThreadsButton() {
  const { count, selectedIDs } = useSelection();
  const [bezig, setBezig] = useState(false);

  async function start() {
    if (count === 0) {
      toast.error("Selecteer eerst een of meer threads.");
      return;
    }
    setBezig(true);
    try {
      const response = await fetch("/api/support/analyze", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadIds: selectedIDs.map(Number) }),
      });
      const data = (await response.json()) as AnalyseResultaat | { error: string };
      if (!response.ok || "error" in data) {
        toast.error("error" in data ? data.error : "Analyse mislukt.");
        return;
      }
      toast.success(
        `Geanalyseerd: ${data.geanalyseerd} · Concepten gemaakt: ${data.conceptenGemaakt} · Bijgewerkt: ${data.bestaandeConceptenBijgewerkt} · Genegeerd: ${data.genegeerd} · Mislukt: ${data.mislukt}`
      );
    } catch {
      toast.error("Analyse mislukt door een netwerk- of serverfout.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <Button onClick={start} disabled={bezig || count === 0} buttonStyle="secondary" size="small">
      {bezig ? "Bezig met analyseren…" : `Analyseer geselecteerde threads${count > 0 ? ` (${count})` : ""}`}
    </Button>
  );
}
