import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { maakRateLimiter } from "@/lib/contact/validate";

const GELDIGE_RATINGS = ["nuttig", "niet_nuttig"] as const;
type Rating = (typeof GELDIGE_RATINGS)[number];

// Publieke tegenhanger van app/api/assistant/feedback/route.ts — Helpdesk
// MVP 1.0. Geen login (zelfde reden als app/api/helpdesk/ask/route.ts).
// Ter compensatie van het ontbreken van de eigenaarscontrole die de interne
// route wél heeft (die vergelijkt met de ingelogde gebruiker — voor een
// anonieme bezoeker bestaat dat niet): accepteert UITSLUITEND feedback op
// conversaties met source "helpdesk" én user null — een anonieme aanvraag
// kan zo nooit feedback op andermans (of een intern /assistant-)gesprek
// zetten, ook niet met een geraden conversationId.
const rateLimiter = maakRateLimiter(10 * 60 * 1000, 20);

function klantIp(request: NextRequest): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "onbekend"
  );
}

export async function POST(request: NextRequest) {
  const ip = klantIp(request);
  if (!rateLimiter.magVerder(ip)) {
    return NextResponse.json({ error: "Te veel pogingen. Probeer het straks opnieuw." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const { conversationId, rating } = (body ?? {}) as { conversationId?: unknown; rating?: unknown };

  if (typeof conversationId !== "number") {
    return NextResponse.json({ error: "conversationId is verplicht." }, { status: 400 });
  }
  if (typeof rating !== "string" || !GELDIGE_RATINGS.includes(rating as Rating)) {
    return NextResponse.json({ error: "rating moet 'nuttig' of 'niet_nuttig' zijn." }, { status: 400 });
  }

  const payload = await getPayload({ config });

  try {
    const gesprek = await payload
      .findByID({ collection: "assistant-conversations", id: conversationId, overrideAccess: true, depth: 0 })
      .catch(() => null);

    if (!gesprek || gesprek.source !== "helpdesk" || gesprek.user) {
      return NextResponse.json({ error: "Dit gesprek is niet gevonden." }, { status: 404 });
    }

    await payload.update({
      collection: "assistant-conversations",
      id: conversationId,
      overrideAccess: true,
      data: { feedbackRating: rating as Rating },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/helpdesk/feedback] Opslaan mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
