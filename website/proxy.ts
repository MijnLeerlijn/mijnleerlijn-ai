import { NextResponse, type NextRequest } from "next/server";

// Variant-herkenningsskelet — zie docs/ARCHITECTURE.md
// §Variant-herkenningsmechanisme en docs/PLATFORM-FOUNDATION.md §1/§3.
//
// Bestandsnaam: PLATFORM-FOUNDATION.md noemt dit "middleware.ts" (de op dat
// moment geldige Next.js-conventie). Next.js 16.2.10 (de geïnstalleerde
// versie) heeft die conventie hernoemd naar "proxy.ts" — zelfde functie,
// nieuwe naam. Zie "Bewuste afwijkingen" in de Fase 1-oplevering.
//
// Volgorde (nog te implementeren vanaf Fase 4, wanneer er echte Variant-data
// bestaat): 1) custom domain  2) subdomain  3) pad-gebaseerde slug-fallback
// 4) default-variant. De opgeloste variant wordt als request-header
// doorgegeven, zodat elke Server Component via lib/variant/get-active-variant.ts
// dezelfde, al-opgeloste variant leest — geen route hoeft zelf domein/slug te
// interpreteren.
//
// Fase 1: nog geen echte resolutie — geeft altijd de standaardvariant door,
// zodat het mechanisme (header doorgeven, downstream lezen) al staat.
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("x-variant-slug", "mijnleerlijn");
  return response;
}

export const config = {
  matcher: [
    /*
     * Sluit statische bestanden en Next.js-interne paden uit.
     */
    "/((?!_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
