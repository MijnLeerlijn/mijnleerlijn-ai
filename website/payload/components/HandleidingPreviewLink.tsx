"use client";

import { useFormFields } from "@payloadcms/ui";

// "Bekijk preview" — geen aparte iframe-live-preview (Payload's ingebouwde
// livePreview-functie wordt nergens in deze codebase gebruikt en vereist een
// nieuwe dependency), maar simpelweg de ECHTE publieke pagina in een nieuw
// tabblad. Dat werkt ook voor een concept/gearchiveerde handleiding: de
// publieke pagina (app/(frontend)/(public)/handleidingen/[slug]/page.tsx)
// herkent een ingelogde beheerder/redacteur via dezelfde sessie als /admin
// en toont dan ook niet-gepubliceerde content — zie de leesregel op die
// pagina. Leest de slug live uit het formulier (nog niet opgeslagen waarde),
// zodat de link al werkt vóór de eerste keer opslaan.
export function HandleidingPreviewLink() {
  const slug = useFormFields(([fields]) => fields.slug?.value as string | undefined);

  if (!slug) {
    return <p style={{ color: "var(--theme-elevation-400)", fontSize: "13px" }}>Vul eerst een slug in.</p>;
  }

  return (
    <a href={`/handleidingen/${slug}`} target="_blank" rel="noopener noreferrer">
      Bekijk preview
    </a>
  );
}
