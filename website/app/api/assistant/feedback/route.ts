import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin, isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

const GELDIGE_RATINGS = ["nuttig", "niet_nuttig"] as const;
type Rating = (typeof GELDIGE_RATINGS)[number];

// Slaat 👍/👎-feedback op een assistant-conversation op — zie
// payload/collections/AssistantConversations.ts (create/update staan daar
// dicht voor de normale API, dit is de enige plek die feedbackRating/
// feedbackMissing mag schrijven, via overrideAccess: true). Alleen de
// gebruiker die de vraag zelf stelde (of een beheerder) mag feedback geven
// op een gesprek — voorkomt dat de ene redacteur andermans feedback
// overschrijft.
//
// Body: { conversationId: number; rating: "nuttig" | "niet_nuttig"; missing?: string }.
// `missing` ("Wat miste er?") is alleen relevant bij rating "niet_nuttig".
export async function POST(request: NextRequest) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen ingelogde gebruikers mogen feedback geven." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const { conversationId, rating, missing } = (body ?? {}) as {
    conversationId?: unknown;
    rating?: unknown;
    missing?: unknown;
  };

  if (typeof conversationId !== "number") {
    return NextResponse.json({ error: "conversationId is verplicht." }, { status: 400 });
  }
  if (typeof rating !== "string" || !GELDIGE_RATINGS.includes(rating as Rating)) {
    return NextResponse.json({ error: "rating moet 'nuttig' of 'niet_nuttig' zijn." }, { status: 400 });
  }

  try {
    const gesprek = await payload.findByID({
      collection: "assistant-conversations",
      id: conversationId,
      overrideAccess: true,
      depth: 0,
    });
    const eigenaarId = typeof gesprek.user === "number" ? gesprek.user : gesprek.user?.id;
    if (!isAdmin(sessieControle.user) && eigenaarId !== sessieControle.user!.id) {
      return NextResponse.json(
        { error: "Je mag alleen feedback geven op je eigen gesprekken." },
        { status: 403 }
      );
    }

    await payload.update({
      collection: "assistant-conversations",
      id: conversationId,
      overrideAccess: true,
      data: {
        feedbackRating: rating as Rating,
        feedbackMissing: rating === "niet_nuttig" && typeof missing === "string" ? missing.trim() : null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/assistant/feedback] Opslaan mislukt:", error);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
