import { NextResponse } from "next/server";

// Gereserveerd integratiepunt voor on-demand ISR-revalidatie, aangeroepen
// vanuit Payload bij publiceren (Fase 4/5). Zie docs/ARCHITECTURE.md
// §Rendering-strategie en docs/PLATFORM-FOUNDATION.md §9.
export async function POST() {
  return NextResponse.json(
    { error: "Nog niet geïmplementeerd — zie IMPLEMENTATION-PLAN.md Fase 4/5." },
    { status: 501 }
  );
}
