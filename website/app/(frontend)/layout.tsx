import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { Inter } from "next/font/google";
import AppProviders from "@/providers/AppProviders";
import { getActiveVariant } from "@/lib/variant/get-active-variant";
import "../globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Multi-brand variants (2026-07-30): was een statische `export const
// metadata` — per-request variant-afhankelijke titel/omschrijving vereist
// Next.js' generateMetadata() i.p.v. een module-scope constante.
export async function generateMetadata(): Promise<Metadata> {
  const variant = await getActiveVariant();
  return {
    title: `${variant.branding.productName} — Vind direct antwoord op je vraag`,
    description: `Handleidingen en uitleg over ${variant.branding.productName}, overzichtelijk per onderwerp.`,
  };
}

// Root layout voor de site-kant van de applicatie ((public)/(admin)/dev) —
// verplaatst van app/layout.tsx naar app/(frontend)/layout.tsx zodat
// app/(payload) ernaast een eigen, onafhankelijke root-layout kan hebben met
// een eigen <html>/<body> (Payload's admin-UI rendert die zelf, zie
// docs/PLATFORM-FOUNDATION.md §9 en het Fase 4-opleveringsrapport). Next.js
// ondersteunt dit expliciet via "multiple root layouts" (route groups zonder
// gedeelde top-level app/layout.tsx) — zie app/global-not-found.tsx voor de
// bijbehorende 404-oplossing.
export default async function FrontendRootLayout({ children }: { children: ReactNode }) {
  const variant = await getActiveVariant();

  // Server-side gezette CSS custom property: geen flits van de verkeerde
  // kleur, want deze staat al vóór hydratie vast. Zie app/globals.css
  // (fallback) en docs/PLATFORM-FOUNDATION.md §7/§8.
  const variantStyle = { "--variant-accent": variant.branding.accentColor } as CSSProperties;

  return (
    <html lang="nl" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans" style={variantStyle}>
        <AppProviders variant={variant}>{children}</AppProviders>
      </body>
    </html>
  );
}
