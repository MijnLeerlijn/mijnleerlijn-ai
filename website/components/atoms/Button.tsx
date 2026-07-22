import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { focusRing } from "@/utils/focus-ring";
import Spinner from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";
export type ButtonSize = "compact" | "standaard" | "groot";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

// Zie docs/UI-DESIGN.md §7. `primary` gebruikt de variant-accentkleur
// (CSS custom property, zie app/globals.css) — dit is het referentievoorbeeld
// voor variant-onwetende componenten uit PLATFORM-FOUNDATION.md §8.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-[var(--variant-accent)] text-white hover:brightness-90",
  secondary:
    "bg-white text-grijs-900 border border-grijs-200 hover:border-[var(--variant-accent)] hover:text-[var(--variant-accent)]",
  tertiary: "bg-transparent text-[var(--variant-accent)] hover:underline",
  destructive: "bg-rood text-white hover:brightness-90",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  compact: "h-8 px-3 text-sm gap-1.5",
  standaard: "h-10 px-4 text-sm gap-2",
  groot: "h-12 px-6 text-base gap-2",
};

// Gedeelde visuele stijl, ook bruikbaar op een <a> wanneer een primaire actie
// navigeert in plaats van een handeling uitvoert (bv. NoAnswerState) — een
// navigatie hoort semantisch een link te zijn, geen <button>, zie
// docs/UI-DESIGN.md §"gebruik geen ARIA wanneer gewone semantische HTML volstaat".
export function buttonStyles(variant: ButtonVariant = "primary", size: ButtonSize = "standaard"): string {
  return cn(
    "inline-flex items-center justify-center rounded-md font-medium transition-colors duration-[120ms]",
    focusRing,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size]
  );
}

export default function Button({
  variant = "primary",
  size = "standaard",
  loading = false,
  icon,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        buttonStyles(variant, size),
        "disabled:cursor-not-allowed disabled:border-grijs-200 disabled:bg-grijs-200 disabled:text-grijs-400 disabled:hover:brightness-100",
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} label="Bezig" /> : icon}
      {children}
    </button>
  );
}
