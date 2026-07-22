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
