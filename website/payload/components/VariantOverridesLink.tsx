"use client";

import { useDocumentInfo } from "@payloadcms/ui";

// Menu-herindeling (2026-07-31): Variant Overrides heeft geen eigen
// prominente plek in het "Varianten"-menu meer (payload/collections/
// VariantOverrides.ts staat in de "Basis — Technisch beheer"-groep, niet
// admin.hidden — zie het commentaar daar voor waarom niet: `hidden` bleek
// ook de client-side rendering van het editform te blokkeren, niet alleen
// de nav) — bereikbaar via deze link op het Variant-detailscherm,
// voorafgefilterd op déze variant. Geen nieuwe UI: dit opent gewoon
// Payload's eigen, al werkende collectielijst met een querystring-filter,
// geen dubbel bewerkscherm.
export function VariantOverridesLink() {
  const { id } = useDocumentInfo();

  if (id === undefined || id === null) {
    return <p style={{ color: "var(--theme-elevation-400)", fontSize: "13px" }}>Eerst opslaan om overrides te kunnen bekijken.</p>;
  }

  const href = `/admin/collections/variant-overrides?where[variant][equals]=${id}`;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      Content-overrides voor deze variant
    </a>
  );
}
