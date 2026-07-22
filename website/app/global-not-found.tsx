import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pagina niet gevonden — MijnLeerlijn",
};

// Vereist zodra de app meerdere root layouts heeft (app/(frontend)/layout.tsx
// en app/(payload)/layout.tsx, geen gedeelde top-level app/layout.tsx meer) —
// Next.js kan dan geen enkel 404-scherm meer samenstellen uit "de" root
// layout. Zie next.config.ts (experimental.globalNotFound) en
// node_modules/next/dist/docs/.../not-found.md. Bewust minimaal: geen fonts/
// providers, dit scherm verschijnt alleen bij een pad dat helemaal nergens
// bij hoort (niet bij (frontend), niet bij (payload)).
export default function GlobalNotFound() {
  return (
    <html lang="nl">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: "#9ca3af",
              textTransform: "uppercase",
            }}
          >
            404
          </p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "#111827" }}>Deze pagina bestaat niet</h1>
          <Link href="/" style={{ fontSize: "0.875rem", color: "#1588c9" }}>
            Terug naar de homepage
          </Link>
        </div>
      </body>
    </html>
  );
}
