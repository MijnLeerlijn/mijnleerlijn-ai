import type { ServerFunctionClient } from "payload";
import config from "@/payload.config";
import { handleServerFunctions, RootLayout } from "@payloadcms/next/layouts";
import { importMap } from "./admin/importMap";
import "@payloadcms/next/css";

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
