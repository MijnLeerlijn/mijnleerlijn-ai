"use client";

import { useState } from "react";
import { Button } from "@payloadcms/ui";

interface AnalyseResultaat {
  geanalyseerd: number;
  conceptenGemaakt: number;
  bestaandeConceptenBijgewerkt: number;
  genegeerd: number;
  mislukt: number;
  fouten: string[];
}

type Status = "stil" | "bezig" | "klaar" | "fout";

// "Analyseer nieuwe threads"-knop op de gmail-connection-global — roept
// POST /api/support/analyze aan zonder threadIds, waardoor de route zelf tot
// vijf nog niet (succesvol) geanalyseerde threads kiest (zie lib/support/
// run-analysis.ts). Zelfde fetch-/auth-patroon als GmailSyncButton.tsx.
export function AnalyzeNewThreadsButton() {
  const [status, setStatus] = useState<Status>("stil");
  const [resultaat, setResultaat] = useState<AnalyseResultaat | null>(null);
  const [foutmelding, setFoutmelding] = useState<string>("");

  async function start() {
    setStatus("bezig");
    setFoutmelding("");
    try {
      const response = await fetch("/api/support/analyze", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as AnalyseResultaat | { error: string };
      if (!response.ok || "error" in data) {
        setFoutmelding("error" in data ? data.error : "Analyse mislukt.");
        setStatus("fout");
        return;
      }
      setResultaat(data);
      setStatus("klaar");
    } catch {
      setFoutmelding("Analyse mislukt door een netwerk- of serverfout.");
      setStatus("fout");
    }
  }

  return (
    <div style={{ marginBottom: "var(--base)" }}>
      <Button onClick={start} disabled={status === "bezig"} buttonStyle="secondary">
        {status === "bezig" ? "Bezig met analyseren…" : "Analyseer nieuwe threads"}
      </Button>

      {status === "klaar" && resultaat && (
        <p style={{ marginTop: "0.5rem" }}>
          Geanalyseerd: {resultaat.geanalyseerd} · Concepten gemaakt: {resultaat.conceptenGemaakt} · Bestaande
          concepten bijgewerkt: {resultaat.bestaandeConceptenBijgewerkt} · Genegeerd: {resultaat.genegeerd} ·
          Mislukt: {resultaat.mislukt}
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
