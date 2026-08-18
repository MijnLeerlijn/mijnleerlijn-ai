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

/**
 * Traineromgeving V1, Ronde 1 (2026-08-19) — volledige origin (protocol +
 * host + poort) van trainers.{ROOT_DOMAIN}, afgeleid i.p.v. een aparte
 * env-var: hostnaam-voorvoegsel via getRootDomain() hierboven (dezelfde bron
 * als proxy.ts se "trainers.{ROOT_DOMAIN}"-routering), protocol+poort via
 * NEXT_PUBLIC_SERVER_URL (dezelfde bron als Payload's eigen `serverURL`,
 * zie payload.config.ts) — zo blijft dit altijd kloppen met de omgeving
 * waarin de app daadwerkelijk draait, zonder een derde, potentieel uit de
 * pas lopende env-var te introduceren.
 *
 * ENIGE huidige gebruiker: payload.config.ts se `csrf`-allowlist. Zonder
 * deze allowlist-vermelding wijst Payload's eigen extractJWT()
 * (node_modules/payload/dist/auth/extractJWT.js) élke fetch()-POST vanaf
 * trainers.{ROOT_DOMAIN} af die op Payload's eigen req.user leunt (bv.
 * /api/trainer-accounts/logout) — zo'n fetch() stuurt altijd een
 * Origin-header, en die kan nooit gelijk zijn aan serverURL zelf (ander
 * subdomein). Exact dezelfde bugklasse als lib/auth/verify-session.ts
 * beschrijft (daar ontdekt via een echt productie-incident), hier vooraf
 * gevonden door de Payload-broncode te lezen vóórdat de loginpagina
 * gebouwd werd.
 */
export function getTrainersOrigin(): string {
  const serverUrl = optionalEnv("NEXT_PUBLIC_SERVER_URL") ?? "http://localhost:3000";
  const { protocol, port } = new URL(serverUrl);
  return `${protocol}//trainers.${getRootDomain()}${port ? `:${port}` : ""}`;
}
