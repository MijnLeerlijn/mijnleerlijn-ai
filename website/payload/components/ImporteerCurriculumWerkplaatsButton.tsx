"use client";

import { useState } from "react";
import { Button, toast } from "@payloadcms/ui";

interface ImportResultaat {
  aangemaakt: number;
  bijgewerkt: number;
  verwerkt: number;
  fouten: { slug: string; melding: string }[];
}

// "Curriculum Werkplaats kennis importeren"-knop (Helpdesk-beheerkoppeling-
// uitbreiding 2026-08-10) — naast MaakEmbeddingsButton.tsx op de Artikelen-
// lijst (zie admin.components.listMenuItems in payload/collections/
// Articles.ts). In tegenstelling tot die knop hoeft hier NIETS
// geselecteerd te worden: deze knop roept altijd exact dezelfde vaste
// serverroute aan (POST /api/knowledge/import-curriculum-werkplaats), die
// zelf al hard begrensd is tot de 19 Curriculum Werkplaats-documenten —
// er is dus ook aan de knop-kant geen selectie/param nodig of mogelijk.
// Embeddings worden hier bewust NIET automatisch aangeroepen na de import
// (aparte, expliciete stap via "Maak embeddings", zoals gevraagd) — de
// toast na afloop herinnert daar expliciet aan.
export function ImporteerCurriculumWerkplaatsButton() {
  const [bezig, setBezig] = useState(false);

  async function start() {
    setBezig(true);
    try {
      const response = await fetch("/api/knowledge/import-curriculum-werkplaats", {
        method: "POST",
        credentials: "include",
      });
      const data = (await response.json()) as ImportResultaat | { error: string };
      if (!response.ok || "error" in data) {
        toast.error("error" in data ? data.error : "Importeren mislukt.");
        return;
      }
      const foutmelding = data.fouten.length > 0 ? ` · ${data.fouten.length} fout(en), zie serverlogs` : "";
      toast.success(
        `Curriculum Werkplaats-kennis geïmporteerd — aangemaakt: ${data.aangemaakt} · bijgewerkt: ${data.bijgewerkt} · verwerkt: ${data.verwerkt} van 19${foutmelding}. ` +
          "Vergeet niet: klik hierna nog op \"Maak embeddings\" om deze artikelen doorzoekbaar te maken voor de AI-assistent."
      );
    } catch {
      toast.error("Importeren mislukt door een netwerk- of serverfout.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <Button onClick={start} disabled={bezig} buttonStyle="secondary" size="small">
      {bezig ? "Bezig met importeren…" : "Curriculum Werkplaats kennis importeren"}
    </Button>
  );
}
