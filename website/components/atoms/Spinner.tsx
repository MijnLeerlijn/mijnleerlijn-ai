import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

// Zie docs/UI-DESIGN.md §17 (loading states) en §32 (animaties). Respecteert
// prefers-reduced-motion via de globale motion-reduce-override in globals.css.
export default function Spinner({ size = 16, className, label = "Bezig met laden" }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2 size={size} className={cn("animate-spin motion-reduce:animate-none", className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
