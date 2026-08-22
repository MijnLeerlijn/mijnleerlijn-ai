"use client";

import { useState } from "react";
import { Button, useDocumentInfo } from "@payloadcms/ui";

// "Maak trainerversie"-knop op het artikel-detailscherm (Articles.ts) —
// roept POST /api/creator/trainer-kennisversie aan (AI-herschrijving,
// bewaart zelf niets), en slaat het resultaat vervolgens zelf op als een
// nieuw trainer-kennisversies-record (status "concept") via Payload's eigen
// REST-API — zelfde tweestaps-opzet als CreatorView.tsx se "Maak
// [variant]-versie" (genereren en opslaan zijn bewust twee losse
// aanroepen/routes — zie /api/creator/trainer-kennisversie se eigen
// toelichting). credentials:"include" op beide aanroepen — zelfde, al
// bewezen reden als RetryTelefonieButton.tsx: Payload's eigen
// sessiecookie-Origin-check verwerpt een fetch()-POST zonder dit anders
// stilzwijgend.
//
// json() hieronder is bewust een letterlijke kopie van CreatorView.tsx se
// eigen helper (niet geëxporteerd daarvandaan) — vangt zowel Payload's
// eigen {errors:[{message}]}-vorm (de tweede aanroep, native REST) als de
// {error: string}-vorm van de eigen app/api/creator/*-routes (de eerste
// aanroep) op, i.p.v. beide stilzwijgend te vervangen door een generieke
// foutmelding.
async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as (T & { errors?: { message?: string }[]; error?: string }) | null;
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.error || "Actie mislukt.");
  return data as T;
}

type Status = "stil" | "bezig" | "gelukt" | "fout";

export function MaakTrainerversieButton() {
  const { id } = useDocumentInfo();
  const [status, setStatus] = useState<Status>("stil");
  const [boodschap, setBoodschap] = useState<string>("");
  const [nieuweId, setNieuweId] = useState<number | null>(null);

  if (id === undefined || id === null) {
    return <p style={{ color: "var(--theme-elevation-400)", fontSize: "13px" }}>Eerst opslaan om een trainerversie te kunnen maken.</p>;
  }

  async function start() {
    setStatus("bezig");
    setBoodschap("");
    setNieuweId(null);
    try {
      const genRes = await fetch("/api/creator/trainer-kennisversie", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: id }),
      });
      const genData = await json<{ titel: string; tekst: string }>(genRes);

      const saveRes = await fetch("/api/trainer-kennisversies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceArticle: id, titel: genData.titel, tekst: genData.tekst, status: "concept", generatedByAi: true }),
      });
      const saveData = await json<{ doc: { id: number } }>(saveRes);

      setNieuweId(saveData.doc.id);
      setBoodschap("Conceptversie aangemaakt — controleer en bewerk de tekst voordat je publiceert.");
      setStatus("gelukt");
    } catch (error) {
      setBoodschap(error instanceof Error ? error.message : "Mislukt door een netwerk- of serverfout.");
      setStatus("fout");
    }
  }

  return (
    <div style={{ marginBottom: "var(--base)" }}>
      <Button onClick={start} disabled={status === "bezig"} buttonStyle="secondary">
        {status === "bezig" ? "Bezig met genereren…" : "Maak trainerversie"}
      </Button>
      <p style={{ marginTop: "0.5rem", fontSize: "13px", color: "var(--theme-elevation-400)" }}>
        AI herschrijft dit artikel vanuit trainersperspectief als nieuw concept, met dezelfde feiten. Publiceren voor trainers gebeurt apart, via de status van die conceptversie.
      </p>
      {status === "gelukt" && (
        <p style={{ marginTop: "0.5rem", color: "var(--theme-success-500)" }}>
          {boodschap} {nieuweId && <a href={`/admin/collections/trainer-kennisversies/${nieuweId}`}>Open conceptversie →</a>}
        </p>
      )}
      {status === "fout" && boodschap && <p style={{ marginTop: "0.5rem", color: "var(--theme-error-500)" }}>{boodschap}</p>}
    </div>
  );
}
