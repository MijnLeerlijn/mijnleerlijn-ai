import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Manrope } from "next/font/google";
import "../globals.css";
import "./trainers-portal.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trainerportal — MijnLeerlijn",
  description: "Overzicht van je scholen en trainingen.",
};

// Onafhankelijke root-layout voor trainers.mijnleerlijn.chat — eigen
// <html>/<body>, los van app/(frontend)/layout.tsx en app/(payload)/
// layout.tsx (Next.js "multiple root layouts", zie next.config.ts
// experimental.globalNotFound + app/global-not-found.tsx). Bewust GEEN
// getActiveVariant()/AppProviders: dit subdomein kent geen variant-concept
// (proxy.ts se trainersPortalRewrite() loopt hier volledig buitenom, zie
// proxy.ts) en is ook geen Payload-adminscherm — een trainer moet dit nooit
// als "de Helpdesk-beheeromgeving" herkennen, vandaar een eigen koplettertype
// (Manrope, i.p.v. de publieke site se Inter-only) op een overigens gedeelde
// basis (Tailwind + de bestaande merktokens uit app/globals.css: kleuren,
// randradius, schaduw, typografieschaal — zie architectuurrapport §11).
export default function TrainersRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" className={`${inter.variable} ${manrope.variable} h-full antialiased`}>
      <body className="min-h-full bg-grijs-50 text-grijs-900 font-sans">{children}</body>
    </html>
  );
}
