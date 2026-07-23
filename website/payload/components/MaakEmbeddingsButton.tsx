"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button, toast, useSelection } from "@payloadcms/ui";

interface EmbedResultaat {
  verwerkt: number;
  geembed: number;
  overgeslagen: number;
  genegeerd: number;
  mislukt: number;
  fouten: string[];
}

// "Maak embeddings"-knop, hergebruikt op knowledge-sources, knowledge-drafts
// en articles (zie admin.components.listMenuItems in die drie collecties).
// Herkent de eigen collectie via het admin-URL-pad
// (/admin/collections/<slug>) i.p.v. drie losse componenten te bouwen.
// Dekt ook herembedden: een reeds geëmbede rij opnieuw selecteren en
// klikken verwerkt 'm gewoon opnieuw (lib/embeddings/embed-record.ts slaat
// alleen echt ongewijzigde tekst over).
export function MaakEmbeddingsButton() {
  const { count, selectedIDs } = useSelection();
  const pathname = usePathname();
  const [bezig, setBezig] = useState(false);

  const collectionMatch = pathname?.match(/\/collections\/([^/]+)/);
  const collection = collectionMatch?.[1];

  async function start() {
    if (count === 0) {
      toast.error("Selecteer eerst een of meer rijen.");
      return;
    }
    if (!collection) {
      toast.error("Kon de collectie niet bepalen.");
      return;
    }
    setBezig(true);
    try {
      const response = await fetch("/api/knowledge/embed", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection, ids: selectedIDs.map(Number) }),
      });
      const data = (await response.json()) as EmbedResultaat | { error: string };
      if (!response.ok || "error" in data) {
        toast.error("error" in data ? data.error : "Embedden mislukt.");
        return;
      }
      toast.success(
        `Verwerkt: ${data.verwerkt} · Geëmbed: ${data.geembed} · Overgeslagen: ${data.overgeslagen} · Genegeerd: ${data.genegeerd} · Mislukt: ${data.mislukt}`
      );
    } catch {
      toast.error("Embedden mislukt door een netwerk- of serverfout.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <Button onClick={start} disabled={bezig || count === 0} buttonStyle="secondary" size="small">
      {bezig ? "Bezig met embedden…" : `Maak embeddings${count > 0 ? ` (${count})` : ""}`}
    </Button>
  );
}
