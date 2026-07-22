import "@testing-library/jest-dom/vitest";

// payload.config.ts vereist deze variabelen al bij het importeren (buildConfig
// draait top-level) — tests die via services/payload.ts of payload/ modules
// importeren, hebben ze dus nodig, ook al wordt er nooit echt verbonden met
// Postgres in unit tests. Nep-maar-geldig genoeg om te evalueren, geen echte
// geheimen.
process.env.DATABASE_URI ??= "postgres://test:test@localhost:5432/test";
process.env.PAYLOAD_SECRET ??= "test-secret-niet-voor-productie";
