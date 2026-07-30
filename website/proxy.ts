import { NextResponse, type NextRequest } from "next/server";
import { variantResolver } from "@/lib/variant/variant-resolver-instance";

// Variant-herkenning — zie docs/ARCHITECTURE.md §Variant-herkenningsmechanisme
// en docs/MULTI-VARIANT-STRATEGY.md.
//
// Bestandsnaam: PLATFORM-FOUNDATION.md noemt dit "middleware.ts" (de op dat
// moment geldige Next.js-conventie). Next.js 16.2.10 (de geïnstalleerde
// versie) heeft die conventie hernoemd naar "proxy.ts" — zelfde functie,
// nieuwe naam.
//
// Multi-brand variants (2026-07-30): echte resolutie, via variantResolver
// (lib/variant/variant-resolver-instance.ts) — 1) custom domain 2) subdomain
// 3) pad-gebaseerde slug-fallback 4) default-variant, zie
// lib/variant/in-memory-variant-resolver.ts voor de exacte logica. Proxy
// kent uitsluitend de VariantResolver-interface, niet de implementatie. De
// opgeloste variant wordt als request-header doorgegeven, zodat elke Server
// Component via lib/variant/get-active-variant.ts dezelfde, al-opgeloste
// variant leest — geen route hoeft zelf domein/slug te interpreteren.
//
// Proxy draait standaard op de Node.js-runtime (Next.js 16+), dus een
// Payload-aanroep binnen de resolver is hier toegestaan.
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const host = request.headers.get("host") ?? "";
  const slug = await variantResolver.resolveSlug(host, request.nextUrl.pathname);
  response.headers.set("x-variant-slug", slug);
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
