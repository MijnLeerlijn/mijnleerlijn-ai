"use client";

import Toast from "@/components/molecules/Toast";
import { useToast } from "@/providers/ToastProvider";

// Rendert de toasts uit providers/ToastProvider.tsx — zie
// docs/PLATFORM-FOUNDATION.md §6 ("visuele tegenhanger volgt in Fase 2").
// Hoort in de root layout, buiten elke specifieke pagina.
export default function ToastViewport() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
