import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export type BadgeTone = "success" | "info" | "warning" | "error" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-groen/10 text-groen",
  info: "bg-blauw/10 text-blauw",
  warning: "bg-oranje/10 text-oranje",
  error: "bg-rood/10 text-rood",
  neutral: "bg-grijs-100 text-grijs-600",
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

// Statuslabel — zie docs/UI-DESIGN.md §15/§22. Kleur is altijd gekoppeld aan
// een vaste betekenis, nooit willekeurig — zie docs/DESIGN-SYSTEM.md.
export default function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2.5 py-1 text-xs font-medium",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
