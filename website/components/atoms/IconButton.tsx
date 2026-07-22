import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";
import { focusRing, focusRingOnDark } from "@/utils/focus-ring";

export type IconButtonBoxSize = "compact" | "standaard";

const BOX_CLASSES: Record<IconButtonBoxSize, string> = {
  compact: "h-8 w-8",
  standaard: "h-10 w-10",
};

const ICON_SIZE: Record<IconButtonBoxSize, number> = {
  compact: 16,
  standaard: 20,
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Verplicht — een icoon-only knop zonder toegankelijke naam is onbruikbaar met een screenreader. */
  "aria-label": string;
  /** Vaste tikdoelgrootte i.p.v. losse breedte/hoogte-classes — voorkomt class-conflicten via className. */
  boxSize?: IconButtonBoxSize;
  /** Gebruik op donkere achtergronden (bv. de Hero) voor voldoende focus-contrast. */
  onDark?: boolean;
}

// Zie docs/UI-DESIGN.md §7/§35. Vervangt de losse, bijna-identieke icoon-knoppen
// die in het Fase 1-prototype verspreid stonden (Header zoek-/menu-knop,
// Hero-verzendknop) — daadwerkelijk hergebruik, geen speculatieve abstractie.
export default function IconButton({
  icon: Icon,
  boxSize = "standaard",
  onDark = false,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      className={cn(
        "flex items-center justify-center rounded-md transition-colors duration-[120ms]",
        "disabled:cursor-not-allowed disabled:text-grijs-300",
        BOX_CLASSES[boxSize],
        onDark ? focusRingOnDark : focusRing,
        className
      )}
      {...rest}
    >
      <Icon size={ICON_SIZE[boxSize]} aria-hidden />
    </button>
  );
}
