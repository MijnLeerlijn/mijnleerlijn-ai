import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin, isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

// Haalt één eerder gesprek volledig op (vraag, antwoord, bronnen, feedback)
// — voor wanneer je een item uit de "gesprekken"-zijbalk op /assistant
// opnieuw opent. Alleen de eigen gesprekken (of een beheerder, alles).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json(
      { error: "Alleen ingelogde gebruikers mogen gesprekken bekijken." },
      { status: 403 }
    );
  }

  const numeriekeId = Number(id);
  if (!Number.isFinite(numeriekeId)) {
    return NextResponse.json({ error: "Ongeldig gesprek-ID." }, { status: 400 });
  }

  try {
    const gesprek = await payload.findByID({
      collection: "assistant-conversations",
      id: numeriekeId,
      overrideAccess: true,
      depth: 0,
    });

    const eigenaarId = typeof gesprek.user === "number" ? gesprek.user : gesprek.user?.id;
    if (!isAdmin(sessieControle.user) && eigenaarId !== sessieControle.user!.id) {
      return NextResponse.json({ error: "Je mag alleen je eigen gesprekken bekijken." }, { status: 403 });
    }

    return NextResponse.json({
      id: gesprek.id,
      question: gesprek.question,
      hasAnswer: gesprek.hasAnswer,
      answer: gesprek.answer,
      reasoning: gesprek.reasoning,
      confidence: gesprek.confidence,
      sources: gesprek.sources ?? [],
      feedbackRating: gesprek.feedbackRating,
      feedbackMissing: gesprek.feedbackMissing,
      createdAt: gesprek.createdAt,
    });
  } catch {
    return NextResponse.json({ error: "Gesprek niet gevonden." }, { status: 404 });
  }
}
