import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { focusRing, focusRingOnDark } from "@/utils/focus-ring";

interface ChipProps {
  children: ReactNode;
  /** Wanneer aanwezig wordt de chip een klikbare knop (voorbeeldvraag/filter); anders een niet-interactieve tag. */
  onClick?: () => void;
  selected?: boolean;
  onDark?: boolean;
  className?: string;
}

// Eén component voor voorbeeldvraag-chip, filter-chip én niet-interactieve tag
// (bv. "gerelateerd onderwerp") — zie docs/UI-DESIGN.md §Invoer en de
// componentinventarisatie in IMPLEMENTATION-PLAN.md (bewust samengevoegd,
// geen SearchSuggestion/Tag als losse componenten).
export default function Chip({ children, onClick, selected = false, onDark = false, className }: ChipProps) {
  const shared = cn(
    "rounded-full border px-4 py-2 text-sm transition-colors duration-[120ms]",
    onDark
      ? cn(
          "border-white/30 text-white",
          selected && "bg-white/20 border-white",
          !selected && "hover:border-white/50 hover:bg-white/10"
        )
      : cn(
          "border-grijs-300 bg-white text-grijs-900",
          selected &&
            "border-[var(--variant-accent)] bg-[var(--variant-accent)]/8 text-[var(--variant-accent)]"
        ),
    className
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={cn(shared, onDark ? focusRingOnDark : focusRing)}
      >
        {children}
      </button>
    );
  }

  return <span className={shared}>{children}</span>;
}
