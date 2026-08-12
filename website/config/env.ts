// Centrale plek voor omgevingsvariabelen — geen geheimen, alleen toegang tot
// process.env met duidelijke foutafhandeling. Zie docs/PLATFORM-FOUNDATION.md
// §1 ("config/ — geen geheimen") en Fase 4 Stap 2 ("duidelijke foutafhandeling
// wanneer verplichte configuratie ontbreekt").

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Verplichte variabele — gooit direct een begrijpelijke fout wanneer die ontbreekt. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Ontbrekende verplichte omgevingsvariabele: ${name}. Zie .env.example en docs/IMPLEMENTATION-PLAN.md Fase 4.`
    );
  }
  return value;
}

/** Optionele variabele — geeft `undefined` terug in plaats van te gooien. */
export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/**
 * Verplicht in productie, optioneel in development — voor integraties die
 * lokaal een expliciete development-adapter gebruiken (zie
 * services/email.ts, services/storage.ts) maar in productie nooit stilzwijgend
 * mogen ontbreken.
 */
export function requireInProduction(name: string): string | undefined {
  const value = optionalEnv(name);
  if (!value && isProduction()) {
    throw new Error(
      `Ontbrekende verplichte omgevingsvariabele in productie: ${name}. Zonder deze variabele mag de applicatie niet stilzwijgend op een development-fallback draaien.`
    );
  }
  return value;
}

/**
 * Root-domein voor generieke subdomein-/padroutering van varianten (zie
 * proxy.ts, lib/variant/in-memory-variant-resolver.ts,
 * lib/variant/variant-public-url.ts) — bewust een vaste, expliciete waarde
 * i.p.v. afgeleid uit een variant-databaserecord. Dat laatste veroorzaakte
 * eerder een www/non-www-mismatch (productie se standaardvariant-record
 * heeft "www.mijnleerlijn.chat", de gewenste subdomeinvorm is
 * "{slug}.mijnleerlijn.chat" zonder www) — zie de sessiegeschiedenis over
 * multi-variant domeinrouting. `NEXT_PUBLIC_` omdat de admin-UI
 * (VariantenView.tsx, client-side) 'm ook nodig heeft. Development-fallback
 * "localhost" (zonder poort — vergeleken wordt altijd tegen een host zonder
 * poort, zie de `schoneHost`-normalisatie in in-memory-variant-resolver.ts)
 * — subdomeinen zijn daar toch niet bereikbaar, alleen de padvorm werkt
 * lokaal (bewust, zie proxy.ts se host-gating van de redirect).
 *
 * BUG (ontdekt via echte browserverificatie, opgelost in dezelfde wijziging):
 * dit las aanvankelijk via `requireInProduction("NEXT_PUBLIC_ROOT_DOMAIN")`
 * — een dynamische `process.env[name]`-opzoeking. Next.js inlinet
 * `NEXT_PUBLIC_*`-variabelen in de browserbundel uitsluitend bij een
 * statische, letterlijke `process.env.NEXT_PUBLIC_X`-verwijzing (zie
 * node_modules/next/dist/docs/01-app/02-guides/environment-variables.md
 * §Bundling Environment Variables for the Browser, "dynamic lookups will
 * NOT be inlined") — in de browser bleef `process.env.NEXT_PUBLIC_ROOT_DOMAIN`
 * dus altijd undefined, ongeacht .env, en crashte VariantenView.tsx
 * (client-side) direct bij het renderen. Vandaar hieronder een letterlijke
 * verwijzing i.p.v. de generieke requireInProduction/optionalEnv-helpers.
 */
export function getRootDomain(): string {
  const waarde = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!waarde && isProduction()) {
    throw new Error(
      "Ontbrekende verplichte omgevingsvariabele in productie: NEXT_PUBLIC_ROOT_DOMAIN. Zonder deze variabele mag de applicatie niet stilzwijgend op een development-fallback draaien."
    );
  }
  return waarde || "localhost";
}
