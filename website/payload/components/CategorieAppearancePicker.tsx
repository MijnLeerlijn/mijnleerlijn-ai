"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { FileText, X } from "lucide-react";
import { TextInput } from "@payloadcms/ui";
import { iconNames, populaireIconen, normaliseerIconNaam, iconWeergavenaam } from "@/lib/data/lucide-icon-lookup";
import { CATEGORIE_KLEUREN, normaliseerKleur } from "@/lib/data/categorie-kleuren";
import type { CategorieKleur } from "@/lib/data/categories";

// Categorie-uiterlijk (2026-07-29): admin-eigen icoon-/kleurpicker voor
// payload/components/DownloadcategorieenView.tsx. De Payload-adminshell laadt
// GEEN Tailwind (app/(payload)/layout.tsx importeert alleen
// @payloadcms/next/css) — de publieke, Tailwind-gebaseerde
// components/atoms/CategorieIcoon.tsx kan hier dus niet hergebruikt worden;
// deze component gebruikt inline `style` + Payload's eigen `var(--theme-*)`,
// dezelfde stijl als de rest van dit bestand se buurbestanden
// (DownloadbeheerView.tsx/DownloadcategorieenView.tsx).
//
// Iconenkeuze doorzoekt de VOLLEDIGE Lucide-bibliotheek (lucide-react/dynamic,
// zie lib/data/lucide-icon-lookup.ts) — zonder zoekopdracht tonen we alleen
// `populaireIconen` (een handvol veelgebruikte namen) i.p.v. alle ~2000
// iconen in één keer, dat maakt het paneel overzichtelijk en snel.
const MAX_ZOEKRESULTATEN = 48;

interface CategorieAppearancePickerProps {
  categorieNaam: string;
  icon: string;
  color: string;
  onIconChange: (icoon: string) => void;
  onColorChange: (kleur: CategorieKleur) => void;
}

function IconFallback() {
  return <FileText size={18} />;
}

function IconTegel({ naam, actief, onClick }: { naam: IconName; actief: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={iconWeergavenaam(naam)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.4rem 0.25rem",
        width: 76,
        borderRadius: 6,
        border: actief ? "2px solid var(--theme-success-500)" : "1px solid var(--theme-elevation-150)",
        background: actief ? "var(--theme-success-100)" : "var(--theme-input-bg)",
        cursor: "pointer",
      }}
    >
      <DynamicIcon name={naam} size={20} fallback={IconFallback} />
      <span style={{ fontSize: 10, textAlign: "center", lineHeight: 1.15, color: "var(--theme-elevation-600)" }}>
        {iconWeergavenaam(naam)}
      </span>
    </button>
  );
}

export function CategorieAppearancePicker({
  categorieNaam,
  icon,
  color,
  onIconChange,
  onColorChange,
}: CategorieAppearancePickerProps) {
  const [zoekterm, setZoekterm] = useState("");

  const huidigIcoon = normaliseerIconNaam(icon);
  const huidigeKleur = normaliseerKleur(color);
  const huidigeKleurInfo = CATEGORIE_KLEUREN.find((k) => k.value === huidigeKleur) ?? CATEGORIE_KLEUREN[0]!;

  // Leeg zoekveld -> altijd terug naar de populaire-iconenlijst, geen aparte
  // modus nodig: puur afgeleid van `zoekterm === ""`.
  const teTonenIconen = useMemo(() => {
    const term = zoekterm.trim().toLowerCase();
    if (!term) return populaireIconen;
    return iconNames.filter((naam) => naam.includes(term)).slice(0, MAX_ZOEKRESULTATEN);
  }, [zoekterm]);

  function PreviewFallback() {
    return <FileText size={22} color={huidigeKleurInfo.hex} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <div
          style={{
            display: "flex",
            height: 40,
            width: 40,
            flexShrink: 0,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "9999px",
            background: `${huidigeKleurInfo.hex}22`,
          }}
        >
          <DynamicIcon name={huidigIcoon} size={22} color={huidigeKleurInfo.hex} fallback={PreviewFallback} />
        </div>
        <span style={{ fontWeight: 600 }}>{categorieNaam.trim() || "Nieuwe categorie"}</span>
      </div>

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {CATEGORIE_KLEUREN.map((k) => (
          <button
            key={k.value}
            type="button"
            title={k.label}
            aria-label={k.label}
            onClick={() => onColorChange(k.value)}
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: k.hex,
              cursor: "pointer",
              border: huidigeKleur === k.value ? "3px solid var(--theme-text)" : "1px solid var(--theme-elevation-150)",
              padding: 0,
            }}
          />
        ))}
      </div>

      <div style={{ maxWidth: 440 }}>
        <div style={{ position: "relative" }}>
          <TextInput
            path="zoekIcoon"
            value={zoekterm}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setZoekterm(e.target.value)}
            placeholder="Zoek een icoon…"
          />
          {zoekterm && (
            <button
              type="button"
              onClick={() => setZoekterm("")}
              aria-label="Zoekopdracht wissen"
              style={{
                position: "absolute",
                right: 8,
                top: 8,
                border: "none",
                background: "none",
                cursor: "pointer",
                display: "flex",
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <p style={{ fontSize: 11, color: "var(--theme-elevation-500)", margin: "0.35rem 0" }}>
          {zoekterm
            ? `Zoekresultaten in de volledige iconenbibliotheek (max. ${MAX_ZOEKRESULTATEN})`
            : "Populaire iconen — typ hierboven om de volledige Lucide-bibliotheek te doorzoeken"}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", maxHeight: 220, overflowY: "auto" }}>
          {teTonenIconen.map((naam) => (
            <IconTegel key={naam} naam={naam} actief={naam === huidigIcoon} onClick={() => onIconChange(naam)} />
          ))}
          {zoekterm && teTonenIconen.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--theme-elevation-500)" }}>Geen iconen gevonden voor &quot;{zoekterm}&quot;.</p>
          )}
        </div>
      </div>
    </div>
  );
}
