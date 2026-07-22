import { cn } from "@/utils/cn";

export type SkeletonVariant = "kaart" | "rij" | "tekst";

const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  kaart: "h-32 w-full rounded-lg",
  rij: "h-12 w-full rounded-md",
  tekst: "h-4 w-full rounded-sm",
};

interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
}

// Zie docs/UI-DESIGN.md §17. Neemt exact de vorm van de uiteindelijke content
// aan (kaart/rij/tekst) — geen generieke spinner voor content met een
// voorspelbare vorm. Respecteert prefers-reduced-motion via het globale
// vangnet in app/globals.css.
export default function Skeleton({ variant = "tekst", className }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn("block animate-pulse bg-grijs-100", VARIANT_CLASSES[variant], className)}
    />
  );
}
