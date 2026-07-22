"use client";

import { useState } from "react";
import { Button } from "@payloadcms/ui";

interface SyncResultaat {
  gevonden: number;
  nieuw: number;
  bijgewerkt: number;
  overgeslagen: number;
  mislukt: number;
  fouten: string[];
}

type Status = "stil" | "bezig" | "klaar" | "fout";

// "Test synchronisatie"-knop op de gmail-connection-global — roept
// POST /api/gmail/sync aan (admin-only, zie die route) en toont het
// resultaat. Puur presentationeel `type: "ui"`-veld, geen eigen dataveld —
// zie payload/globals/GmailConnection.ts.
//
// `credentials: "include"` is bewust expliciet, niet het fetch-standaard-
// gedrag: exact hetzelfde patroon dat @payloadcms/ui zelf overal gebruikt
// voor eigen interne aanvragen vanuit het beheerscherm (bevestigd door de
// hele pakketbroncode na te lopen — geen enkele interne fetch() daar
// vertrouwt op de default). Zonder dit werd de sessiecookie niet
// meegestuurd, waardoor de route (terecht) een niet-beheerder zag.
export function GmailSyncButton() {
  const [status, setStatus] = useState<Status>("stil");
  const [resultaat, setResultaat] = useState<SyncResultaat | null>(null);
  const [foutmelding, setFoutmelding] = useState<string>("");

  async function start() {
    setStatus("bezig");
    setFoutmelding("");
    try {
      const response = await fetch("/api/gmail/sync", { method: "POST", credentials: "include" });
      const data = (await response.json()) as SyncResultaat | { error: string };
      if (!response.ok || "error" in data) {
        setFoutmelding("error" in data ? data.error : "Synchronisatie mislukt.");
        setStatus("fout");
        return;
      }
      setResultaat(data);
      setStatus("klaar");
    } catch {
      setFoutmelding("Synchronisatie mislukt door een netwerk- of serverfout.");
      setStatus("fout");
    }
  }

  return (
    <div style={{ marginBottom: "var(--base)" }}>
      <Button onClick={start} disabled={status === "bezig"} buttonStyle="secondary">
        {status === "bezig" ? "Bezig met synchroniseren…" : "Test synchronisatie"}
      </Button>

      {status === "klaar" && resultaat && (
        <p style={{ marginTop: "0.5rem" }}>
          Gevonden: {resultaat.gevonden} · Nieuw: {resultaat.nieuw} · Bijgewerkt: {resultaat.bijgewerkt} ·
          Overgeslagen: {resultaat.overgeslagen} · Mislukt: {resultaat.mislukt}
          {resultaat.fouten.length > 0 && (
            <>
              <br />
              <span style={{ color: "var(--theme-error-500)" }}>
                {resultaat.fouten.length} thread(s) gaven een fout — zie serverlogs voor details.
              </span>
            </>
          )}
        </p>
      )}

      {status === "fout" && (
        <p style={{ marginTop: "0.5rem", color: "var(--theme-error-500)" }}>{foutmelding}</p>
      )}
    </div>
  );
}
