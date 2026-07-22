"use client";

import { createContext, useContext, type ReactNode } from "react";

interface AuthState {
  user: { id: string; naam: string } | null;
  role: "editor" | "admin" | null;
}

const AuthContext = createContext<AuthState>({ user: null, role: null });

// Fase 1: no-op — altijd uitgelogd. Wordt in Fase 4 gevuld via services/auth.ts
// (Auth.js of Clerk, zie open beslissing in docs/TODO.md). Alleen actief
// binnen de (admin)-routegroep, zie docs/PLATFORM-FOUNDATION.md §6.
export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={{ user: null, role: null }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
