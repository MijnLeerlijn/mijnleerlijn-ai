"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export interface Toast {
  id: string;
  type: "succes" | "fout" | "waarschuwing" | "info";
  message: string;
}

interface ToastState {
  toasts: Toast[];
  showToast: (type: Toast["type"], message: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastState | null>(null);

// Gedeeld meldingensysteem, zie docs/UI-DESIGN.md §15. Fase 1 levert alleen de
// state/API; het visuele toast-component (organism) wordt in Fase 2
// (component library) gebouwd en leest deze context uit.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (type: Toast["type"], message: string) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, type, message }]);
  };

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>{children}</ToastContext.Provider>
  );
}

export function useToast(): ToastState {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast moet binnen een ToastProvider gebruikt worden");
  }
  return context;
}
