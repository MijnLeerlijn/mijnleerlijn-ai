import { cn } from "@/utils/cn";

interface DividerProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

// Neutrale scheidingslijn — zie docs/UI-DESIGN.md §16 (Ontdek-sectie-koppen
// gebruiken dit náást de GradientAccent-lijn, niet als vervanging ervoor).
export default function Divider({ orientation = "horizontal", className }: DividerProps) {
  return (
    <span
      role="separator"
      aria-orientation={orientation}
      className={cn(orientation === "horizontal" ? "h-px w-full" : "h-full w-px", "bg-grijs-200", className)}
    />
  );
}
