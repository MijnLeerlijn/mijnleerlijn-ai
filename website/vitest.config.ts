import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Zie docs/IMPLEMENTATION-PLAN.md Fase 2 stap 7. Vitest + React Testing
// Library — gekozen omdat het native ESM/Turbopack-vriendelijk is en door
// Next.js zelf als testrunner wordt aanbevolen; geen extra library toegevoegd
// zonder duidelijke noodzaak (tests waren expliciet gevraagd voor deze fase).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    exclude: ["node_modules", ".next", "e2e"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
