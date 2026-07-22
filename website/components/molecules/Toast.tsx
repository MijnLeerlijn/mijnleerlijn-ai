import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import type { Toast as ToastData } from "@/providers/ToastProvider";
import IconButton from "@/components/atoms/IconButton";

const TONE_CONFIG = {
  succes: { icon: CheckCircle2, className: "text-groen" },
  fout: { icon: AlertCircle, className: "text-rood" },
  waarschuwing: { icon: AlertTriangle, className: "text-oranje" },
  info: { icon: Info, className: "text-blauw" },
} as const;

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

// Visuele tegenhanger van providers/ToastProvider.tsx (Fase 1 leverde alleen
// de state/API) — zie docs/UI-DESIGN.md §15.
export default function Toast({ toast, onDismiss }: ToastProps) {
  const { icon: Icon, className } = TONE_CONFIG[toast.type];

  return (
    <div
      role={toast.type === "fout" ? "alert" : "status"}
      className="flex max-w-[360px] items-start gap-2 rounded-md bg-grijs-900 px-4 py-3 text-white shadow-lg"
    >
      <Icon size={18} aria-hidden className={`mt-0.5 shrink-0 ${className}`} />
      <p className="flex-1 text-sm">{toast.message}</p>
      <IconButton
        icon={X}
        aria-label="Melding sluiten"
        boxSize="compact"
        onDark
        onClick={() => onDismiss(toast.id)}
        className="text-white/70 hover:text-white"
      />
    </div>
  );
}
