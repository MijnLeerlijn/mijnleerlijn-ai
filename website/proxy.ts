import { NextResponse, type NextRequest } from "next/server";
import { variantResolver } from "@/lib/variant/variant-resolver-instance";
import { getRootDomain } from "@/config/env";
import { defaultVariant } from "@/config/variants";

// Variant-herkenning — zie docs/ARCHITECTURE.md §Variant-herkenningsmechanisme
// en docs/MULTI-VARIANT-STRATEGY.md.
//
// Bestandsnaam: PLATFORM-FOUNDATION.md noemt dit "middleware.ts" (de op dat
// moment geldige Next.js-conventie). Next.js 16.2.10 (de geïnstalleerde
// versie) heeft die conventie hernoemd naar "proxy.ts" — zelfde functie,
// nieuwe naam.
//
// Multi-brand variants (2026-07-30), dubbele bereikbaarheid (2026-08-11):
// echte resolutie via variantResolver (lib/variant/variant-resolver-instance.ts)
// — 1) custom domain 2) subdomein 3) pad-gebaseerde slug 4) default-variant,
// zie lib/variant/in-memory-variant-resolver.ts voor de exacte logica. Elke
// variant zonder eigen custom_domain is sindsdien generiek via ZOWEL
// subdomein ALS pad bereikbaar — geen per-variant code. Proxy kent
// uitsluitend de VariantResolver-interface, niet de implementatie.
//
// Canonicalisatie: wanneer een verzoek op de hoofdsite (kaal root-domein of
// www) een geldige, niet-standaard variant-slug als eerste padsegment heeft,
// stuurt proxy.ts een permanente (308) redirect naar de subdomeinvorm — dat
// is de ENE plek waar deze beslissing wordt genomen, geen tweede,
// parallelle implementatie in een paginacomponent (zie
// app/(frontend)/(public)/[variantSlug]/page.tsx, die bewust NIET
// redirect). Bewust gegate op het binnenkomende host: op elk ander host
// (localhost, een Vercel-preview-deployment) bestaat de subdomeinvorm niet,
// dus blijft de padvorm daar gewoon rechtstreeks renderen — dat is de
// gedocumenteerde manier om een variant lokaal te simuleren zonder op DNS
// te wachten.
//
// Bijkomend effect: dit verhelpt ook een eerder live bug waarbij
// `fetch("/api/helpdesk/ask")` (pad-relatief, geen variant-prefix) bij
// padgebaseerde toegang de verkeerde (standaard-)variant herkende — de
// redirect gebeurt vóórdat client-JS draait, dus tegen de tijd dat die
// fetch loopt staat de browser al op het juiste subdomein, en
// subdomein-matching is (i.t.t. pad-matching) hostgebaseerd, dus
// onafhankelijk van welk pad een latere fetch precies aanroept.
//
// De opgeloste variant wordt als request-header doorgegeven via het
// gedocumenteerde `NextResponse.next({ request: { headers } })`-patroon
// (node_modules/next/dist/docs/.../proxy.md, "Setting Headers"), zodat elke
// Server Component via lib/variant/get-active-variant.ts dezelfde,
// al-opgeloste variant leest — geen route hoeft zelf domein/slug te
// interpreteren.
//
// Proxy draait standaard op de Node.js-runtime (Next.js 16+), dus een
// Payload-aanroep binnen de resolver is hier toegestaan.
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const slug = await variantResolver.resolveSlug(host, request.nextUrl.pathname);

  const schoneHost = (host.split(":")[0] ?? "").toLowerCase();
  const hoofddomein = getRootDomain().toLowerCase();
  const opHoofdsite = schoneHost === hoofddomein || schoneHost === `www.${hoofddomein}`;

  // Een niet-standaard slug die op de hoofdsite is opgelost, kan uitsluitend
  // via de pad-gebaseerde stap van de resolver tot stand zijn gekomen (zie
  // in-memory-variant-resolver.ts stap 2/3: subdomein- en custom_domain-
  // matches vereisen allebei een host die hier al is uitgesloten) — dus
  // altijd de canonieke subdomeinvorm, geen aparte herleiding nodig.
  if (opHoofdsite && slug !== defaultVariant.slug) {
    const restPad = request.nextUrl.pathname.split("/").filter(Boolean).slice(1).join("/");
    const canoniekeUrl = new URL(`https://${slug}.${hoofddomein}/${restPad}`);
    canoniekeUrl.search = request.nextUrl.search;
    return NextResponse.redirect(canoniekeUrl, 308);
  }

  const headers = new Headers(request.headers);
  headers.set("x-variant-slug", slug);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    /*
     * Sluit statische bestanden en Next.js-interne paden uit.
     */
    "/((?!_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
