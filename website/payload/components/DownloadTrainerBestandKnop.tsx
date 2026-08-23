"use client";

import { useDocumentInfo } from "@payloadcms/ui";

// Traineromgeving V2, Fase 3 (2026-08-23) — "Admin mag altijd downloaden"
// (spec §13). Het opgeslagen `storageKey`/`filename`-veld is uitsluitend
// metadata (zie TrainerBestanden.ts) — de daadwerkelijke Blob-URL is privé en
// wordt hier bewust NIET rechtstreeks getoond; deze knop is een gewone
// paginanavigatie (geen fetch nodig) naar de eigen, admin-geautoriseerde
// downloadroute (app/api/trainer-bestanden/[id]/download) — de browser stuurt
// het admin-sessiecookie daar automatisch mee, dezelfde-origin-navigatie.
export function DownloadTrainerBestandKnop() {
  const { id } = useDocumentInfo();
  if (!id) return null;

  return (
    <a
      href={`/api/trainer-bestanden/${id}/download`}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        padding: "0.5rem 0.9rem",
        borderRadius: "4px",
        background: "var(--theme-elevation-100)",
        border: "1px solid var(--theme-elevation-150)",
        color: "var(--theme-text)",
        fontSize: 13,
        fontWeight: 600,
        textDecoration: "none",
      }}
    >
      Download bestand
    </a>
  );
}
