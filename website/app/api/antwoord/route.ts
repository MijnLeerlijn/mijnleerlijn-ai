import { NextResponse } from "next/server";

// Gereserveerd integratiepunt voor de AI-laag (Fase 6). Roept in de
// implementatie uitsluitend services/ai.ts en services/retrieval.ts aan —
// nooit rechtstreeks een externe AI-/zoekdienst vanuit deze route. Zie
// docs/PLATFORM-FOUNDATION.md §9 en docs/AI-KNOWLEDGE-STRATEGY.md.
export async function POST() {
  return NextResponse.json(
    { error: "Nog niet geïmplementeerd — zie IMPLEMENTATION-PLAN.md Fase 6." },
    { status: 501 }
  );
}
