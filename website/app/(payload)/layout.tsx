import type { ServerFunctionClient } from "payload";
import config from "@/payload.config";
import { handleServerFunctions, RootLayout } from "@payloadcms/next/layouts";
import { importMap } from "./admin/importMap";
import "@payloadcms/next/css";
// Admin-rebrand Fase 1 (2026-08-12) — MijnLeerlijn-huisstijl bovenop
// Payload's eigen admin-CSS. Werkt zonder speciale Payload-configuratie-
// sleutel (bestaat niet in deze versie): Payload's eigen tokens/klassen
// staan in een CSS-laag (@layer payload-default), dus wint deze
// niet-gelaagde import automatisch, ongeacht ladingsvolgorde/specificiteit
// — zie de toelichting bovenin dat bestand.
import "@/payload/components/admin-shell.css";

type Args = { children: React.ReactNode };

// Onafhankelijke root-layout voor Payload's eigen admin-UI — eigen
// <html>/<body>, gescheiden van app/(frontend)/layout.tsx. Zie
// docs/PLATFORM-FOUNDATION.md §9 en het Fase 4-opleveringsrapport voor de
// motivatie van deze "multiple root layouts"-opzet.
const serverFunction: ServerFunctionClient = async function (args) {
  "use server";
  return handleServerFunctions({ ...args, config, importMap });
};

export default function PayloadLayout({ children }: Args) {
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {children}
    </RootLayout>
  );
}
