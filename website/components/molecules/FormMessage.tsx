import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/utils/cn";

export type FormMessageTone = "error" | "success" | "info";

const TONE_CONFIG: Record<FormMessageTone, { icon: typeof AlertCircle; className: string }> = {
  error: { icon: AlertCircle, className: "text-rood" },
  success: { icon: CheckCircle2, className: "text-groen" },
  info: { icon: Info, className: "text-blauw" },
};

interface FormMessageProps {
  tone: FormMessageTone;
  children: ReactNode;
  id?: string;
}

// Inline formuliermelding — zie docs/UI-DESIGN.md §8/§15. Kleur is nooit de
// enige drager: altijd icoon + tekst.
export default function FormMessage({ tone, children, id }: FormMessageProps) {
  const { icon: Icon, className } = TONE_CONFIG[tone];
  return (
    <p
      id={id}
      role={tone === "error" ? "alert" : undefined}
      className={cn("mt-1.5 flex items-center gap-1.5 text-sm", className)}
    >
      <Icon size={16} aria-hidden className="shrink-0" />
      {children}
    </p>
  );
}
