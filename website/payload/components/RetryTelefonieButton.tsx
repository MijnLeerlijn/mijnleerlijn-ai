"use client";

import { useState } from "react";
import { Button, useDocumentInfo } from "@payloadcms/ui";

type Status = "stil" | "bezig" | "geclaimd" | "info" | "fout";
type Uitkomst = "geclaimd" | "niet_van_toepassing" | "nog_niet_zover";

// "Probeer nu opnieuw"-knop op het telefonie-oproep-detailscherm — roept
// POST /api/trainers/telefonie/oproepen/{id}/retry aan (admin-only, zie die
// route + lib/trainers/telefonie/gesprek.ts se verwerkTelefonieHandmatigeRetry).
// Puur presentationeel `type: "ui"`-veld, geen eigen dataveld — zie
// payload/collections/TrainerTelefonieOproepen.ts. Zelfde opbouw als
// GmailSyncButton.tsx (status-state, credentials:"include" — zelfde,
// al bewezen reden: Payload's eigen sessiecookie-Origin-check verwerpt een
// fetch()-POST zonder dit anders stilzwijgend).
//
// Bewust GEEN client-side voorfilter op de huidige status: de server is de
// enige bron van waarheid over of een retry hier zinvol is (zie de route) —
// dit voorkomt dat de knop iets anders toont dan wat daadwerkelijk gebeurt
// als hij wordt ingedrukt.
function boodschapVoor(uitkomst: Uitkomst): string {
  switch (uitkomst) {
    case "geclaimd":
      return "Retry gestart — ververs de pagina zo over een paar seconden voor de nieuwe status.";
    case "nog_niet_zover":
      return "Nog niet mogelijk: de geplande volgende pogingtijd is nog niet verstreken.";
    case "niet_van_toepassing":
      return "Geen actie mogelijk — deze oproep staat niet (meer) op 'transcriptie mislukt, herstelbaar', of wordt al elders verwerkt.";
  }
}

export function RetryTelefonieButton() {
  const { id } = useDocumentInfo();
  const [status, setStatus] = useState<Status>("stil");
  const [boodschap, setBoodschap] = useState<string>("");

  if (id === undefined || id === null) {
    return <p style={{ color: "var(--theme-elevation-400)", fontSize: "13px" }}>Eerst opslaan om een retry te kunnen starten.</p>;
  }

  async function start() {
    setStatus("bezig");
    setBoodschap("");
    try {
      const response = await fetch(`/api/trainers/telefonie/oproepen/${id}/retry`, { method: "POST", credentials: "include" });
      const data = (await response.json()) as { uitkomst: Uitkomst } | { error: string };
      if (!response.ok || "error" in data) {
        setBoodschap("error" in data ? data.error : "Retry mislukt.");
        setStatus("fout");
        return;
      }
      setBoodschap(boodschapVoor(data.uitkomst));
      setStatus(data.uitkomst === "geclaimd" ? "geclaimd" : "info");
    } catch {
      setBoodschap("Retry mislukt door een netwerk- of serverfout.");
      setStatus("fout");
    }
  }

  return (
    <div style={{ marginBottom: "var(--base)" }}>
      <Button onClick={start} disabled={status === "bezig"} buttonStyle="secondary">
        {status === "bezig" ? "Bezig…" : "Probeer nu opnieuw"}
      </Button>
      <p style={{ marginTop: "0.5rem", fontSize: "13px", color: "var(--theme-elevation-400)" }}>
        Alleen van toepassing zolang de status &ldquo;Transcriptie mislukt (herstelbaar)&rdquo; is. Geen audio wordt hier afgespeeld of gedownload.
      </p>
      {status === "geclaimd" && boodschap && <p style={{ marginTop: "0.5rem" }}>{boodschap}</p>}
      {status === "info" && boodschap && <p style={{ marginTop: "0.5rem", color: "var(--theme-elevation-400)" }}>{boodschap}</p>}
      {status === "fout" && boodschap && <p style={{ marginTop: "0.5rem", color: "var(--theme-error-500)" }}>{boodschap}</p>}
    </div>
  );
}
